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
 *   - fails if an accepted entry stops being reported, so the list cannot rot
 *     into permanent noise.
 *
 * Dev-dependency advisories are still worth fixing. They are tracked as
 * toolchain modernisation work rather than as a merge blocker.
 */

import { execFileSync } from 'node:child_process';

/**
 * Accepted high/critical findings in production dependencies.
 *
 * Every entry needs a reason and an owner-visible exit condition. "It is
 * annoying" is not a reason.
 */
const ACCEPTED = {
    '@discordjs/node-pre-gyp': {
        reason:
            'No fixed version exists. Reached via @discordjs/opus, which is already at its ' +
            'latest (0.10.0), and every published version (0.5.3 through 0.10.0) depends on ' +
            "this package. npm's suggested remediation is @discordjs/opus@0.2.1, a downgrade " +
            'to a 2021 release that swaps in unmaintained node-pre-gyp plus patch-package and ' +
            'would break voice, the bot\'s core function.',
        until: 'A @discordjs/opus release drops or replaces @discordjs/node-pre-gyp.',
    },
    // The four below are the same advisory as above, cascading down one chain:
    // @discordjs/opus -> @discordjs/node-pre-gyp -> rimraf -> glob -> minimatch
    // -> brace-expansion. They resolve together or not at all. Overrides do not
    // help: forcing brace-expansion tree-wide was attempted three ways (range
    // override, exact-version override, full lock regeneration) and npm keeps
    // the old copies, because the intermediate minimatch versions request
    // ^1.1.7 and ^2.0.2.
    rimraf: { reason: 'Transitive via @discordjs/node-pre-gyp.', until: 'Same as @discordjs/node-pre-gyp.' },
    glob: { reason: 'Transitive via rimraf.', until: 'Same as @discordjs/node-pre-gyp.' },
    minimatch: { reason: 'Transitive via glob.', until: 'Same as @discordjs/node-pre-gyp.' },
    'brace-expansion': { reason: 'Transitive via minimatch.', until: 'Same as @discordjs/node-pre-gyp.' },

    // TEMPORARY. Remove with the react-router v8 migration.
    'react-router': {
        reason:
            'Open redirect, fixed in react-router 8.3.0. Cannot be a version bump: ' +
            'react-router-dom has no 8.x line (v8 consolidated it into react-router), so the ' +
            'fix means switching the import source across ~49 frontend files and dropping ' +
            'react-router-dom. Landing that as its own reviewable change rather than smuggling ' +
            'a router migration into a CI config PR.',
        until: 'The react-router v8 migration lands. This entry must go with it.',
    },
};

// npm exits non-zero whenever findings exist, which makes execFileSync throw.
// The report we need is still on the error object, so judge that instead.
const runAudit = () => {
    const opts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 };
    try {
        return execFileSync('npm', ['audit', '--omit=dev', '--json'], opts);
    } catch (error) {
        if (typeof error.stdout === 'string' && error.stdout.length > 0) return error.stdout;
        throw error;
    }
};

const raw = runAudit();

const { vulnerabilities = {} } = JSON.parse(raw);
const blocking = [];
const accepted = [];

for (const [name, v] of Object.entries(vulnerabilities)) {
    if (v.severity !== 'high' && v.severity !== 'critical') continue;
    (ACCEPTED[name] ? accepted : blocking).push({ name, severity: v.severity, range: v.range });
}

const stale = Object.keys(ACCEPTED).filter((name) => !accepted.some((a) => a.name === name));

for (const { name, severity, range } of accepted) {
    console.log(`accepted  ${severity.padEnd(8)} ${name} (${range})`);
}

if (stale.length > 0) {
    console.error(
        `\nThese entries are accepted in scripts/audit-gate.mjs but are no longer reported:\n` +
            stale.map((n) => `  - ${n}`).join('\n') +
            `\nThey are fixed. Delete them so the list keeps meaning something.`,
    );
    process.exit(1);
}

if (blocking.length > 0) {
    console.error(`\n${blocking.length} unaccepted high/critical finding(s) in production dependencies:`);
    for (const { name, severity, range } of blocking) {
        console.error(`  ${severity.padEnd(8)} ${name} (${range})`);
    }
    console.error(
        `\nFix them, or add an entry to ACCEPTED in scripts/audit-gate.mjs with a reason and ` +
            `an exit condition. Run \`npm audit --omit=dev\` for detail.`,
    );
    process.exit(1);
}

console.log(`\nNo unaccepted high/critical findings in production dependencies.`);
