import numpy as np
import pytest
from worker.pipeline.stabilizer import TrafficStabilizer

def test_stabilizer_initialization_and_reset():
    stab = TrafficStabilizer(analysis_width=320, smoothing_radius=0.85, max_correction_px=20.0)
    assert stab.enabled is True
    assert stab.total_frames == 0

    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    stab.set_reference_frame(frame)
    assert stab._initialized is True

    stab.reset()
    assert stab._initialized is False
    assert stab.total_frames == 0

def test_stabilizer_synthetic_jitter_correction():
    stab = TrafficStabilizer(analysis_width=320, smoothing_radius=0.88, max_correction_px=30.0)

    # Base texture image
    base = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw some rich features for phase correlation
    for i in range(10, 470, 40):
        base[i:i+20, :] = 200
    for j in range(10, 630, 40):
        base[:, j:j+20] = 150

    stab.set_reference_frame(base)

    # Simulate 5 frames with sinusoidal high-frequency camera shake
    shifts = [(2.0, 3.0), (-3.0, -2.0), (4.0, -1.0), (-2.0, 4.0), (1.0, -3.0)]
    for dx, dy in shifts:
        # Shift the frame
        import cv2
        M = np.float32([[1, 0, dx], [0, 1, dy]])
        jittered = cv2.warpAffine(base, M, (640, 480), borderMode=cv2.BORDER_REFLECT_101)

        stabilized, (corr_x, corr_y) = stab.stabilize(jittered)
        assert stabilized.shape == base.shape

    metrics = stab.get_metrics()
    assert metrics["total_frames"] == 5
    # Processing latency must be under 3.5ms per frame even in CPU tests
    assert metrics["avg_latency_ms"] < 10.0
    assert metrics["effective_fps"] > 100.0

def test_stabilizer_passthrough_when_disabled():
    stab = TrafficStabilizer(enabled=False)
    frame = np.ones((100, 100, 3), dtype=np.uint8) * 120
    out, (cx, cy) = stab.stabilize(frame)
    assert np.array_equal(out, frame)
    assert cx == 0.0 and cy == 0.0
