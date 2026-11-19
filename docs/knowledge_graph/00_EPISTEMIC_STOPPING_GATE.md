# Formal Epistemic Stopping Gate Protocol (`UKMC.v1`)
**TrafficFlow Edge AI & Rockchip RK3588 (Orange Pi 5) Knowledge Pipeline**
*Referencing Architecture: `jangtrinh/design-os-knowledge-builder` (Universal Multimodal Knowledge Pipeline & Epistemic Stopping Gate)*

---

## 1. Executive Protocol Overview

The **Universal Knowledge Mining & Compilation protocol (UKMC.v1)** establishes deterministic epistemic boundaries for autonomous AI coding agents, edge AI engineering pipelines, and multi-agent systems.

### Core Problem It Solves:
Unbounded LLMs and optimization scripts suffer from "prompt vibes", infinite token/parameter exploration loops, and unverified assumptions. In edge AI computer vision deployment (specifically targeting constrained hardware like the **Orange Pi 5 RK3588 SoC**), ungrounded decisions result in:
1. Quantization collapse (e.g. naive static INT8 calibration dropping mAP from $0.519$ to $0.020$).
2. Thermal throttling and out-of-memory (OOM) fatal crashes.
3. Pipeline drift between desktop training environments and on-device ARM64 NPU runtimes.
4. Hallucinated APIs and fake hardware capabilities.

`UKMC.v1` establishes **5 Non-Negotiable Epistemic Stopping Gates**. An agent or optimization step CANNOT declare completion without cryptographic and deterministic proof of compliance.

```
       RAW SOURCES / INPUTS
 (CCTV Videos, Specs, Code, Models)
                 │
                 ▼
 ┌──────────────────────────────┐
 │ GATE 1: Cryptographic Model  │ ──[FAIL]──▶ HALT & Reject Checksum
 │         Integrity & Artifact │
 └──────────────┬───────────────┘
                │ [PASS]
                ▼
 ┌──────────────────────────────┐
 │ GATE 2: Deterministic        │ ──[FAIL]──▶ REVERT & Fallback to FP16
 │         Quantization Drift   │
 └──────────────┬───────────────┘
                │ [PASS]
                ▼
 ┌──────────────────────────────┐
 │ GATE 3: Physical RK3588 NPU  │ ──[FAIL]──▶ AUTO-TUNE Core Mask / Dim
 │         Latency & Thermal    │
 └──────────────┬───────────────┘
                │ [PASS]
                ▼
 ┌──────────────────────────────┐
 │ GATE 4: Zero-Telemetry &     │ ──[FAIL]──▶ ISOLATE Air-Gapped Sandbox
 │         Air-Gapped Privacy   │
 └──────────────┬───────────────┘
                │ [PASS]
                ▼
 ┌──────────────────────────────┐
 │ GATE 5: Epistemic Stopping   │ ──[PASS]──▶ CERTIFIED EDGE DEPLOYMENT
 │         Convergence Gate     │
 └──────────────────────────────┘
```

---

## 2. The 5 Formal Epistemic Stopping Gates

### Gate 1: Cryptographic Artifact & Model Integrity
Every model weight file, calibration dataset, and configuration file must produce a deterministic SHA-256 hash verified against the registry before entering the conversion or inference pipeline.

- **Rule 1.1 (Model Hash Verification):**
  $$\text{SHA256}(\text{model\_file}) \equiv \text{Registry}[\text{model\_id}].\text{sha256}$$
  If hash mismatches or file is unverified, execution halts immediately.
- **Rule 1.2 (Graph Operator Verification):**
  The ONNX graph must be checked against Rockchip RKNN operator compatibility tables (`rknn_compatible_ops`). Any unsupported operator (e.g. non-standard GridSample or dynamic shape Slice) triggers pre-export graph surgery before compilation.

