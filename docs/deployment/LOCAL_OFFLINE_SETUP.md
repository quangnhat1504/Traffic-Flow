# Local Sovereign Offline Setup Guide
*Running TrafficFlow with Zero Cloud Dependencies*

---

## 1. Operating Concept

When cloud services (MongoDB Atlas, Cloudflare R2, remote GPUs) are unavailable, TrafficFlow operates 100% locally on the host/client machine:
- **Database:** SQLite WAL mode (`storage/trafficflow_edge.sqlite`) with $O(1)$ writes.
- **File Storage:** Local disk filesystem (`storage/uploads`, `storage/previews`, `storage/results`) served via `/static/`.
- **Redis Queue:** Local native Windows Redis (`tools/redis/redis-server.exe`) on port 6379.
- **AI Engine:** Local PyTorch / ONNX Runtime / RKNN NPU.

---

## 2. Windows Local Startup Instructions

### Step 1: Start Redis
Run the native Redis batch script:
```cmd
start_redis.bat
```
*(Starts `tools/redis/redis-server.exe tools/redis/redis.windows.conf --port 6379`)*

### Step 2: Start API Server
In a separate terminal:
```cmd
run_server.bat
```
*(Runs Uvicorn on `http://127.0.0.1:8000` with automatic SQLite WAL fallback)*

### Step 3: Start Celery Worker (Optional for video uploads)
In a separate terminal:
```cmd
run_worker.bat
```
*(Starts Celery with `--pool=solo` for Windows compatibility)*

### Step 4: Access Application
- Web Dashboard: `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs`
- Healthcheck: `http://localhost:8000/health`
