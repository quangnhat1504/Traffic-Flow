# Autonomous Multi-Agent Team Roster & Operating Architecture
*TrafficFlow Edge Intelligence Engineering Division*

---

## 1. Multi-Agent Organization Model

To manage full-lifecycle edge intelligence (from model quantization and video streaming to on-device validation and knowledge graph compilation), the agent workforce is structured into **5 Specialized Roles**:

```
                              ┌────────────────────────────────────────┐
                              │       COORDINATOR / ORCHESTRATOR       │
                              │ (Autonomous Workflow & Stopping Gate)  │
                              └───────────────────┬────────────────────┘
                                                  │
         ┌─────────────────────────┬──────────────┴──────────────┬─────────────────────────┐
         ▼                         ▼                             ▼                         ▼
┌──────────────────┐      ┌──────────────────┐          ┌──────────────────┐      ┌──────────────────┐
│  AGENT ROLE 1    │      │   AGENT ROLE 2   │          │   AGENT ROLE 3   │      │   AGENT ROLE 4   │
│ Edge NPU &       │      │ Streaming & Media│          │ Edge Cloud &     │      │ QA, Benchmarking │
│ Quantization     │      │ Subsystem Eng.   │          │ Container Arch.  │      │ & Verification   │
└────────┬─────────┘      └────────┬─────────┘          └────────┬─────────┘      └────────┬─────────┘
         │                         │                             │                         │
         └─────────────────────────┴──────────────┬──────────────┴─────────────────────────┘
                                                  ▼
                                      ┌───────────────────────┐
                                      │     AGENT ROLE 5      │
                                      │ Knowledge Graph &     │
                                      │ Epistemic Gatekeeper  │
                                      └───────────────────────┘
```

---

## 2. Agent Role Descriptions & Responsibilities

### Role 1: Edge NPU & Quantization Architect (`agent:edge_npu_architect`)
- **Primary Mission:** Rockchip RK3588 NPU acceleration, graph surgery, and quantization stability.
- **Specific Responsibilities:**
  - Convert PyTorch models to ONNX and `.rknn` binaries.
  - Implement and verify on-device calibration using CCTV domain footage.
  - Tune NPU tri-core masks (`NPU_CORE_0_1_2` vs. dedicated core routing).
  - Enforce in-silicon normalization (`uint8` DMA input, zero CPU pixel casting).
- **Core Skillset:** `computer-vision-expert`, `edge-ai-and-embedded-vision`, `rknn-toolkit-lite2`.

### Role 2: Real-Time Streaming & Media Subsystem Engineer (`agent:streaming_media_engineer`)
- **Primary Mission:** Zero-lag live CCTV video ingestion, RTSP/HLS/MJPEG streaming, and chunked upload processing.
- **Specific Responsibilities:**
  - Maintain low-latency single-slot frame queues (`LIVE_FRAME_QUEUE_SIZE=1`).
  - Implement network jitter smoothing and reconnection backoff.
  - Optimize ROI cropping (`crop_rect`) and spatial polygon containment.
  - Manage live HUD rendering with sub-2ms latency.
- **Core Skillset:** `api-and-interface-design`, `performance-optimization`, `observability-and-instrumentation`.

### Role 3: Distributed Edge Cloud & Containerization Architect (`agent:edge_cloud_architect`)
- **Primary Mission:** Containerization, offline resilience, and remote deployment to Orange Pi 5.
- **Specific Responsibilities:**
  - Maintain multi-stage ARM64 `Dockerfile.opi5` and `docker-compose.opi5.yml`.
  - Pass through hardware devices (`/dev/dri/renderD129`, `/dev/video0`).
  - Guarantee local-sovereign fallback (`storage/local_db.json`, local disk uploads) during cloud outages.
  - Automate SSH/Tailscale deployment pipeline (`scripts/deploy_to_opi5.ps1`).
- **Core Skillset:** `ci-cd-and-automation`, `security-and-hardening`, `shipping-and-launch`.

### Role 4: QA, Benchmarking & Verification Auditor (`agent:verification_auditor`)
- **Primary Mission:** Empirical hardware benchmarking, test suite execution, and regression prevention.
- **Specific Responsibilities:**
  - Execute automated pytest suites across geometry, runtime engine, and API integration.
  - Measure on-device latency ($P_{50}, P_{90}, P_{95}$), FPS, DRAM footprint, and thermal drift.
  - Calculate vehicle counting accuracy, WAPE, and ID switch rates.
  - Validate scoring criteria and issue pass/fail certificates.
- **Core Skillset:** `test-driven-development`, `debugging-and-error-recovery`, `doubt-driven-development`.

### Role 5: Knowledge Graph & Epistemic Gatekeeper (`agent:epistemic_curator`)
- **Primary Mission:** Universal knowledge compilation, documentation hygiene, and formal stopping gate enforcement.
- **Specific Responsibilities:**
  - Maintain the TrafficFlow Knowledge Graph (`docs/knowledge_graph/`).
  - Enforce the UKMC.v1 stopping gate protocol (prevent hallucination, model drift, and unverified assumptions).
  - Log unresolved design questions and architectural choices into `docs/DESIGN_QUESTIONS_AND_CONFIRMATIONS.md`.
  - Clean up junk scripts, noisy documents, and stale logs.
- **Core Skillset:** `spec-driven-development`, `documentation-and-adrs`, `context-engineering`.
