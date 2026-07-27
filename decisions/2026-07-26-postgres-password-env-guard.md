# POSTGRES_PASSWORD — harden the compose guard to `:?`, ship an empty placeholder

- **Date:** 2026-07-26
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Method:** `/research-and-decide` — repo evidence → adversarial critic (Opus, artifact-only)
  → empirical verification against `docker-compose` 5.1.4. The critic flagged the proposal's
  load-bearing assumption as unverified; testing showed the assumption was **wrong** and the
  first proposal was amended before acceptance.
- **Triggered by:** PR #1674 (outside contributor) review.

## Context

The compose files interpolate the Postgres password into several places, each with what looks
like a fail-fast guard (shown for `docker-compose.yml`; the same pattern exists in
`docker-compose.staging.yml` and `docker-compose.dev.yml`):

```yaml
DATABASE_URL: postgresql://discordbot:${POSTGRES_PASSWORD?POSTGRES_PASSWORD_required}@postgres:5432/discordbot
DIRECT_URL: postgresql://discordbot:${POSTGRES_PASSWORD?POSTGRES_PASSWORD_required}@postgres:5432/discordbot # added by #1674
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD?POSTGRES_PASSWORD_required} # postgres service
```

PR #1674 ("make compose stack boot from a fresh `.env`") changed `.env.example` from a
commented-out `# POSTGRES_PASSWORD=change-me-in-production` to an **active** 48-zero value. That
makes `docker compose up` succeed out of the box with a guessable database password, and the
operator is never forced to look at it. `README.md:137` documents the setup flow as literally
`cp .env.example .env`, so the placeholder lands verbatim. This repo's compose stack is what runs
on the homelab, and the repo is public, so self-hosters inherit the same default.

## Decision

Three parts.

1. **Change all guards from `${VAR?err}` to `${VAR:?err}`, in all three compose files** (prod,
   staging, dev). This is the actual fix and it corrects a pre-existing weakness, not something
   #1674 introduced. The staging/dev sites matter as much as prod: `deploy-staging.sh` has no
   independent password guard (unlike `deploy.sh`), so the compose guard is the only line of
   defense on that path.
2. **`.env.example` ships `POSTGRES_PASSWORD=` (empty)**, keeping #1674's comment block, which
   correctly explains the URL-safe-hex requirement and gives the `openssl rand -hex 24` command.
3. **README setup becomes two portable lines:**
    ```bash
    cp .env.example .env
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
    ```

## Why, with the evidence

The proposal originally kept the `?` guards and relied on "empty and unset are equivalent". The
critic scored that as the load-bearing, unverified assumption. It is true in POSIX shell and
**false in Docker Compose**. Verified against `docker-compose` 5.1.4:

| `.env` state                 | `${VAR?err}` | `${VAR:?err}` |
| ---------------------------- | ------------ | ------------- |
| unset                        | errors       | errors        |
| `POSTGRES_PASSWORD=` (empty) | **passes**   | errors        |
| real value                   | passes       | passes        |

So an empty placeholder under today's `?` guards would boot Postgres with an **empty** password,
which is worse than the 48 zeros. The guard only ever protected against a _missing_ line. Moving
to `:?` is what makes an empty placeholder safe, and it is the piece that makes this decision work
at all.

Duplicate keys were the critic's second concern: appending with `>>` leaves two
`POSTGRES_PASSWORD=` lines. Verified that Compose resolves duplicates **last-wins**, so `>>` is
correct. It is also preferred over the critic's `sed -i` suggestion because `sed -i` needs an
empty-string argument on BSD/macOS and not on GNU, which is a portability trap in a public
README.

The "boots from a fresh `.env`" property that #1674 chases does not actually exist: `DISCORD_TOKEN`
and `CLIENT_ID` are mandatory, unguessable, and hand-edited regardless (`README.md:137-141`). The
placeholder therefore bought no real convenience and cost the guard.

## Alternatives considered

- **Keep the 48-zero placeholder (#1674 as submitted).** Rejected: permanently disables the guard
  on the one credential that can be generated, on a public repo whose compose stack reaches
  production.
- **`scripts/setup-env.sh` that generates `.env`.** The critic argued this is the better UX, and
  the argument is decent: `POSTGRES_PASSWORD` is the only secret that _can_ be automated, so a
  script would separate it from the ones that cannot. Rejected for now because the README flow
  still requires hand-editing `DISCORD_TOKEN`/`CLIENT_ID`, so a script adds a second entry point
  without removing the manual step, and the verified two-liner is smaller. This is the most
  likely thing to revisit.
- **An obviously-invalid sentinel (`REPLACE_ME`).** Rejected: still an active value, so the guard
  stays disabled and the stack boots on a known string.

## Consequences

- An operator who runs only `cp .env.example .env` now gets an immediate, named failure
  (`POSTGRES_PASSWORD_required`) instead of a silently running zero-password database. This is a
  deliberate trade of "boots" for "fails loudly", and it is the point.
- `.env` will contain a duplicate `POSTGRES_PASSWORD` line after setup. Harmless (last-wins) but
  untidy.
- Not addressed here: changing `POSTGRES_PASSWORD` in `.env` after first boot does **not** change
  the password, because `PGDATA` is initialised once and the volume persists the original. This
  is pre-existing and trips people; tracked separately.

## Revisit when

- A self-hoster files an issue saying they ran `cp .env.example .env` and the stack would not
  start. That is the signal the README flow is not clear enough, and the trigger to reconsider
  `scripts/setup-env.sh`.
- Compose changes duplicate-key resolution away from last-wins, or the `:?` semantics change.
- Secrets move wholesale to Infisical (`docs/INFISICAL.md`), which would make the `.env` flow
  legacy.
