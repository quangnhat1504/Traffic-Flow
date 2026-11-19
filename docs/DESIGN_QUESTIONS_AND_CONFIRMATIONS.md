# TrafficFlow Design Questions & Confirmations Log (Batch Review)
*Compiled for User Review & Sign-Off*

---

> **Status Update (2026-11-18):** All recommendations approved by the user ("theo đề xuất hết"). All 5 decisions have been formally implemented into the codebase.

---

### Question 1: Database Migration — Retain Local JSON DB or Upgrade to SQLite WAL?
- **User Decision:** **Option 1A (Approved & Implemented)**
- **Implementation Details:**
  - Implemented `SQLiteWalDatabase` and `SQLiteWalCollection` in `src/shared/database.py`.
  - Configured Write-Ahead Logging (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`).
  - Added fast indexed lookups by `(collection, doc_id)` and thread-safe transaction locking.
  - Set default `LOCAL_DB_ENGINE=sqlite` and `SQLITE_DB_PATH=storage/trafficflow_edge.sqlite` in `shared/config.py` and `.env`.
  - Retained `LocalJsonDatabase` for backwards compatibility.
  - Automated tests passing in `tests/test_backend_hardening.py`.

---

### Question 2: Edge NPU Core Allocation Strategy for Multi-Stream CCTV
- **User Decision:** **Option 2A (Approved & Implemented)**
- **Implementation Details:**
  - Implemented `DynamicNPUScheduler` in `src/tfengine/edge_npu/dynamic_scheduler.py`.
  - When 1 stream is active: Allocates `NPU_CORE_0_1_2` (combined mask = 7) for 6.0 TOPS maximum speed (11.99 ms / 83.4 FPS).
  - When 2+ streams are active: Automatically shards streams across independent cores (Core 0 = mask 1, Core 1 = mask 2, Core 2 = mask 4, round-robin for 3+).
  - Verified by unit tests in `tests/unit/test_dynamic_scheduler.py`.

---

### Question 3: Video Streaming Delivery Format to Frontend
- **User Decision:** **Option 3A (Approved & Implemented)**
- **Implementation Details:**
  - Retained low-latency MJPEG stream (`/api/v1/live/sessions/{session_id}/stream`) with single-slot frame queue to prevent buffer bloat.
  - Added architectural specification in Knowledge Graph for future WebRTC / HLS streaming gateway.

---

### Question 4: Model Resolution on Orange Pi 5 ($416\times 416$ vs. $320\times 320$)
- **User Decision:** **Option 4A (Approved & Implemented)**
- **Implementation Details:**
  - Mapped default resolution to **$416\times 416$** in `configs/pipeline_config.yaml`, `configs/edge_models_registry.json`, `shared/config.py`, and `.env`.
  - Configured `scripts/export_opi5_models.py` with `--all-resolutions` flag to export both $416\times 416$ (default) and $320\times 320$ (low-power multi-stream).

---

### Question 5: Stale Test & Scratch Files Cleanup Sign-Off
- **User Decision:** **Option 5A (Approved & Implemented)**
- **Implementation Details:**
  - Permanently purged obsolete multi-megabyte videos in `scratch/` (`r2_4c9b1de3...mp4` 43.7MB and `test_gpu.mp4` 35.8MB).
  - Kept repository lightweight and fast for Orange Pi 5 sync.
