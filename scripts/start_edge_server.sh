#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "[INFO] Starting TrafficFlow Edge Cloud Server on Orange Pi 5..."
echo "[INFO] Working directory: $DIR"

# Stop previous instance if running
pkill -f "uvicorn api.app:create_app" || true
sleep 1

export PYTHONPATH="$DIR/src"
PYTHON_BIN="/home/orangepi/miniconda3/envs/rknn_env/bin/python"

# Verify imports
$PYTHON_BIN -c "from api.app import create_app; print('[INFO] App factory verified')"

# Launch uvicorn in background
nohup $PYTHON_BIN -m uvicorn api.app:create_app --factory --host 0.0.0.0 --port 8000 > edge_api.log 2>&1 &
PID=$!
echo "[INFO] Started uvicorn server with PID $PID"
sleep 2

# Check health
curl -s http://127.0.0.1:8000/health || echo "[WARN] Health check not ready yet"
