#!/usr/bin/env bash
# Agent-neutral workflow-reminder guard.
# Interface: no arguments, no stdin parsing.
#            Prints SDD workflow reminder to stdout, exits 0.
#            UserPromptSubmit: stdout on exit 0 is added to agent context.

TIMESTAMP=$(/bin/date +"%Y-%m-%dT%H:%M:%S")
echo "[HOOK-TS] ${TIMESTAMP}"
