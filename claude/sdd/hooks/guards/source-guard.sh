#!/usr/bin/env bash
# Agent-neutral source-guard.
# Interface: $1 = file path to check
#            exit 0 = allow (no output)
#            exit 1 = deny (reason on stderr)
#
# Reads source_dirs patterns from $CLAUDE_PROJECT_DIR/spec-driven-config.json.
# If the config file is absent, this guard is a no-op (no restrictions).

FILE_PATH="$1"

# No file path — allow.
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

CONFIG_FILE="${CLAUDE_PROJECT_DIR:-.}/spec-driven-config.json"

# No config = no restrictions.
if [ ! -f "$CONFIG_FILE" ]; then
  exit 0
fi

# Check file_path against source_dirs patterns.
python3 -c "
import sys, json, fnmatch, os

file_path = sys.argv[1]
config_path = os.environ.get('CLAUDE_PROJECT_DIR', '.') + '/spec-driven-config.json'
try:
    with open(config_path) as f:
        config = json.load(f)
except:
    sys.exit(0)

project_dir = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
rel_path = os.path.relpath(file_path, project_dir) if os.path.isabs(file_path) else file_path

for pattern in config.get('source_dirs', []):
    if fnmatch.fnmatch(rel_path, pattern):
        print(f'Source guard: master session cannot edit {rel_path} (matches {pattern}). Use /feature-change instead.', file=sys.stderr)
        sys.exit(1)

sys.exit(0)
" "$FILE_PATH"
