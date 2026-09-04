#!/usr/bin/env node
/**
 * Production dependency audit gate.
 *
 * Replaces `npm audit --audit-level=high`, which gated on devDependencies too
 * and could never pass: ~19 of its 25 high findings were transitive reports of
 * an old dev toolchain (jest, ts-jest, @swc/cli), and one production chain has
 * no fixed version at all. A gate that cannot pass stops security fixes from
 * merging, which is the opposite of its job.
 *
 * This gate:
 *   - audits production dependencies only (`--omit=dev`), because that is what
 *     ships to users,
 *   - fails on any high or critical finding that is not explicitly accepted
 *     below, so new findings still block,
 *   - accepts *individual advisories*, not whole packages, so a newly disclosed
 *     vulnerability in an already-accepted package still blocks,
 *   - fails if an accepted entry stops being reported, so the list cannot rot
 *     into permanent noise.
 *
 * Dev-dependency advisories are still worth fixing. They are tracked as
 * toolchain modernisation work rather than as a merge blocker.
 */

import { execFileSync } from 'node:child_process';

/**
 * Marks a package npm reports only because something it depends on is
 * vulnerable — its `via` list holds package names rather than advisory objects.
 * It has no advisory of its own to pin, so it is accepted as a consequence of
 * the root entry. If such a package ever gains a direct advisory, the gate
 * blocks so that advisory gets reviewed on its own merits.
 */
const TRANSITIVE = Symbol('transitive');

/**
 * Accepted high/critical findings in production dependencies.
 *
 * Every entry needs a reason and an owner-visible exit condition. "It is
 * annoying" is not a reason. `advisories` pins the exact npm advisory ids that
 * are accepted, so a new CVE in an already-listed package is not silently
 * inherited by the acceptance.
 */
const ACCEPTED = {
    mysql2: {
        reason:
            'Transitive dep of prisma\'s bundled MySQL driver adapter. Lucky only ' +
            'ever connects to Postgres (prisma/schema.prisma: provider = "postgresql") ' +
            'so the vulnerable mysql_clear_password auth-downgrade path is never ' +
            'exercised. No non-major fix exists: prisma@7.9.1 bundles mysql2@3.15.3, ' +
            "and npm's suggested fix (`prisma@6.19.3`) is a major-version downgrade, " +
            'not worth taking for a driver this app never uses.',
        until: 'prisma ships a version bundling mysql2>=3.22.0 (tracked in #2136)',
        // If another production dependency ever pulls mysql2 in directly,
        // that's a different exposure than "bundled inside an unused prisma
        // driver adapter" — re-review before letting the exception cover it.
        requireTransitive: true,
        advisories: {
            1153173:
                'GHSA-3f6p-5ww8-9rcr: MySQL2 auth plugin downgrade leaks plaintext credentials',
            1158532:
                'MySQL2 unbounded zlib inflate in the compressed protocol handler allows a decompression-bomb DoS. Same exposure as the entry above: reaching it requires speaking the MySQL wire protocol, which this app never does.',
        },
    },
};

// The policy above is only worth something if every entry actually carries its
// justification. Enforce it rather than trusting the comment.
for (const [name, entry] of Object.entries(ACCEPTED)) {
    for (const field of ['reason', 'until']) {
        if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
            console.error(
                `scripts/audit-gate.mjs: ACCEPTED["${name}"] is missing a non-empty "${field}".`,
            );
            process.exit(1);
        }
    }
    const pinned = entry.advisories;
    const pinnedIsValid =
        pinned === TRANSITIVE ||
        (typeof pinned === 'object' && pinned !== null && Object.keys(pinned).length > 0);
    if (!pinnedIsValid) {
        console.error(
            `scripts/audit-gate.mjs: ACCEPTED["${name}"].advisories must be TRANSITIVE or a ` +
                'non-empty map of advisory id to description.',
        );
        process.exit(1);
    }
}

// npm exits non-zero whenever findings exist, which makes execFileSync throw.
// The report we need is still on the error object, so judge that instead.
const runAudit = () => {
    const opts = {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 32 * 1024 * 1024,
    };
    try {
        return execFileSync('npm', ['audit', '--omit=dev', '--json'], opts);
    } catch (error) {
        if (typeof error.stdout === 'string' && error.stdout.length > 0) return error.stdout;
        throw error;
    }
};

/**
 * Judges one `npm audit` response. Pure, so the caller can run it against a
 * second read: npm audit intermittently answers with a truncated advisory set,
 * and an absent package is indistinguishable from a fixed one.
 */
