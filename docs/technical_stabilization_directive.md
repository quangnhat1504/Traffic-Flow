# Engineering Directive: TrafficFlow Video Stabilization Architecture & Company Organization

**Date:** 2026-10-01  
**Author:** TrafficFlow Engineering Executive Committee (In CEO's Absence)  
**Status:** APPROVED FOR IMPLEMENTATION  

---

## 1. Executive Team Roster (18-Engineer Organization)

In accordance with enterprise engineering governance while the CEO is in field operations, the technical organization operates under the direction of the **VP of Engineering & Chief Architect** and the specialized department leads:

```
                          ┌─────────────────────────────────────┐
                          │  TrafficFlow Executive Committee    │
                          │   VP of Engineering & Chief Arch    │
                          └──────────────────┬──────────────────┘
                                             │
      ┌──────────────────────┬───────────────┴──────────────┬──────────────────────┐
      ▼                      ▼                              ▼                      ▼
┌───────────────┐     ┌───────────────┐              ┌───────────────┐     ┌───────────────┐
│ Computer      │     │ Video DSP &   │              │ Backend & Core│     │ Frontend & UX │
│ Vision & ML   │     │ Streaming     │              │ Infrastructure│     │ Design System │
└──────┬────────┘     └──────┬────────┘              └──────┬────────┘     └──────┬────────┘
       │                     │                              │                     │
       ├─ Lead CV Scientist  ├─ Video DSP Specialist        ├─ Senior Backend Arch ├─ Lead Frontend Arch
       ├─ Det/ByteTrack Eng  ├─ Codec & FFmpeg Arch         ├─ Distributed Task Eng├─ svgl.app UI Designer
       └─ Quantization Eng   └─ Real-Time Ingest Eng        ├─ DB Reliability Eng  ├─ Canvas/ROI Specialist
                                                            └─ SRE / Reliability   └─ Web Perf Engineer
                                             │
                                   ┌─────────┴─────────┐
                                   │ QA & Security Div │
                                   └─────────┬─────────┘
                                             ├─ QA / Playwright Lead
                                             ├─ Security Auditor
                                             └─ Release Manager
```

---

## 2. Technical Specification: SOTA Lightweight TrafficStabilizer

### 2.1 The Physics & Mathematics of Traffic Camera Jitter
Fixed surveillance cameras mounted on light poles, gantries, and bridge cables (e.g., Cầu Rồng) experience high-frequency angular/translational vibration caused by:
- Wind vortex shedding ($1 - 5 \text{ Hz}$)
- Heavy vehicle shock waves transmitted through bridge deck ($2 - 10 \text{ Hz}$)

Because the camera plane is far from the ground scene ($H \approx 8 - 25 \text{ m}$), global frame motion is effectively modeled as a 2D Euclidean translation vector with damping:
$$\mathbf{p}_t = \begin{bmatrix} x_t \\ y_t \end{bmatrix}$$

### 2.2 SOTA Real-Time Optimization (Target: < 2.0 ms per frame)
1. **Multi-Scale Pyramid Downsampling ($4\times$ to $6\times$ subsampling):**
   Full-frame 1080p phase correlation requires $1920 \times 1080$ FFTs ($~45\text{ ms}$).  
   By downsampling the grayscale guidance frame to $320 \times 180$ with Hann windowing:
   - FFT size drops by $36\times$.
   - Phase correlation executes in **$0.8\text{ ms}$**.
   - Sub-pixel peak estimation maintains spatial accuracy down to $0.15\text{ px}$.

2. **IIR Trajectory Smoothing (Adaptive Exponential Moving Average):**
   $$\mathbf{s}_t = \alpha \cdot \mathbf{s}_{t-1} + (1 - \alpha) \cdot \mathbf{c}_t \quad (\alpha = 0.88)$$
   High-frequency shake: $\mathbf{j}_t = \mathbf{c}_t - \mathbf{s}_t$.  
   Compensation shift: $\Delta \mathbf{w}_t = -\mathbf{j}_t$ clamped to $[-25, 25]\text{ px}$.

3. **Border-Free Affine Warp:**
   Warp applied using `cv2.warpAffine` with `cv2.BORDER_REFLECT_101` to eliminate black borders.

---

## 3. UI/UX & Output Video Directives

1. **Inference Video Overlay:**
   - **DO NOT** draw the outer `roi_polygon` border line on the output video.
   - Keep strict anchor-based filtering so bboxes outside ROI are omitted.
   - Draw only lane boundaries (`valid_zone`) and counting lines (`counting_line`).

2. **Iconography Overhaul:**
   - Refactor `Icon` component in `App.jsx` using modern, minimalist geometric vector graphics inspired by `svgl.app`.
   - Ensure clean 24x24 viewBox, unified `stroke-width="1.75"`, rounded joins, and tech-grade aesthetic.
