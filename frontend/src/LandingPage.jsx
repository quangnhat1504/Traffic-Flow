import React, { useMemo, useState } from "react";

const REAL_CAMERAS = [
  {
    id: "cau_rong",
    code: "CAM-01",
    name: "Cầu Rồng · Dragon Bridge",
    location: "Hải Châu, Đà Nẵng",
    image: "/assets/cam_cau_rong.jpg",
    speed: "42 km/h",
    totalCount: 1377,
    status: "flowing",
    lanes: 4,
    fps: "30.0",
    latency: "14.2ms",
    classes: { car: 842, motorcycle: 490, bus: 28, truck: 17 },
  },
  {
    id: "tien_son",
    code: "CAM-02",
    name: "Cầu Tiên Sơn · South Arterial",
    location: "Ngũ Hành Sơn, Đà Nẵng",
    image: "/assets/cam_tien_son.jpg",
    speed: "38 km/h",
    totalCount: 842,
    status: "flowing",
    lanes: 3,
    fps: "30.0",
    latency: "13.8ms",
    classes: { car: 512, motorcycle: 280, bus: 32, truck: 18 },
  },
  {
    id: "tran_thi_ly",
    code: "CAM-03",
    name: "Cầu Trần Thị Lý · Cable Stay",
    location: "Sơn Trà, Đà Nẵng",
    image: "/assets/cam_tran_thi_ly.jpg",
    speed: "34 km/h",
    totalCount: 620,
    status: "flowing",
    lanes: 3,
    fps: "30.0",
    latency: "14.5ms",
    classes: { car: 390, motorcycle: 195, bus: 21, truck: 14 },
  },
  {
    id: "hoang_minh_thang",
    code: "CAM-04",
    name: "Hoàng Minh Thắng · Junction Hub",
    location: "Hòa Cường, Đà Nẵng",
    image: "/assets/cam_hoang_minh_thang.jpg",
    speed: "28 km/h",
    totalCount: 489,
    status: "moderate",
    lanes: 2,
    fps: "30.0",
    latency: "12.9ms",
    classes: { car: 280, motorcycle: 186, bus: 15, truck: 8 },
  },
];

const CAPABILITIES = [
  {
    title: "Sub-Millisecond Camera Stabilization",
    metric: "< 1.0 ms",
    metricLabel: "Per-frame CPU overhead",
    description: "Frequency-domain 2D Hann phase correlation with adaptive temporal IIR smoothing (α = 0.88). Neutralizes pole vibration and bridge sway without GPU dependency.",
    tag: "DSP Core",
  },
  {
    title: "Arbitrary Polygon ROI Calibration",
    metric: "Sub-pixel",
    metricLabel: "Point-in-polygon precision",
    description: "Bottom-center bounding box anchor evaluation. Vehicles outside the calibrated roadway boundary or in adjacent sidewalks are excluded from counting.",
    tag: "Spatial Math",
  },
  {
    title: "Multi-Class Edge Neural Tracking",
    metric: "4 Classes",
    metricLabel: "YOLO + ByteTrack ReID",
    description: "Real-time taxonomy classification for cars, motorcycles, municipal buses, and heavy trucks with persistent trajectory IDs across complex occlusion.",
    tag: "Vision AI",
  },
  {
    title: "100% On-Premise Data Sovereignty",
    metric: "0 bytes",
    metricLabel: "Cloud transmission",
    description: "Engineered for local workstations and edge micro-servers. Video streams never leave the private network, with instant JSON/CSV telemetry exports.",
    tag: "Edge Native",
  },
];