const evaluate = (vulnerabilities) => {
const blocking = [];
const accepted = [];
/** package name -> advisory ids actually reported this run */
const reportedAdvisories = new Map();

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (vulnerability.severity !== 'high' && vulnerability.severity !== 'critical') continue;

    const entry = ACCEPTED[name];
    const direct = vulnerability.via.filter((source) => typeof source === 'object');
    const summary = { name, severity: vulnerability.severity, range: vulnerability.range };

    if (!entry) {
        blocking.push({ ...summary, why: 'not accepted' });
        continue;
    }

    if (entry.requireTransitive && vulnerability.isDirect) {
        blocking.push({
            ...summary,
            why: 'accepted only while transitive, but is now a direct production dependency',
        });
        continue;
    }

    if (entry.advisories === TRANSITIVE) {
        if (direct.length > 0) {
            blocking.push({
                ...summary,
                why:
                    'accepted only as a transitive report, but now carries its own advisory: ' +
                    direct.map((advisory) => advisory.url ?? advisory.source).join(', '),
            });
            continue;
        }
        accepted.push(summary);
        continue;
    }

    const unpinned = direct.filter(
        (advisory) => !Object.hasOwn(entry.advisories, String(advisory.source)),
    );
    if (unpinned.length > 0) {
        blocking.push({
            ...summary,
            why:
                'advisory not in the accepted list: ' +
                unpinned
                    .map((advisory) => `${advisory.source} ${advisory.url ?? advisory.title}`)
                    .join('; '),
        });
        continue;
    }

    reportedAdvisories.set(
        name,
        new Set(direct.map((advisory) => String(advisory.source))),
    );
    accepted.push(summary);
}

// An acceptance that is no longer reported is a fix worth noticing. Check both
// whole packages and the individual advisories pinned under them. A package
// that is currently blocking is still very much reported — it must not also be
// announced as stale, or the real reason gets buried under a wrong one.
const stale = [];
for (const [name, entry] of Object.entries(ACCEPTED)) {
    if (blocking.some((finding) => finding.name === name)) continue;
    if (!accepted.some((finding) => finding.name === name)) {
        stale.push(`${name} (no longer reported at all)`);
        continue;
    }
    if (entry.advisories === TRANSITIVE) continue;
    const reported = reportedAdvisories.get(name) ?? new Set();
    for (const [id, label] of Object.entries(entry.advisories)) {
        if (!reported.has(id)) stale.push(`${name} advisory ${id} (${label})`);
    }
}

return { blocking, accepted, stale };
};

const first = evaluate(JSON.parse(runAudit()).vulnerabilities ?? {});

// A truncated read can only ever produce a false PASS: a dropped package is
// indistinguishable from a fixed one, whether it was an acceptance (surfaces as
// stale) or an unaccepted finding (surfaces as nothing at all). So every run
// that is about to pass gets a second opinion. A run that already blocks does
// not need one: a second read could only add findings, and we fail either way.
let { blocking, accepted, stale } = first;
if (blocking.length === 0) {
    const second = evaluate(JSON.parse(runAudit()).vulnerabilities ?? {});
    // First read blocked on nothing, so the union is just the second's.
    blocking = second.blocking;
    // Only call an acceptance dead when both reads agree it is gone.
    const confirmed = new Set(second.stale);
    stale = stale.filter((entry) => confirmed.has(entry));
    if (second.accepted.length > accepted.length) accepted = second.accepted;
    if (blocking.length > 0 || stale.length !== first.stale.length) {
        console.error(
            'note: npm audit disagreed with itself across two reads; ' +
                'trusting the read that reported more.',
        );
    }
}

for (const { severity, name, range } of accepted) {
    console.log(`accepted  ${severity.padEnd(8)} ${name} (${range})`);
}

if (stale.length > 0) {
    console.error(
        '\nThese are accepted in scripts/audit-gate.mjs but are no longer reported:\n' +
            stale.map((entry) => `  - ${entry}`).join('\n') +
            '\nThey are fixed. Delete them so the list keeps meaning something.',
    );
    process.exit(1);
}

if (blocking.length > 0) {
    console.error(
        `\n${blocking.length} unaccepted high/critical finding(s) in production dependencies:`,
    );
    for (const { severity, name, range, why } of blocking) {
        console.error(`  ${severity.padEnd(8)} ${name} (${range}) — ${why}`);
    }
    console.error(
        '\nFix them, or add an entry to ACCEPTED in scripts/audit-gate.mjs with a reason, an ' +
            'exit condition, and the exact advisory ids. Run `npm audit --omit=dev` for detail.',
    );
    process.exit(1);
}

console.log('\nNo unaccepted high/critical findings in production dependencies.');
