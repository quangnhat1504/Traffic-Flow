# TrafficFlow Strategic Master Plan & Long-Term Roadmap (2026–2027)
*From Standalone Edge Box to Distributed Smart City Traffic Mesh*

---

## 1. Vision & Architecture Evolution

TrafficFlow evolves from an ad-hoc computer vision prototype into an enterprise-grade, privacy-first **Edge AI Traffic Operating System (Edge-TOS)**. 

The architecture is built on three foundational pillars:
1. **Edge-First Sovereignty:** The Orange Pi 5 board acts as the autonomous edge cloud—processing video streams locally, keeping raw CCTV video on-premise, and emitting only lightweight semantic events and counts.
2. **Hardware-Native Performance:** Direct utilization of the 6.0 TOPS Rockchip RK3588 NPU, zero-copy DMA buffers, and tri-core parallelism.
3. **Formal Knowledge & Epistemic Verification:** Continuous self-evaluating knowledge graph (UKMC.v1) governing model compression, multi-agent workflows, and system reliability.

---

## 2. 5-Phase Strategic Roadmap

```mermaid
flowchart LR
    P1["Phase 1: Stabilization & Sanitation"] --> P2["Phase 2: RKNN NPU & Edge Cloud"]
    P2 --> P3["Phase 3: Multi-Camera CCTV Mesh"]
    P3 --> P4["Phase 4: Cloud Sync & Central DB"]
    P4 --> P5["Phase 5: Autonomous ITS Operations"]

    style P1 fill:#22c55e,stroke:#16a34a,stroke-width:2px,color:#fff
    style P2 fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff
    style P3 fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff
    style P4 fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff
    style P5 fill:#ec4899,stroke:#db2777,stroke-width:2px,color:#fff
```

### Phase 1: Stabilization, Epistemic Knowledge Graph & Repository Sanitation (CURRENT)
- [x] Clean up repository: remove junk dumps, dead scripts, noisy drafts, and orphaned logs.
- [x] Rebuild Knowledge Graph referencing `design-os-knowledge-builder` (`UKMC.v1` protocol).
- [x] Unify detection backend supporting PyTorch, ONNX, and RKNN NPU.
- [x] Ensure 100% offline resilience: local JSON/SQLite database fallback, local storage mock.
- [x] Formulate multi-axis scoring criteria and multi-agent team structure.
- [x] Establish design question bank (`docs/DESIGN_QUESTIONS_AND_CONFIRMATIONS.md`).

### Phase 2: Edge NPU Model Optimization & Docker Deployment on Orange Pi 5 (NEXT)
- [x] Construct ARM64 production `Dockerfile.opi5` and `docker-compose.opi5.yml`.
- [x] Automate remote deployment script `scripts/deploy_to_opi5.ps1`.
- [ ] Compile calibrated INT8 `.rknn` models on target board `100.115.216.86` using CCTV dataset.
- [ ] Measure physical Tri-core NPU latency and thermal envelope under 60-minute continuous run.
- [ ] Verify live CCTV streaming with sub-100ms end-to-end glass-to-glass latency.

### Phase 3: Multi-Stream Video Pipeline & Advanced Spatial Analytics (Q1 2027)
- [ ] Concurrently ingest 3-4 RTSP CCTV streams on a single Orange Pi 5 board (1 core per stream).
- [ ] Implement advanced vehicle re-identification across adjacent camera angles.
- [ ] Add spatial anomaly detection (illegal U-turns, wrong-way driving, queue spillback alerts).
- [ ] Deploy embedded WebRTC live stream gateway for instant low-latency browser monitoring.

### Phase 4: Hybrid Cloud Sync & Distributed Storage Reconnection (Q2 2027)
- [ ] Implement resilient store-and-forward synchronizer: when cloud DB (MongoDB / Postgres) and R2 storage come back online, edge nodes securely sync historical aggregated telemetry without network saturation.
- [ ] Multi-tenant edge device management and fleet OTA firmware/model updates.
- [ ] Edge-to-edge gossip protocol for decentralized intersection coordination.

### Phase 5: Autonomous Intelligent Transportation System (ITS) Integration (Q3–Q4 2027)
- [ ] Integration with municipal traffic signal controllers (NTCIP 1202 / SCATS / SCOOT protocols).
- [ ] Dynamic green-light phase extension based on real-time vehicle queue counts.
- [ ] Predictive congestion modeling and rerouting event feeds.
- [ ] Zero-knowledge cryptographic proof of traffic statistics for open-data compliance.
