#!/bin/bash
# PreToolUse hook: config-driven command blocklist.
# Reads rules from $CLAUDE_PROJECT_DIR/.agent/blocked-commands.json.
# If the config file is absent, this hook is a no-op (project hasn't opted in).
#
# Rule categories:
#   ban   — always denied, no override
#   guard — denied unless SDD_DEBUG=1 is set in the environment
#
# Hook I/O contract:
#   stdin:  JSON with command at tool_input.command
#   stdout: deny JSON (if blocked) or nothing (implicit allow)
#   exit:   always 0

CONFIG="${CLAUDE_PROJECT_DIR:-.}/.agent/blocked-commands.json"

# If no config file, exit silently — project hasn't opted in.
if [ ! -f "$CONFIG" ]; then
  exit 0
fi

# Extract the command string from stdin JSON.
COMMAND=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except:
    print('')
")

# If no command to check, allow.
if [ -z "$COMMAND" ]; then
  exit 0
fi

deny() {
  python3 -c "
import json, sys
print(json.dumps({
  'hookSpecificOutput': {
    'hookEventName': 'PreToolUse',
    'permissionDecision': 'deny',
    'permissionDecisionReason': sys.argv[1]
  }
}))" "$1"
  exit 0
}

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
        deny "BLOCKED: ${message}"
        ;;
      guard)
        if [ "${SDD_DEBUG:-}" = "1" ]; then
          : # allow — debug override
        else
          deny "BLOCKED: ${message}"
        fi
        ;;
    esac
  fi
done < <(python3 -c "
import json, sys
try:
    with open(sys.argv[1]) as f:
        config = json.load(f)
    for rule in config.get('rules', []):
        cat = rule.get('category', 'ban')
        pat = rule.get('pattern', '')
        msg = rule.get('message', 'Command blocked by spec-driven-dev hook.')
        # Tab-separated output for the shell loop
        print(f'{cat}\t{pat}\t{msg}')
except Exception as e:
    # If config is malformed, allow everything (don't break the session).
    print(f'# config parse error: {e}', file=sys.stderr)
" "$CONFIG")

exit 0
