# Orange Pi 5 (Rockchip RK3588) Edge Deployment Guide
*TrafficFlow Edge Cloud & NPU Operations Manual*

---

## 1. Hardware Architecture & Pre-Requisites

- **Target Device:** Orange Pi 5 (Rockchip RK3588S SoC).
- **Compute Unit:** 6.0 TOPS INT8 peak compute across 3 independent hardware cores (2.0 TOPS each).
- **Host Target:** `qnhat@100.115.216.86` (connected via Tailscale / Local LAN).
- **NPU Device Node:** `/dev/dri/renderD129` (initialized via `rknpu` kernel driver).
- **User-Space Runtime:** `librknnrt.so 2.5.0` (ARM64 C/C++ engine) and `rknn-toolkit-lite2 2.5.0`.
- **Target OS:** Ubuntu 22.04 LTS / Armbian Linux 6.1 aarch64.

---

## 2. Fast Deployment via Automation Script

Use the PowerShell deployment script from the project root:

```powershell
# 1. Sync code, configs, models, and Dockerfiles
.\scripts\deploy_to_opi5.ps1 -Stage "sync"

# 2. Build ARM64 Docker container on Orange Pi 5
.\scripts\deploy_to_opi5.ps1 -Stage "build-docker"

# 3. Launch the full Edge Cloud stack (API + Worker + Redis)
.\scripts\deploy_to_opi5.ps1 -Stage "start"

# 4. Check container health and NPU device allocation
.\scripts\deploy_to_opi5.ps1 -Stage "status"
```

---

## 3. Direct Docker Compose Execution on Board

When logged into the Orange Pi 5 board directly via SSH (`ssh qnhat@100.115.216.86`):

```bash
cd /home/orangepi/TrafficFlow_Edge

# Build images
docker compose -f docker/docker-compose.opi5.yml build

# Start services in background
docker compose -f docker/docker-compose.opi5.yml up -d

# Verify NPU device access in running container
docker exec -it trafficflow_edge_api ls -ld /dev/dri/renderD129

# Inspect logs
docker logs -f trafficflow_edge_api
```

---

## 4. Hardware Normalization & Zero-Copy Input

- Model format: `.rknn` with in-silicon normalization (`mean_values=[[0,0,0]], std_values=[[255,255,255]]`).
- Frame format: Raw `uint8` BGR/RGB array `[1, 416, 416, 3]`.
- NPU DMA transfers pixels directly into SRAM, freeing 95% of Cortex-A76 CPU cores for ByteTrack Kalman filtering and video streaming.

---

## 5. Endpoints Exposed on Orange Pi 5

- **HTTP API & Health:** `http://100.115.216.86:8000/health`
- **Interactive OpenAPI Docs:** `http://100.115.216.86:8000/docs`
- **Live Stream Endpoint (MJPEG):** `http://100.115.216.86:8000/api/v1/live/sessions/{session_id}/stream`
- **Video Upload API:** `POST http://100.115.216.86:8000/api/v1/videos`
