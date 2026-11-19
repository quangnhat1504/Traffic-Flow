@echo off
echo Starting Native Redis Server for TrafficFlow on port 6379...
cd /d %~dp0
tools\redis\redis-server.exe tools\redis\redis.windows.conf --port 6379
pause
