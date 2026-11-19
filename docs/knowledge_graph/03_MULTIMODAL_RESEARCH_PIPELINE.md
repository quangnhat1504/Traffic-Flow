# Multimodal Knowledge Pipeline & Auto-Research Loop
*Universal Multimodal Ingestion Engine & Edge Compression Tuning*

---

## 1. Multimodal Knowledge Ingestion Pipeline

The multimodal ingestion subsystem ingests heterogeneous inputs (real-time CCTV video streams, uploaded MP4 files, calibration frame slices, hardware telemetry, and camera geometry) and maps them into the structured TrafficFlow Knowledge Graph:

```
  CAMERA STREAMS (RTSP/HLS)        UPLOADED MP4 VIDEOS        LANE & ROI GEOMETRIES
              │                            │                            │
              ▼                            ▼                            ▼
   [Async Frame Grabber]       [Chunked Video Splitter]     [Polygon & Direction AST]
              │                            │                            │
              └────────────────────────────┼────────────────────────────┘
                                           ▼
                       [Hardware-Tailored Preprocessor]
                     - Color space normalization (uint8)
                     - In-silicon scaling (DMA SRAM)
                     - Spatial crop_rect extraction
                                           ▼
                         [Rockchip RK3588 Tri-Core NPU]
                     - Core 0, 1, 2 parallel execution
                     - 6.0 TOPS INT8 hardware engine
                                           ▼
                       [ByteTrack Multi-Lane Tracking]
                     - Kalman filter position prediction
                     - Two-stage association matching
                                           ▼
                      [Local Sovereign Storage / API]
                     - Atomic SQLite / JSON local DB
                     - Live HUD stream (MJPEG / WebRTC)
```

---

## 2. Auto-Research Loop for Edge Model Compression

Following `design-os-knowledge-builder`, the compression loop operates autonomously to discover the optimal Pareto frontier across **Latency**, **mAP**, **Thermal Power**, and **Memory Footprint**:

```
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. HYPOTHESIS GENERATION                                    │
 │    Candidate: Quantize YOLOv8n to INT8 QDQ with 416x416     │
 └──────────────────────────────┬──────────────────────────────┘
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 2. CALIBRATION & QUANTIZATION                               │
 │    Sample 120 CCTV images; calculate KL-Divergence / MSE    │
 └──────────────────────────────┬──────────────────────────────┘
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 3. PHYSICAL BENCHMARK ON ORANGE PI 5                        │
 │    Measure P50/P95 latency, FPS, memory, thermal drift       │
 └──────────────────────────────┬──────────────────────────────┘
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 4. EPISTEMIC STOPPING GATE (UKMC.v1)                        │
 │    Is mAP loss < 3%? Latency < 16ms? Thermals < 72°C?       │
 └──────────────┬───────────────────────────────┬──────────────┘
                │ [PASS]                        │ [FAIL]
                ▼                               ▼
       [ACCEPT TO REGISTRY]           [TRIGGER GRAPH SURGERY]
       - Register model binary        - Try Mixed Precision QDQ
       - Update Knowledge Graph       - Adjust input resolution
```

---

## 3. Streaming vs. Upload Pipeline Architecture Comparison

| Architecture Dimension | Live CCTV Streaming Pipeline | Uploaded Video Processing Pipeline |
| :--- | :--- | :--- |
| **Ingestion Protocol** | RTSP / MJPEG / WebRTC | HTTP Multipart / Chunked MP4 |
| **Queue Strategy** | **Single-slot queue** (Drops stale frames on jitter to prevent video lag) | **Persistent Celery Queue** (Zero drops, exact frame-by-frame accounting) |
| **Target Resolution** | $416\times 416$ (INT8 RKNN NPU) | $640\times 640$ (High-resolution vehicle classification) |
| **Target Throughput** | $\ge 60\text{ FPS}$ (Tri-core combined) | $\ge 30\text{ FPS}$ (Throughput / batch optimized) |
| **Output Delivery** | Low-latency MJPEG / WebSocket telemetry | Complete JSON audit report + annotated MP4 |
| **Database Persistence**| Interval aggregates (10s window counts) | Full frame-by-frame crossing event ledger |
