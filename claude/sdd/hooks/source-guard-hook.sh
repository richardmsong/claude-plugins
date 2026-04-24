#!/usr/bin/env bash
# Claude I/O wrapper for source-guard
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GUARD="${CLAUDE_PLUGIN_ROOT}/hooks/guards/source-guard.sh"
INPUT=$(cat)

# Subagents have an agent_type field — let them through unconditionally.
HAS_AGENT_TYPE=$(python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print('yes' if data.get('agent_type') else '')
except:
    print('')
" <<< "$INPUT")
if [ -n "$HAS_AGENT_TYPE" ]; then
  exit 0
fi

FILE_PATH=$(python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('tool_input',{}).get('file_path',''))" <<< "$INPUT")
[ -z "$FILE_PATH" ] && exit 0
REASON=$(bash "$GUARD" "$FILE_PATH" 2>&1)
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
