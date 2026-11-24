import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const script = fileURLToPath(new URL('./deploy/bot-drain.sh', import.meta.url))
const toPosix = (p) => p.split(String.fromCharCode(92)).join('/')

// Runs `body` with bot-drain.sh sourced, log/notify/docker_compose stubbed and
// the listener count read from $dir/listeners (one line consumed per read, the
// last one repeating). Returns stdout lines plus the temp dir for inspection.
function run(body, { listeners = ['0'], env = {}, since } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'lucky-bot-drain-'))
    const d = toPosix(dir)
    writeFileSync(join(dir, 'listeners'), listeners.join('\n') + '\n')
    if (since !== undefined) writeFileSync(join(dir, 'since'), `${since}\n`)
    writeFileSync(
        join(dir, 'count.sh'),
        `#!/bin/bash\nf="${d}/listeners"\nline=$(head -1 "$f")\n[ "$(wc -l <"$f")" -gt 1 ] && sed -i 1d "$f"\n[ "$line" = fail ] && exit 1\necho "$line"\n`,
    )
    const prelude = [
        'log() { echo "LOG $*"; }',
        'notify() { echo "NOTIFY $2: $3"; }',
        'docker_compose() { echo "COMPOSE $*"; }',
        'docker() { case "$1 $*" in *Health*) echo "${FAKE_HEALTH:-healthy}";; *Config.Image*) echo ghcr.io/x/lucky-bot:latest;; *"{{.Image}}"*) echo sha256:old;; tag*) echo "TAG ${*:2}";; *) return 1;; esac; }',
        `source "${toPosix(script)}"`,
    ].join('\n')
    const r = spawnSync('bash', ['-c', `${prelude}\n${body}`], {
        encoding: 'utf8',
        env: {
            ...process.env,
            BOT_LISTENERS_CMD: `bash ${d}/count.sh`,
            BOT_DEFERRED_SINCE_FILE: `${d}/since`,
            BOT_DRAIN_PID_FILE: `${d}/pid`,
            LOCK_DIR: `${d}/lock`,
            LOCK_PID_FILE: `${d}/lock/pid`,
            BOT_DRAIN_POLL_SECONDS: '0',
            IMAGE_TAG: 'new1234',
            ...env,
        },
    })
    return { status: r.status, out: r.stdout, err: r.stderr, dir }
}

const decide = (opts, arg = '') =>
    run(
        `bot_drain_decide ${arg}; echo "DECISION $BOT_DRAIN_DECISION $BOT_DRAIN_LISTENERS"`,
        opts,
    )

test('recreates when nobody is listening', () => {
    const r = decide({ listeners: ['0'] })
    try {
        assert.match(r.out, /DECISION recreate 0/)
        assert.equal(existsSync(join(r.dir, 'since')), false)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('defers while someone listens and records when the wait started', () => {
    const r = decide({ listeners: ['2'] })
    try {
        assert.match(r.out, /DECISION defer 2/)
        assert.match(readFileSync(join(r.dir, 'since'), 'utf8'), /^\d+\n$/)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('keeps the first deferral time across deploys', () => {
    const since = Math.floor(Date.now() / 1000) - 60
    const r = decide({ listeners: ['1'], since })
    try {
        assert.match(r.out, /DECISION defer 1/)
        assert.equal(
            readFileSync(join(r.dir, 'since'), 'utf8').trim(),
            String(since),
        )
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('recreates once the wait passes the timeout', () => {
    const since = Math.floor(Date.now() / 1000) - 7200
    const r = decide({
        listeners: ['1'],
        since,
        env: { BOT_DRAIN_TIMEOUT_SECONDS: '3600' },
    })
    try {
        assert.match(r.out, /DECISION recreate 1/)
        assert.match(r.out, /deferred for 120 min/)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('DEPLOY_FORCE_BOT_RESTART skips the wait', () => {
    const r = decide({
        listeners: ['3'],
        env: { DEPLOY_FORCE_BOT_RESTART: 'true' },
    })
    try {
        assert.match(r.out, /DECISION recreate/)
        assert.match(r.out, /DEPLOY_FORCE_BOT_RESTART/)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('a schema change does not wait for listeners', () => {
    const r = decide({ listeners: ['2'] }, 'schema_changed')
    try {
        assert.match(r.out, /DECISION recreate 2/)
        assert.match(r.out, /schema changed/)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('an unreadable or negative count recreates as before', () => {
    for (const value of ['fail', '-1', 'garbage']) {
        const r = decide({ listeners: [value] })
        try {
            assert.match(r.out, /DECISION recreate \n/, value)
            assert.match(r.out, /listener count unavailable/, value)
        } finally {
            rmSync(r.dir, { recursive: true, force: true })
        }
    }
})

test('the watcher waits for the room to empty, then recreates under the lock', () => {
    const r = run(
        'date +%s > "$BOT_DEFERRED_SINCE_FILE"; bot_drain_watch; echo "EXIT $?"',
        { listeners: ['2', '1', '0'] },
    )
    try {
        assert.equal(r.status, 0, r.err)
        const recreated = r.out.indexOf('COMPOSE up -d --no-deps bot')
        assert.ok(recreated > 0, r.out)
        assert.equal(r.out.match(/deferring/g)?.length, 2)
        assert.match(r.out, /EXIT 0/)
        assert.equal(existsSync(join(r.dir, 'since')), false)
        assert.equal(existsSync(join(r.dir, 'lock')), false)
        assert.equal(existsSync(join(r.dir, 'pid')), false)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('the watcher exits without touching the bot when a deploy cleared the deferral', () => {
    const r = run(
        'rm -f "$BOT_DEFERRED_SINCE_FILE"; bot_drain_watch; echo "EXIT $?"',
        { listeners: ['0'] },
    )
    try {
        assert.doesNotMatch(r.out, /COMPOSE/)
        assert.match(r.out, /deferral cleared elsewhere/)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('the watcher puts the previous image back by ID when the new bot is unhealthy', () => {
    const r = run('date +%s > "$BOT_DEFERRED_SINCE_FILE"; bot_drain_watch', {
        listeners: ['0'],
        env: { FAKE_HEALTH: 'unhealthy', BOT_DRAIN_HEALTH_SECONDS: '0' },
    })
    try {
        assert.match(r.out, /not healthy/)
        assert.match(
            r.out,
            /TAG sha256:old ghcr\.io\/x\/lucky-bot:drain-rollback/,
        )
        assert.equal(r.out.match(/COMPOSE up -d --no-deps bot/g)?.length, 2)
        assert.match(r.out, /put the bot back on its previous image sha256:old/)
        assert.match(r.out, /NOTIFY Bot Restart Failed/)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('the watcher skips a poll when the count is unreadable, then recreates', () => {
    const r = run('date +%s > "$BOT_DEFERRED_SINCE_FILE"; bot_drain_watch', {
        listeners: ['fail', '0'],
    })
    try {
        assert.match(r.out, /checking again next poll/)
        assert.equal(r.out.match(/COMPOSE up -d --no-deps bot/g)?.length, 1)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})

test('recreates instead of deferring when the deferral start cannot be recorded', () => {
    const r = decide({
        listeners: ['2'],
        env: { BOT_DEFERRED_SINCE_FILE: '/nonexistent/dir/since' },
    })
    try {
        assert.match(r.out, /DECISION recreate 2/)
        assert.match(r.out, /recreating instead/)
    } finally {
        rmSync(r.dir, { recursive: true, force: true })
    }
})
