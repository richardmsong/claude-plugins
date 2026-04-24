#!/usr/bin/env bash
# Claude I/O wrapper for blocked-commands guard
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GUARD="${CLAUDE_PLUGIN_ROOT}/hooks/guards/blocked-commands.sh"
INPUT=$(cat)
COMMAND=$(python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('tool_input',{}).get('command',''))" <<< "$INPUT")
[ -z "$COMMAND" ] && exit 0
REASON=$(bash "$GUARD" "$COMMAND" 2>&1)
if [ $? -ne 0 ]; then
  python3 -c "
import json, sys
reason = sys.stdin.read().strip()
print(json.dumps({'hookSpecificOutput': {
  'hookEventName': 'PreToolUse',
  'permissionDecision': 'deny',
  'permissionDecisionReason': reason
}}))
" <<< "$REASON"
fi