### Gate 2: Deterministic Precision & Quantization Drift Gate
When compressing models from FP32/FP16 to INT8 for the RK3588 6 TOPS NPU:
- **Rule 2.1 (Maximum Accuracy Loss Bound):**
  $$\Delta \text{mAP}_{50:95} = \text{mAP}_{\text{FP32}} - \text{mAP}_{\text{INT8}} \le 0.030 \quad (3.0\%)$$
  If naive INT8 quantization exceeds $3\%$ degradation, the pipeline must automatically invoke **Selective Mixed-Precision (`QDQ`)** or **FP16 Hybrid execution**; it cannot push a broken model to production.
- **Rule 2.2 (Numerical Stability):**
  Zero `NaN`, zero `Inf`, and zero tensor saturation across 100 consecutive CCTV test frames.

### Gate 3: Physical RK3588 NPU Latency & Thermal Envelope
- **Rule 3.1 (Latency Ceiling):**
  - Input resolution $416\times 416$: $P_{95} \le 16.0\text{ ms}$ (throughput $\ge 62.5\text{ FPS}$).
  - Input resolution $320\times 320$: $P_{95} \le 10.0\text{ ms}$ (throughput $\ge 100.0\text{ FPS}$).
- **Rule 3.2 (Core Mask Allocation):**
  The engine must support deterministic core masks:
  - `NPU_CORE_0` (1 core / 2 TOPS) for low-power continuous background tasks.
  - `NPU_CORE_0_1_2` (3 cores / 6 TOPS) for high-throughput multi-lane streaming.
- **Rule 3.3 (Thermal Boundary):**
  SoC temperature $T_{\text{SoC}} \le 72.0^\circ\text{C}$ under 15 minutes of continuous full-load CCTV video processing. If thermal throttling is detected, the engine drops non-critical frames via 1-slot queue instead of accumulating latency.

### Gate 4: Zero-Telemetry & Air-Gapped Privacy Boundary
- **Rule 4.1 (Local Sovereign Operation):**
  The entire edge cloud on Orange Pi 5 must operate 100% offline when external cloud and databases are unreachable:
  - Local database fallback: `storage/local_db.json` (atomic write + SQLite WAL option).
  - Local storage: file serving via `/static/` endpoints directly from disk.
  - Zero external metrics, tracking beacons, or telemetry transmissions.
- **Rule 4.2 (Credential Isolation):**
  No hardcoded credentials, cloud secrets, or raw private video frames exposed to unauthenticated external endpoints.

### Gate 5: Epistemic Convergence Stopping Rule
An autonomous agent loop (research, optimization, or hyperparameter search) MUST terminate when:
1. Target metric thresholds (Gates 1-4) are met; OR
2. Search budget exhaustion ($N_{\text{iterations}} \ge N_{\text{max}}$); OR
3. Diminishing returns: Marginal improvement $\delta < 0.2\%$ over 3 consecutive optimization passes.

Agents are strictly forbidden from looping endlessly or rationalizing away failed thresholds.

---

## 3. Machine-Readable Gate Verification Schema

```json
{
  "$schema": "https://trafficflow.ai/schemas/ukmc-v1.json",
  "protocol": "UKMC.v1",
  "target_hardware": {
    "soc": "Rockchip RK3588S",
    "board": "Orange Pi 5",
    "npu_tops": 6.0,
    "cores": 3,
    "driver": "/dev/dri/renderD129"
  },
  "gates": {
    "gate_1_integrity": {
      "verified": true,
      "sha256": "verified_hash_token"
    },
    "gate_2_precision": {
      "metric": "mAP_50_95",
      "baseline_fp32": 0.519,
      "quantized_int8": 0.508,
      "delta": 0.011,
      "threshold_max_delta": 0.030,
      "status": "PASSED"
    },
    "gate_3_hardware_latency": {
      "resolution": "416x416",
      "p50_ms": 11.99,
      "p95_ms": 14.20,
      "threshold_p95_ms": 16.0,
      "fps": 83.4,
      "status": "PASSED"
    },
    "gate_4_zero_telemetry": {
      "offline_mode": true,
      "external_calls_intercepted": 0,
      "status": "PASSED"
    },
    "gate_5_epistemic_stopping": {
      "stopping_condition_met": true,
      "reason": "ALL_GATES_SATISFIED"
    }
  }
}
```
