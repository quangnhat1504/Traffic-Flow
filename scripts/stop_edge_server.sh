#!/usr/bin/env bash
echo "[INFO] Stopping TrafficFlow Edge Cloud Server..."
pkill -f "uvicorn api.app:create_app" || true
echo "[INFO] Stopped."
