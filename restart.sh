#!/bin/bash
# Restart the GitHub Follower daemon

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/data/daemon.pid"
LOG_FILE="$SCRIPT_DIR/data/daemon.log"

# Stop existing daemon if running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping daemon (PID $OLD_PID)..."
    kill "$OLD_PID"
    sleep 2
  fi
fi

# Also kill any stray processes
pkill -f "daemon.ts" 2>/dev/null
sleep 1

# Start fresh
cd "$SCRIPT_DIR"
nohup npm run daemon >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"
echo "Daemon started (PID $NEW_PID)"
echo "Logs: tail -f $LOG_FILE"
