#!/usr/bin/env bash
# Dev helper: (re)start `next dev` in the background, logging to $LOG
LOG=${LOG:-/tmp/store76-dev.log}
fuser -k 3000/tcp >/dev/null 2>&1; sleep 1
nohup npx next dev -p 3000 > "$LOG" 2>&1 &
echo $! > /tmp/store76-dev.pid
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3000/api/search?q=a && break; sleep 1; done
echo "dev server up (pid $(cat /tmp/store76-dev.pid))"
