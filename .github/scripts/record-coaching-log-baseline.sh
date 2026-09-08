#!/usr/bin/env bash
# Records the current byte size of reports/coaching-quality-log.md before the
# audit/agent script runs. The scripts only ever read-then-append to this
# file (see scripts/coaching-quality-audit.mjs and coaching-quality-agent.mjs
# — both do `fs.writeFileSync(logPath, existing + section)`), so the bytes
# after this size once the script finishes are exactly the new section it
# wrote — no earlier content is ever touched. commit-coaching-log.sh uses
# this to re-append that section onto the freshest remote copy of the file
# instead of trying to reconcile a git rebase/merge, which is how a prior
# version of this workflow ended up committing literal unresolved conflict
# markers into the file when two jobs' commits raced each other.
set -euo pipefail

LOG_FILE="reports/coaching-quality-log.md"
mkdir -p "$(dirname "$LOG_FILE")"
if [ -f "$LOG_FILE" ]; then
  wc -c < "$LOG_FILE" | tr -d ' ' > /tmp/coaching_log_base_size
else
  echo 0 > /tmp/coaching_log_base_size
fi
