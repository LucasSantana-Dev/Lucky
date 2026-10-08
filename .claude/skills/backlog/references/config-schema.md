# Backlog Skill Configuration Schema

Per-repo config lives at `.claude/backlog-config.json`. All fields optional; defaults applied when missing.

## Configuration File Structure

```json
{
    "project_url": "https://github.com/users/lucassantana/projects/N",
    "project_field_mapping": {
        "priority": {
            "field": "Priority",
            "map": {
                "critical": "P0",
                "high": "P1",
                "medium": "P2",
                "low": "P3"
            }
        },
        "effort": {
            "field": "Effort",
            "map": { "xs": "XS", "s": "S", "m": "M", "l": "L" }
        },
        "repo_field": "Repo"
    },
    "labels_to_apply": ["backlog-skill"],
    "excluded_paths": [
        "node_modules",
        "dist",
        "build",
        ".next",
        "vendor",
        "coverage",
        ".turbo"
    ],
    "max_findings_per_run": 10,
    "auto_create_board": false,
    "dedup_strategy": "title-fuzzy",
    "category_priority_override": null
}
```

## Field Reference

- **`project_url`** — explicit board to use. Overrides the @me-scope "Active Backlog" default.
- **`project_field_mapping`** — how severity/effort map to Project board fields. Nesting allows field names to differ from standard names in your Project.
- **`labels_to_apply`** — extra labels beyond auto-generated cat/sev/effort. Useful for repo-specific categorization.
- **`excluded_paths`** — directories `discover.sh` skips when scanning for code markers (TODO/FIXME/etc.). Relative paths from repo root.
- **`max_findings_per_run`** — cap on Phase 3 proposed table size. Default 10 (XP short cycles). Set to 25 for comprehensive sweep.
- **`auto_create_board`** — if true, skips the user-confirmation prompt in Phase 7a. Default false (always ask).
- **`dedup_strategy`** — `title-fuzzy` (Levenshtein ≥ 0.85) or `title-exact`. Default fuzzy for lenient matching against existing issues.
- **`category_priority_override`** — optional mapping like `{"docs": "low"}` to force certain categories to specific severities. Default null. Useful for repos where docs are lower priority than the base rules suggest.

## Default Behavior

If `.claude/backlog-config.json` is absent, all defaults apply (no errors).
