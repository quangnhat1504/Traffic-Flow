#!/usr/bin/env bash
"""Benchmark RKNN inference latency on Orange Pi 5 RK3588 Tri-Core NPU."""
import time
import numpy as np
from pathlib import Path
import sys

# Ensure src in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from tfengine.edge_npu.rknn_engine import RKNNDetector

def run_benchmark():
    base_dir = Path(__file__).resolve().parent.parent
    model_paths = [
        base_dir / "models/rknn/my_finetuned_yolov8_416_int8.rknn",
        base_dir / "models/rknn/yolov8n_416_int8.rknn",
    ]

    for model_path in model_paths:
        if not model_path.exists():
            print(f"[SKIP] Model not found: {model_path}")
            continue

        print(f"\n==========================================")
        print(f"Benchmarking RKNN Model: {model_path.name}")
        print(f"==========================================")

        detector = RKNNDetector(
            model_path=str(model_path),
            confidence_threshold=0.25,
            input_size=(416, 416),
        )

        dummy_frame = np.random.randint(0, 255, (416, 416, 3), dtype=np.uint8)

        # Warmup
        print("--> Warming up NPU (5 iterations)...")
        for _ in range(5):
            detector.detect(dummy_frame)

        # Timed benchmark
        latencies = []
        n_iters = 50
        print(f"--> Running {n_iters} timed iterations on RK3588 NPU...")
        for _ in range(n_iters):
            t0 = time.perf_counter()
            detections = detector.detect(dummy_frame)
            latencies.append((time.perf_counter() - t0) * 1000.0)

        detector.release()

        p50 = np.percentile(latencies, 50)
        p95 = np.percentile(latencies, 95)
        fps = 1000.0 / p50

        print(f"[RESULT] {model_path.name}:")
        print(f"  P50 Latency: {p50:.2f} ms")
        print(f"  P95 Latency: {p95:.2f} ms (UKMC.v1 Stopping Gate: <= 16.0 ms)")
        print(f"  Throughput:  {fps:.1f} FPS")

        if p95 <= 16.0:
            print("  Status:      PASSED UKMC.v1 Gate (P95 <= 16ms)")
        else:
            print("  Status:      WARNING: P95 > 16ms")

if __name__ == "__main__":
    run_benchmark()
