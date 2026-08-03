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
    // TEMPORARY. Remove with the react-router v8 migration (#1878).
    'react-router': {
        reason:
            'Only the RSC-mode CSRF bypass is left; the other four advisories were cleared by ' +
            'bumping react-router-dom to ^7.18.1. This one is fixed only in 8.3.0 and does not ' +
            'apply here, since this app is a Vite SPA and does not use RSC. Clearing it cannot ' +
            'be a version bump: react-router-dom has no 8.x line (v8 consolidated it into ' +
            'react-router), so the fix means switching the import source across ~49 frontend ' +
            'files and dropping react-router-dom. Landing that as its own reviewable change ' +
            'rather than smuggling a router migration into a CI config PR.',
        until: 'The react-router v8 migration lands (#1878). This entry must go with it.',
        advisories: {
            1124282: 'GHSA-qwww-vcr4-c8h2, RSC mode CSRF bypass (RSC only; this app is an SPA)',
        },
    },
    'react-router-dom': {
        reason: 'Transitive via react-router.',
        until: 'Same as react-router (#1878).',
        advisories: TRANSITIVE,
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

const { vulnerabilities = {} } = JSON.parse(runAudit());
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
