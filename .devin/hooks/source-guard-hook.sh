#!/usr/bin/env bash
# Devin I/O wrapper for source-guard — DEBUG VERSION
# Dumps full stdin to a file for inspection, then runs the guard

export CLAUDE_PROJECT_DIR="${DEVIN_PROJECT_DIR:-.}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GUARD="$SCRIPT_DIR/guards/source-guard.sh"

[ ! -f "$GUARD" ] && exit 0

INPUT=$(cat)

# DEBUG: dump full hook input to file
echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) ---" >> /tmp/devin-hook-input.log
echo "$INPUT" >> /tmp/devin-hook-input.log
echo "" >> /tmp/devin-hook-input.log

FILE_PATH=$(python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
print(d.get('tool_input', {}).get('file_path', ''))
" <<< "$INPUT" 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

REASON=$(bash "$GUARD" "$FILE_PATH" 2>&1)
RC=$?

if [ $RC -ne 0 ]; then
  python3 -c "
import json, sys
reason = sys.stdin.read().strip()
print(json.dumps({'decision': 'block', 'reason': reason}))
" <<< "$REASON"
  exit 0
fi
