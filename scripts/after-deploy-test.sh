#!/usr/bin/env bash
# =====================================================================================
# after-deploy-test.sh  -  database changes after every deploy of the TEST backend
# =====================================================================================
# WHAT IT DOES
#   Runs every numbered database change in scripts/db-changes/ (DB-002-..., DB-003-...)
#   in number order, on the database that ~/test-backend/.env points to.
#   Each change checks first (running twice is harmless), runs, verifies, and emails
#   md.gkg.sp@gmail.com "applied" or "FAILED" (a failure mail explains the error and
#   names the database). A failed change stops the later ones.
#
# SETUP ON THE SERVER (ONCE - this file never needs editing again)
#   1. This file lives at ~/test-backend/scripts/after-deploy-test.sh  (it comes with the
#      code; the cat command below can also create it by hand).
#   2. Make it runnable:      chmod +x ~/test-backend/scripts/after-deploy-test.sh
#   3. In ~/deploy.sh, AFTER the line that restarts the test backend, add:
#        bash ~/test-backend/scripts/after-deploy-test.sh || echo "DB changes need a developer: see email and ~/db-changes.log"
#      (the "|| echo ..." keeps a failed database change from stopping the deploy)
#   4. Check:  bash ~/test-backend/scripts/after-deploy-test.sh   (safe: second runs say "already applied")
#
# NEW DATABASE CHANGE LATER: just add scripts/db-changes/DB-<next number>-<short-words>.js,
#   push, deploy. Nothing on the server changes. Rules: see DBnew.md.
#
# SAFETY
#   - Runs ONLY inside a folder named "test-backend" (refuses anywhere else).
#   - Needs .env and node in this folder / PATH, else it refuses and changes nothing.
#   - Exit code: 0 = fine, 1 = a change failed (see the email), 2 = wrong place / setup problem.
#   - A log is appended to ~/db-changes.log.
# =====================================================================================

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
