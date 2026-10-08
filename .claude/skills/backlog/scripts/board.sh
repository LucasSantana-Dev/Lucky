#!/usr/bin/env bash
# board.sh — Phase 7 Project board helper for /backlog.
#
# Three sub-commands:
#   resolve  — locate target board from config OR find/create "Active Backlog" at @me
#   ensure-fields — ensure Priority, Effort, Repo fields exist on the board
#   add-card — add an issue URL as a card and set Priority/Effort/Repo fields
#
# Per /backlog plan: never auto-create the board without user confirmation
# (that confirmation happens in the SKILL.md workflow, not here).
#
# Usage:
#   ./board.sh resolve [--config-file .claude/backlog-config.json]
#   ./board.sh ensure-fields <project-number>
#   ./board.sh add-card <project-number> <issue-url> <severity> <effort> <repo>

set -euo pipefail

CMD="${1:-}"
shift || true

case "$CMD" in
  resolve)
    CONFIG_FILE=".claude/backlog-config.json"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --config-file) CONFIG_FILE="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    # First: check config for explicit project_url
    if [[ -f "$CONFIG_FILE" ]]; then
      CFG_URL=$(jq -r '.project_url // ""' "$CONFIG_FILE")
      if [[ -n "$CFG_URL" && "$CFG_URL" != "null" ]]; then
        # Extract project number from URL
        PROJ_NUM=$(echo "$CFG_URL" | grep -oE '/projects/[0-9]+' | grep -oE '[0-9]+$')
        if [[ -n "$PROJ_NUM" ]]; then
          jq -n --arg url "$CFG_URL" --arg num "$PROJ_NUM" --arg source "config" \
            '{ url: $url, number: ($num | tonumber), source: $source }'
          exit 0
        fi
      fi
    fi

    # Second: query @me for a board titled "Active Backlog"
    BOARD_JSON=$(gh project list --owner "@me" --format json 2>/dev/null || echo '{"projects":[]}')
    PROJ_NUM=$(echo "$BOARD_JSON" | jq -r '.projects[]? | select(.title == "Active Backlog") | .number' | head -1)

    if [[ -n "$PROJ_NUM" ]]; then
      OWNER=$(gh api user --jq .login)
      jq -n \
        --arg url "https://github.com/users/$OWNER/projects/$PROJ_NUM" \
        --arg num "$PROJ_NUM" \
        --arg source "discovered" \
        '{ url: $url, number: ($num | tonumber), source: $source }'
    else
      # Not found — caller (SKILL.md workflow) must prompt user before creating
      jq -n '{ url: null, number: null, source: "missing" }'
    fi
    ;;

  ensure-fields)
    PROJ_NUM="${1:?project-number required}"
    FIELDS_JSON=$(gh project field-list "$PROJ_NUM" --owner "@me" --format json 2>/dev/null || echo '{"fields":[]}')

    has_priority=$(echo "$FIELDS_JSON" | jq -r '.fields[]? | select(.name == "Priority") | .id' | head -1)
    has_effort=$(echo "$FIELDS_JSON"   | jq -r '.fields[]? | select(.name == "Effort")   | .id' | head -1)
    has_repo=$(echo "$FIELDS_JSON"     | jq -r '.fields[]? | select(.name == "Repo")     | .id' | head -1)

    if [[ -z "$has_priority" ]]; then
      gh project field-create "$PROJ_NUM" --owner "@me" --name "Priority" \
        --data-type SINGLE_SELECT --single-select-options "P0,P1,P2,P3" >/dev/null
    fi
    if [[ -z "$has_effort" ]]; then
      gh project field-create "$PROJ_NUM" --owner "@me" --name "Effort" \
        --data-type SINGLE_SELECT --single-select-options "XS,S,M,L" >/dev/null
    fi
    if [[ -z "$has_repo" ]]; then
      gh project field-create "$PROJ_NUM" --owner "@me" --name "Repo" \
        --data-type TEXT >/dev/null
    fi

    # Return updated field map for caller to use in add-card
    gh project field-list "$PROJ_NUM" --owner "@me" --format json
    ;;

  add-card)
    PROJ_NUM="${1:?project-number required}"
    ISSUE_URL="${2:?issue-url required}"
    SEVERITY="${3:?severity required}"
    EFFORT="${4:?effort required}"
    REPO="${5:?repo required}"

    # Map severity → Priority option
    case "$SEVERITY" in
      critical) PRIORITY_OPT="P0" ;;
      high)     PRIORITY_OPT="P1" ;;
      medium)   PRIORITY_OPT="P2" ;;
      low|*)    PRIORITY_OPT="P3" ;;
    esac

    # Map effort → Effort option
    case "$EFFORT" in
      xs) EFFORT_OPT="XS" ;;
      s)  EFFORT_OPT="S"  ;;
      m)  EFFORT_OPT="M"  ;;
      l|*) EFFORT_OPT="L" ;;
    esac

    # Add card and capture item id
    ITEM_JSON=$(gh project item-add "$PROJ_NUM" --owner "@me" --url "$ISSUE_URL" --format json)
    ITEM_ID=$(echo "$ITEM_JSON" | jq -r '.id')

    if [[ -z "$ITEM_ID" || "$ITEM_ID" == "null" ]]; then
      echo "ERROR: failed to add card for $ISSUE_URL" >&2
      exit 1
    fi

    # Resolve field + option IDs
    FIELDS_JSON=$(gh project field-list "$PROJ_NUM" --owner "@me" --format json)
    PRIORITY_FID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name == "Priority") | .id')
    EFFORT_FID=$(echo "$FIELDS_JSON"   | jq -r '.fields[] | select(.name == "Effort")   | .id')
    REPO_FID=$(echo "$FIELDS_JSON"     | jq -r '.fields[] | select(.name == "Repo")     | .id')

    PRIORITY_OID=$(echo "$FIELDS_JSON" | jq -r --arg opt "$PRIORITY_OPT" '.fields[] | select(.name == "Priority") | .options[]? | select(.name == $opt) | .id')
    EFFORT_OID=$(echo "$FIELDS_JSON"   | jq -r --arg opt "$EFFORT_OPT"   '.fields[] | select(.name == "Effort")   | .options[]? | select(.name == $opt) | .id')

    # Set fields (idempotent — re-running is safe)
    if [[ -n "$PRIORITY_FID" && -n "$PRIORITY_OID" ]]; then
      gh project item-edit --id "$ITEM_ID" --project-id "$(echo "$FIELDS_JSON" | jq -r '.fields[0].project.id // empty')" \
        --field-id "$PRIORITY_FID" --single-select-option-id "$PRIORITY_OID" >/dev/null 2>&1 || true
    fi
    if [[ -n "$EFFORT_FID" && -n "$EFFORT_OID" ]]; then
      gh project item-edit --id "$ITEM_ID" --project-id "$(echo "$FIELDS_JSON" | jq -r '.fields[0].project.id // empty')" \
        --field-id "$EFFORT_FID" --single-select-option-id "$EFFORT_OID" >/dev/null 2>&1 || true
    fi
    if [[ -n "$REPO_FID" ]]; then
      gh project item-edit --id "$ITEM_ID" --project-id "$(echo "$FIELDS_JSON" | jq -r '.fields[0].project.id // empty')" \
        --field-id "$REPO_FID" --text "$REPO" >/dev/null 2>&1 || true
    fi

    echo "$ITEM_ID"
    ;;

  *)
    echo "Usage: $0 {resolve|ensure-fields|add-card} ..." >&2
    exit 2
    ;;
esac
