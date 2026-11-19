# TrafficFlow Scoring Criteria & Multi-Axis Benchmark Matrix (v2.0)
*Evaluation Standards for Real-Time Streaming, Batch Upload, and RK3588 Edge NPU*

---

## 1. Multi-Axis Evaluation Matrix Overview

Every model variant, edge deployment release, and video pipeline iteration is scored across **6 Independent Axes**:

| Dimension | Evaluation Metric | Production Threshold (Target) | Edge Failure Threshold (Redline) | Weight |
| :--- | :--- | :--- | :--- | :--- |
| **1. Edge Latency** | $P_{95}$ per-frame inference | $\le 16.0\text{ ms}$ ($416\times 416$) | $> 25.0\text{ ms}$ | $25\%$ |
| **2. Stream Throughput**| End-to-end RTSP/MJPEG FPS | $\ge 60.0\text{ FPS}$ (Tri-core) | $< 25.0\text{ FPS}$ | $20\%$ |
| **3. Counting Accuracy**| Total Vehicle WAPE & Recall | $\text{WAPE} \le 5.0\%$, $\text{Recall} \ge 94\%$ | $\text{WAPE} > 12.0\%$ | $25\%$ |
| **4. Tracking Integrity**| ID Switches & Fragmentations | $\text{IDSW} \le 2 / 100\text{ tracks}$, $\text{IDF1} \ge 0.82$| $\text{IDF1} < 0.70$ | $15\%$ |
| **5. Hardware Footprint**| DRAM Usage & SoC Thermal | $\text{RAM} \le 1.2\text{ GB}$, $T_{\text{SoC}} \le 68^\circ\text{C}$ | $\text{RAM} > 2.0\text{ GB}$, $T > 75^\circ\text{C}$| $10\%$ |
| **6. Resilience** | Zero-Lag Drop Ratio | Stale frame lag $\le 0.1\text{ s}$ (1-slot queue) | Frame lag $> 1.0\text{ s}$ | $5\%$ |

$$\text{Final Score} = \sum_{i=1}^6 w_i \cdot S_i \in [0.0, 100.0]$$

---

## 2. Detailed Metric Specifications

### Axis 1: Edge Inference Latency on RK3588 NPU
- **$P_{50}$ (Median Latency):** Expected $\le 12.0\text{ ms}$ on INT8 Tri-core (`NPU_CORE_0_1_2`).
- **$P_{95}$ (Tail Latency):** Measured over 1,000 frames under concurrent stream ingest.
- **Normalization In-Silicon:** Zero CPU time spent on `cv2.cvtColor` or `/255.0` division.

### Axis 2: Video Streaming & Upload Throughput
- **Live RTSP Stream Mode:**
  - Ingestion buffer: Single-slot latest frame (`LIVE_FRAME_QUEUE_SIZE=1`).
  - Network jitter pacing: Dropped stale frames must not stall the detector thread.
  - Telemetry HUD: Real-time overlay rendered in $< 1.5\text{ ms}$ per frame.
- **Video Upload Mode:**
  - Processing Speed Ratio (PSR): $\text{PSR} = \frac{\text{Video Duration}}{\text{Processing Time}} \ge 2.5\times$ (a 60s video processes in $\le 24\text{s}$).

### Axis 3 & 4: Detection, Tracking, and Lane Counting Quality
- **Weighted Absolute Percentage Error (WAPE):**
  $$\text{WAPE} = \frac{\sum_{l \in \text{Lanes}} |\text{Count}_{\text{pred}}^{(l)} - \text{Count}_{\text{GT}}^{(l)}|}{\sum_{l \in \text{Lanes}} \text{Count}_{\text{GT}}^{(l)}} \times 100\%$$
- **Directional Gate Compliance:** Vehicles moving against the authorized lane vector must be classified as reverse/anomalous and NOT increment legitimate forward counts.
- **Spatial Containment:** Bounding box center or bottom-center must fall within the defined lane polygon ROI before crossing the trigger line.

### Axis 5: Edge Hardware Resource Envelope
- **Physical Memory (Orange Pi 5 8GB):** Total system RAM consumption of the combined stack (API + Worker + Redis + RKNN Runtime) must stay below $1.5\text{ GB}$, leaving $\ge 6.0\text{ GB}$ free for OS caching and video buffers.
- **Thermal Envelope:** Under 30 minutes of continuous live inference, SoC thermal throttling must NOT engage ($T_{\text{cpu}} \le 70^\circ\text{C}$).

---

## 3. Automated Scoring Rubric & Benchmark Grade

| Composite Score | Grade | Operational Decision |
| :--- | :--- | :--- |
| **$90.0 - 100.0$** | **Grade A (Production Ready)** | Auto-deploy to Orange Pi 5 edge cluster. |
| **$80.0 - 89.9$** | **Grade B (Edge Acceptable)** | Qualified for field testing with alert telemetry. |
| **$70.0 - 79.9$** | **Grade C (Requires Surgery)** | Trigger graph surgery, tune NMS / confidence, or crop ROI. |
| **$< 70.0$** | **Grade F (Rejected)** | Fails Epistemic Stopping Gate (UKMC.v1); deployment blocked. |
