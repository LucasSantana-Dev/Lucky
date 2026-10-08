# Release Workflow

`ship-it` handles the release side (tag, GitHub release, deploy, verify); `merge-confidently`
handles the merge side. This doc covers release-specific gates and flow. The long-lived
`release` branch train is retired (2026-07-23); the old `release-cut` composite lives in
`~/.agents/skills-archive/release-cut/`. Releases are cut from `main`.

## Release gates (when to NOT release)

A release is NOT appropriate when:

- CI on `main` HEAD is red
- An open `/hotfix` is in progress on main (merge the hotfix first; release-please regenerates its PR)
- More than 14 days since last release with no verified demand (drift-nudge applies)

See `standards/release-cadence.md` for full policy.

## Version selection (semver)

From conventional commits since the last tag (release-please repos: release-please derives this):

| Commit prefix / footer          | Version bump  |
| ------------------------------- | ------------- |
| `feat:` / `feat(scope):`        | minor         |
| `fix:` / `perf:` / `refactor:`  | patch         |
| `BREAKING CHANGE:` footer / `!` | major         |
| `chore:` / `docs:` / `test:`    | no bump alone |

If commits don't follow conventional format: human-review the diff + ask user.
`ship-it` Phase 1 surfaces the proposed version before tagging.

## Post-release cleanup

After each release:

- Source branches of merged PRs deleted (GitHub auto-delete covers most)
- `/branch-hygiene` runs periodically to catch stragglers

## Hotfix exception

`/hotfix` is the fast path onto main for production breakage. Required:

- Production-degraded OR actively-exploited vuln OR customer-blocking with no workaround
- Smallest possible change (no drive-by refactors)
- Regression test that fails on pre-hotfix HEAD
- Tag and deploy via `ship-it --from tag` on the bump merge SHA
- `/incident-response` Phase 3 (post-mortem) queued automatically

"Small fix that someone wants in prod today" is NOT a hotfix: that's a normal PR via
`merge-confidently --open` plus merging the pending release PR (or `ship-it`).

See `standards/release-cadence.md` for full policy.
