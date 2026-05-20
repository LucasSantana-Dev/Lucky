# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `LucasSantana-Dev/Lucky`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Repo is inferred from `git remote -v` — `gh` picks it up automatically when run inside the clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Repo-specific notes

- The `/backlog` skill already creates issues with `cat:*` category labels (`cat:bug`, `cat:feature`, `cat:refactor`, `cat:tech-debt`, `cat:perf`, `cat:test`, `cat:docs`, `cat:security`) and a `backlog-skill` marker. Triage labels (see `triage-labels.md`) are orthogonal — apply both when appropriate.
- Area labels (`bot`, `backend`, `frontend`, `shared`, `infra`, `ci`, `database`, `music`, `moderation`, `dx`) and size labels (`size/xs|s|m|l|xl`) are available; apply them when creating issues so existing dashboards and filters keep working.
