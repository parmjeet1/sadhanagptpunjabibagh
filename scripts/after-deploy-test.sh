#!/usr/bin/env bash
# After-deploy step for the TEST backend. Configure it ONCE in deploy.sh (see DBnew.md); it never needs editing:
# new database changes are picked up from scripts/db-changes/ by their file names.
#
#   bash scripts/after-deploy-test.sh      (or:  bash ~/test-backend/scripts/after-deploy-test.sh)
#
# - Runs ONLY inside a folder called "test-backend" (refuses anywhere else, e.g. production folders).
# - Runs every DB-NNN change in order; each one emails md.gkg.sp@gmail.com on success or failure.
# - Exit code 0 = fine, 1 = a change failed (the email explains it), 2 = wrong place / setup problem.
# - A log is appended to ~/db-changes.log.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${HOME}/db-changes.log"

say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

if [ "$(basename "$APP_DIR")" != "test-backend" ]; then
  say "REFUSED: this step only runs inside a folder named test-backend (this one is: $APP_DIR). Nothing was changed."
  exit 2
fi
cd "$APP_DIR" || exit 2

if [ ! -f ".env" ]; then say "REFUSED: no .env file in $APP_DIR. Nothing was changed."; exit 2; fi
if ! command -v node >/dev/null 2>&1; then say "REFUSED: node is not on the PATH of this shell. Nothing was changed."; exit 2; fi
if [ ! -f "scripts/db-changes/run-all.js" ]; then say "REFUSED: scripts/db-changes/run-all.js not found in $APP_DIR (code not deployed?). Nothing was changed."; exit 2; fi

say "Database changes: starting in $APP_DIR"
node scripts/db-changes/run-all.js --confirm-test 2>&1 | tee -a "$LOG"
CODE=${PIPESTATUS[0]}
if [ "$CODE" -eq 0 ]; then say "Database changes: finished OK."; else say "Database changes: FAILED (exit $CODE). See the email / $LOG."; fi
exit "$CODE"
