#!/usr/bin/env bash
# Agent-neutral blocked-commands guard.
# Interface: $1 = command string to check
#            exit 0 = allow (no output)
#            exit 1 = deny (reason on stderr)
#
# Reads blocked_commands from $CLAUDE_PROJECT_DIR/spec-driven-config.json.
# If the config file is absent, this guard is a no-op (project hasn't opted in).
#
# Rule categories:
#   ban   — always denied, no override
#   guard — denied unless SDD_DEBUG=1 is set in the environment

COMMAND="$1"

# No command to check — allow.
if [ -z "$COMMAND" ]; then
  exit 0
fi

CONFIG="${CLAUDE_PROJECT_DIR:-.}/spec-driven-config.json"

# If no config file, exit silently — project hasn't opted in.
if [ ! -f "$CONFIG" ]; then
  exit 0
fi

# Read rules from config and check each one.
# Uses python3 to parse the JSON config and emit tab-separated fields
# (category, pattern, message) for the shell loop.
while IFS=$'\t' read -r category pattern message; do
  # Auto-wrap pattern with compound-command anchor:
  #   (^|[;&|])\s*<pattern>\b
  # This catches commands in chained expressions like: cd foo && helm upgrade ...
  anchored="(^|[;&|])\s*${pattern}\b"

  if echo "$COMMAND" | grep -qE "$anchored"; then
    case "$category" in
      ban)
        echo "BLOCKED: ${message}" >&2
        exit 1
        ;;
      guard)
        if [ "${SDD_DEBUG:-}" = "1" ]; then
          : # allow — debug override
        else
          echo "BLOCKED: ${message}" >&2
          exit 1
        fi
        ;;
    esac
  fi
done < <(python3 -c "
import json, sys
try:
    with open(sys.argv[1]) as f:
        config = json.load(f)
    for rule in config.get('blocked_commands', []):
        cat = rule.get('category', 'ban')
        pat = rule.get('pattern', '')
        msg = rule.get('message', 'Command blocked by spec-driven-dev hook.')
        print(f'{cat}\t{pat}\t{msg}')
except Exception as e:
    print(f'# config parse error: {e}', file=sys.stderr)
" "$CONFIG")

exit 0
