#!/usr/bin/env bash
echo "=== TrafficFlow Edge Server Status ==="
curl -s http://127.0.0.1:8000/health || echo "Health endpoint unreachable"
echo ""
echo "=== Running Processes ==="
ps aux | grep -E "uvicorn|rknn" | grep -v grep || echo "No processes found"
echo ""
echo "=== System Memory & NPU ==="
free -h
ls -l /dev/dri/renderD129 2>/dev/null || echo "No /dev/dri/renderD129"
