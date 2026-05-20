# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's GitHub issue tracker.

| Canonical role    | Label in this repo | Meaning                                  |
| ----------------- | ------------------ | ---------------------------------------- |
| `needs-triage`    | `needs-triage`     | Maintainer needs to evaluate this issue  |
| `needs-info`      | `needs-info`       | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent`  | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human`  | Requires human implementation            |
| `wontfix`         | `wontfix`          | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Relationship to other labels in this repo

These triage labels are **orthogonal** to:

- **Category labels** (`cat:bug`, `cat:feature`, `cat:refactor`, `cat:tech-debt`, `cat:perf`, `cat:test`, `cat:docs`, `cat:security`) — what _kind_ of work
- **Area labels** (`bot`, `backend`, `frontend`, `shared`, `infra`, `ci`, `database`, `music`, `moderation`, `dx`) — _where_ in the codebase
- **Size labels** (`size/xs|s|m|l|xl`) — _how big_
- **`backlog-skill`** — created by `/backlog`

Triage labels answer _what's the next action and who owns it_. Apply alongside the others.
