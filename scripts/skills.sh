#!/bin/bash

# Skills wrapper script for Lucky
# Unified entry point for npx skills (management) and Codex CLI (execution).

CODEX_CLI="/Users/lucassantana/.codex/superpowers/.codex/superpowers-codex"

case "$1" in
    "use")
        if [ -z "$2" ]; then
            echo "Usage: $0 use <skill-name>"
            exit 1
        fi
        if [ ! -f "$CODEX_CLI" ]; then
            echo "Error: Codex CLI not found at $CODEX_CLI"
            exit 1
        fi
        "$CODEX_CLI" use-skill "$2"
        ;;
    "add"|"ls"|"list"|"find"|"search"|"check"|"update"|"rm"|"remove"|"init")
        npx -y skills "$@"
        ;;
    "help"|"--help"|"-h")
        echo "Usage: $0 {use|add|ls|list|find|search|check|update|rm|remove|init}"
        echo ""
        echo "Execution:"
        echo "  $0 use superpowers:brainstorming"
        echo ""
        echo "Management (via npx skills):"
        echo "  $0 add <owner/repo>"
        echo "  $0 list"
        echo "  $0 find <query>"
        ;;
    *)
        echo "Usage: $0 {use|add|ls|list|find|search|check|update|rm|remove|init}"
        exit 1
        ;;
esac
