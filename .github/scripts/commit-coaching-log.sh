#!/usr/bin/env bash
# Commits whatever the audit/agent script newly appended to
# reports/coaching-quality-log.md, without ever running a git merge/rebase
# on it. A prior version of this workflow used `git pull --rebase --autostash`
# before committing, which could hit a real conflict when two jobs' commits
# landed close together — and the step after it committed and pushed the
# file regardless of whether that conflict actually resolved, so literal
# unresolved `<<<<<<<`/`=======`/`>>>>>>>` markers ended up committed to main.
#
# Since the scripts only ever read-then-append to this file (never touch
# earlier content), a pure append can't conflict: reset the file to the
# freshest remote copy, then re-append exactly the bytes this run added
# (recorded by record-coaching-log-baseline.sh before the script ran).
# Retries on a push race (someone else's commit landing between our fetch
# and push) by redoing the same append against the newer base.
#
# Uses `git reset --hard` (not `--soft`) against origin/main: `--soft` only
# moves the branch pointer and leaves the index/working tree exactly as this
# job's checkout left them. If that checkout predates commits pushed to main
# later (e.g. by a person, while this run was mid-flight), the stale index
# still holds their old content, and `git commit` below commits that whole
# stale index as the new tree — silently reverting every file changed
# upstream since checkout, not just appending to the log. Confirmed live:
# 7359ac0 reverted a same-day fix to this very script, plus three unrelated
# app files, because the run's checkout predated that push. `--hard` syncs
# the index/working tree to origin/main's actual latest content first, so
# only the log file (rewritten below) ever differs from it.
set -euo pipefail

LOG_FILE="reports/coaching-quality-log.md"
COMMIT_PREFIX="${1:?commit message prefix required}"
BASE_SIZE_FILE=/tmp/coaching_log_base_size

if [ ! -f "$LOG_FILE" ]; then
  echo "No $LOG_FILE produced by this run — nothing to commit."
  exit 0
fi

if [ ! -f "$BASE_SIZE_FILE" ]; then
  echo "No baseline recorded by record-coaching-log-baseline.sh — refusing to guess what's new." >&2
  exit 1
fi

BASE_SIZE=$(cat "$BASE_SIZE_FILE")
CURRENT_SIZE=$(wc -c < "$LOG_FILE" | tr -d ' ')
if [ "$CURRENT_SIZE" -le "$BASE_SIZE" ]; then
  echo "Report log didn't grow (base=$BASE_SIZE bytes, current=$CURRENT_SIZE bytes) — nothing new to commit."
  exit 0
fi

NEW_SECTION="$(mktemp)"
tail -c "+$((BASE_SIZE + 1))" "$LOG_FILE" > "$NEW_SECTION"

git config user.name "coaching-quality-bot"
git config user.email "actions@github.com"

MAX_ATTEMPTS=5
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  git fetch origin main
  git reset --hard origin/main
  git checkout origin/main -- "$LOG_FILE" 2>/dev/null || : > "$LOG_FILE"
  cat "$NEW_SECTION" >> "$LOG_FILE"
  git add "$LOG_FILE"
  git commit -m "$COMMIT_PREFIX: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if git push origin HEAD:main; then
    exit 0
  fi
  echo "Push rejected (attempt $attempt/$MAX_ATTEMPTS) — someone else pushed first, retrying against the new base..." >&2
done

echo "Failed to push the report log after $MAX_ATTEMPTS attempts." >&2
exit 1