function LandingPage({ onLaunch }) {
  const [selectedCamId, setSelectedCamId] = useState("cau_rong");
  const [showBoxes, setShowBoxes] = useState(true);
  const [showLanes, setShowLanes] = useState(true);
  const [stabilizerActive, setStabilizerActive] = useState(true);

  const activeCam = useMemo(
    () => REAL_CAMERAS.find((c) => c.id === selectedCamId) || REAL_CAMERAS[0],
    [selectedCamId]
  );

  return (
    <div className="landing-shell">
      {/* Top Glassmorphic Navigation */}
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="TrafficFlow home">
          <LogoMark />
          <span>TrafficFlow</span>
        </a>
        <nav className="landing-links" aria-label="Primary navigation">
          <a href="#monitor">Live Cameras</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#architecture">Architecture</a>
        </nav>
        <button
          className="landing-button landing-button-primary landing-nav-cta"
          type="button"
          onClick={() => onLaunch(activeCam.id)}
        >
          Launch Studio Console <Arrow />
        </button>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="landing-hero landing-container" id="product">
          <div className="landing-hero-copy">
            <div className="hero-kicker-pill">
              <span className="live-indicator-dot" />
              <span>EDGE AI TRAFFIC VISION · PRODUCTION SOTA</span>
            </div>
            <h1>Sub-millisecond vehicle vision at the tactical edge.</h1>
            <p className="landing-hero-lede">
              Real-time multi-lane counting, frequency-domain camera stabilization, and custom polygon geometry calibration. 100% on-premise execution with zero cloud latency.
            </p>

            <div className="landing-hero-actions">
              <button
                className="landing-button landing-button-primary hero-main-cta"
                type="button"
                onClick={() => onLaunch(activeCam.id)}
              >
                Launch Studio Console <Arrow />
              </button>
              <a className="landing-text-link" href="#monitor">
                Inspect Live Cameras ↓
              </a>
            </div>

            {/* Quick Proof Metrics */}
            <div className="landing-proof-row">
              <div className="landing-proof">
                <span className="proof-metric">&lt; 0.94 ms</span>
                <div>
                  <strong>Stabilization</strong>
                  <small>Hann phase correlation</small>
                </div>
              </div>
              <div className="landing-proof">
                <span className="proof-metric">4 Classes</span>
                <div>
                  <strong>Vehicle Taxonomy</strong>
                  <small>Car, Motorbike, Bus, Truck</small>
                </div>
              </div>
              <div className="landing-proof">
                <span className="proof-metric">30+ FPS</span>
                <div>
                  <strong>Inference Speed</strong>
                  <small>Real-time edge throughput</small>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Multi-Camera Command Viewport */}
          <div className="landing-hero-viewport" id="monitor">
            <div className="monitor-shell">
              {/* Camera Header Toolbar */}
              <div className="monitor-toolbar">
                <div className="monitor-feed-meta">
                  <span className="monitor-live-dot" />
                  <strong>{activeCam.name}</strong>
                  <span className="meta-sep">/</span>
                  <span className="meta-sub">{activeCam.location}</span>
                </div>
                <div className="monitor-tech-specs">
                  <button
                    type="button"
                    className={`spec-badge interactive-toggle ${stabilizerActive ? "live" : "dim"}`}
                    onClick={() => setStabilizerActive(!stabilizerActive)}
                    title="Toggle Camera Stabilization mode"
                  >
                    STABILIZER: {stabilizerActive ? "0.94ms (LOCKED)" : "BYPASS"}
                  </button>
                  <span className="spec-badge">1080p · {activeCam.fps} FPS</span>
                </div>
              </div>

              {/* Viewport Camera Stage with Interactive Overlays */}
              <div className={`traffic-camera-stage ${stabilizerActive ? "stabilized" : "jittery"}`}>
                <img
                  src={activeCam.image}
                  alt={activeCam.name}
                  className="traffic-camera-img"
                  onError={(e) => {
                    e.currentTarget.src = "/assets/real_camera_cau_rong.jpg";
                  }}
                />

                {/* Interactive SVG HUD Overlays */}
                <svg className="traffic-camera-hud" viewBox="0 0 1020 534" aria-hidden="true">
                  {/* Calibrated Lane Polygons */}
                  {showLanes && (
                    <>
                      <polygon
                        points="110,230 360,220 410,510 80,510"
                        fill="rgba(56, 189, 248, 0.14)"
                        stroke="rgba(56, 189, 248, 0.85)"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                      />
                      <polygon
                        points="360,220 620,210 700,510 410,510"
                        fill="rgba(52, 211, 153, 0.14)"
                        stroke="rgba(52, 211, 153, 0.85)"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                      />
                      {/* Counting Line */}
                      <line x1="90" y1="410" x2="690" y2="410" stroke="#ef4444" strokeWidth="2.5" />
                    </>
                  )}

                  {/* AI Detection Bounding Boxes */}
                  {showBoxes && (
                    <>
                      <g transform="translate(230, 290)">
                        <rect width="120" height="85" rx="3" fill="none" stroke="#38bdf8" strokeWidth="2" />
                        <rect y="-18" width="76" height="18" rx="2" fill="#38bdf8" />
                        <text x="5" y="-5" fill="#03131e" fontSize="10" fontWeight="700" fontFamily="sans-serif">car 0.94</text>
                      </g>
                      <g transform="translate(420, 340)">
                        <rect width="50" height="65" rx="3" fill="none" stroke="#34d399" strokeWidth="2" />
                        <rect y="-18" width="84" height="18" rx="2" fill="#34d399" />
                        <text x="5" y="-5" fill="#03131e" fontSize="10" fontWeight="700" fontFamily="sans-serif">motorbike 0.91</text>
                      </g>
                      <g transform="translate(510, 250)">
                        <rect width="105" height="75" rx="3" fill="none" stroke="#38bdf8" strokeWidth="2" />
                        <rect y="-18" width="76" height="18" rx="2" fill="#38bdf8" />
                        <text x="5" y="-5" fill="#03131e" fontSize="10" fontWeight="700" fontFamily="sans-serif">car 0.92</text>
                      </g>
                      <g transform="translate(130, 190)">
                        <rect width="140" height="95" rx="3" fill="none" stroke="#fbbf24" strokeWidth="2" />
                        <rect y="-18" width="76" height="18" rx="2" fill="#fbbf24" />
                        <text x="5" y="-5" fill="#03131e" fontSize="10" fontWeight="700" fontFamily="sans-serif">bus 0.96</text>
                      </g>
                    </>
                  )}
                </svg>

                {/* Overlaid Quick Toggles */}
                <div className="camera-view-controls">
                  <button
                    type="button"
                    className={`ctrl-chip ${showBoxes ? "active" : ""}`}
                    onClick={() => setShowBoxes(!showBoxes)}
                  >
                    BBoxes {showBoxes ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    className={`ctrl-chip ${showLanes ? "active" : ""}`}
                    onClick={() => setShowLanes(!showLanes)}
                  >
                    Lanes {showLanes ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="camera-timestamp-stamp">
                  <span>YOLOv8n · BYTETRACK</span>
                  <span className="sep">•</span>
                  <span>LATENCY: {activeCam.latency}</span>
                </div>
              </div>

              {/* Real Multi-Camera Switcher Dock */}
              <div className="monitor-telemetry-dock">
                <div className="dock-stat-block">
                  <span className="dock-stat-label">Total Flow Count</span>
                  <div className="dock-stat-number">{activeCam.totalCount.toLocaleString()}</div>
                  <small className="dock-stat-hint">{activeCam.name} · {activeCam.speed}</small>
                </div>

                {/* Camera Tabs */}
                <div className="camera-selector-tabs" role="tablist" aria-label="Select camera feed">
                  {REAL_CAMERAS.map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      role="tab"
                      aria-selected={cam.id === selectedCamId}
                      className={`camera-pill-btn ${cam.id === selectedCamId ? "active" : ""}`}
                      onClick={() => setSelectedCamId(cam.id)}
                    >
                      <span className="cam-code">{cam.code}</span>
                      <span className="cam-title">{cam.name.split("·")[0].trim()}</span>
                      <strong className="cam-count">{cam.totalCount}</strong>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="dock-launch-btn"
                  onClick={() => onLaunch(activeCam.id)}
                  title={`Open ${activeCam.name} in interactive calibration studio`}
                >
                  Open in Studio <Arrow />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Core Engineering Capabilities */}
        <section className="landing-capabilities landing-container" id="capabilities">
          <div className="landing-section-heading">
            <span className="hero-kicker-pill" style={{ margin: "0 auto 12px" }}>CORE ARCHITECTURE</span>
            <h2>Engineered for real-world municipal environments.</h2>
            <p>Designed to maintain rock-solid accuracy on vibrating bridges, high wind poles, and complex multi-lane urban arterials.</p>
          </div>

          <div className="capabilities-grid">
            {CAPABILITIES.map((cap) => (
              <article className="capability-card" key={cap.title}>
                <div className="capability-badge">{cap.tag}</div>
                <div className="capability-metric-row">
                  <span className="capability-metric-value">{cap.metric}</span>
                  <span className="capability-metric-label">{cap.metricLabel}</span>
                </div>
                <h3>{cap.title}</h3>
                <p>{cap.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Section 3: Architecture Pipeline Flow */}
        <section className="landing-pipeline landing-container" id="architecture">
          <div className="landing-section-intro">
            <span className="hero-kicker-pill" style={{ margin: "0 auto 12px" }}>DETERMINISTIC PIPELINE</span>
            <h2>Five-stage edge vision workflow.</h2>
            <p>From frame intake to sub-pixel vibration cancellation, arbitrary geometry containment, and persistent tracking.</p>
          </div>

          <div className="pipeline-flow-cards">
            <div className="flow-step-card">
              <div className="flow-step-num">01</div>
              <h4>Stream Ingest</h4>
              <p>RTSP, H.264, YouTube live feeds or local MP4 files ingested with zero frame dropping.</p>
            </div>
            <div className="flow-step-card">
              <div className="flow-step-num">02</div>
              <h4>Hann Stabilization</h4>
              <p>2D phase correlation on 320x180 grayscale eliminates pole vibration in &lt;1.0ms on CPU.</p>
            </div>
            <div className="flow-step-card">
              <div className="flow-step-num">03</div>
              <h4>Geometry Containment</h4>
              <p>Arbitrary polygon ROI isolates vehicles strictly inside lanes, ignoring sidewalk pedestrian noise.</p>
            </div>
            <div className="flow-step-card">
              <div className="flow-step-num">04</div>
              <h4>YOLO + ByteTrack</h4>
              <p>High-confidence multi-class vehicle detection with trajectory tracking across occlusions.</p>
            </div>
            <div className="flow-step-card">
              <div className="flow-step-num">05</div>
              <h4>Telemetry Export</h4>
              <p>Instant line-crossing events, speed estimation, and atomic CSV/JSON exports without page reload.</p>
            </div>
          </div>
        </section>

        {/* Section 4: Final Call to Action */}
        <section className="landing-final-cta landing-container">
          <div className="cta-card">
            <h2>Start Analyzing Traffic in Real Time</h2>
            <p>Load real Da Nang intersection cameras or upload your own traffic video to calibrate lanes in seconds.</p>
            <button
              className="landing-button landing-button-primary cta-large-btn"
              type="button"
              onClick={() => onLaunch(activeCam.id)}
            >
              Launch Studio Console Now <Arrow />
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <div className="landing-brand">
            <LogoMark />
            <span>TrafficFlow</span>
          </div>
          <p>Automated edge computer vision and flow intelligence for municipal transportation.</p>
        </div>
        <div className="landing-footer-bottom">
          <span>TrafficFlow 2026 Production Edition · FastAPI · YOLOv8 · Celery</span>
          <span>100% On-Premise Data Sovereignty</span>
        </div>
      </footer>
    </div>
  );
}

function LogoMark() {
  return (
    <svg className="landing-logo-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19h16" />
      <path d="M6 19l4-14h4l4 14" />
      <line x1="12" y1="5" x2="12" y2="8" />
      <line x1="12" y1="11" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12" y2="19" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg className="arrow-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10" />
      <path d="M9 4l4 4-4 4" />
    </svg>
  );
}

export default LandingPage;
