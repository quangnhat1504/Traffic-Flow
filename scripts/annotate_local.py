#!/usr/bin/env python3
"""
TrafficFlow Local Annotation & Counting Tool
===========================================
Run inference locally using YOLO + ByteTrack + Counting Gates.
Allows reusing existing configs (e.g., Cau Rong, Danang, UA-DETRAC, or custom)
to annotate videos locally with rich telemetry overlays and export counted MP4 + JSONL events.

Usage:
    python scripts/annotate_local.py --video "data/raw/danang/Cầu Rồng.mp4" --config configs/danang/cau_rong_manual.json
    python scripts/annotate_local.py --video "data/raw/danang/Cầu Rồng.mp4" --preset cau_rong --max-frames 150
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Ensure project root and src/ are in sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "src"))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import cv2
import numpy as np

from tfengine.runtime.engine import (
    TrafficFlowEngine,
    VideoCountingRequest,
    scale_config_to_video,
    _effective_total_frames,
)
from tfengine.core_ai import YoloByteTrackDetector
from tfengine.counting.methods import TrackObservation, build_counter
from tfengine.geometry import bbox_bottom_center


PRESETS = {
    "cau_rong": PROJECT_ROOT / "configs/danang/cau_rong_manual.json",
    "traffic_01": PROJECT_ROOT / "configs/examples/traffic_01_manual.json",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run local video annotation & counting with existing geometry configs.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--video",
        type=Path,
        required=True,
        help="Path to input video file (e.g. data/raw/danang/Cầu Rồng.mp4)",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to JSON lane/geometry config. If not specified, --preset is used.",
    )
    parser.add_argument(
        "--preset",
        choices=list(PRESETS.keys()),
        default="cau_rong",
        help="Preset config to use if --config is omitted.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="models/yolov8n.pt",
        help="Path to YOLO weights (.pt)",
    )
    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="Inference device: '0' for CUDA GPU, 'cpu' for host CPU. Auto-detected if None.",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="YOLO detection confidence threshold.",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=None,
        help="Maximum frames to process (useful for quick previews or smoke testing).",
    )
    parser.add_argument(
        "--output-video",
        type=Path,
        default=None,
        help="Output video path. Defaults to storage/results/annotated_<name>.mp4",
    )
    parser.add_argument(
        "--output-jsonl",
        type=Path,
        default=None,
        help="Output JSONL events log. Defaults to storage/results/events_<name>.jsonl",
    )
    parser.add_argument(
        "--no-hud",
        action="store_true",
        help="Disable the top-right telemetry HUD overlay.",
    )
    return parser.parse_args()


def draw_rich_hud(frame: np.ndarray, counts: dict, frame_idx: int, total_frames: Optional[int], fps_current: float) -> None:
    """Draws a sleek, modern telemetry HUD on the top-right corner."""
    h, w = frame.shape[:2]
    hud_w = min(420, int(w * 0.35))
    hud_h = 160 + len(counts) * 32
    pad_x = 24
    pad_y = 24

    x1 = w - hud_w - pad_x
    y1 = pad_y
    x2 = w - pad_x
    y2 = pad_y + hud_h

    # Semi-transparent dark tinted backdrop
    overlay = frame.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (15, 18, 25), -1)
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 200, 255), 2)  # Glowing border
    cv2.addWeighted(overlay, 0.78, frame, 0.22, 0, frame)

    # Header
    cv2.putText(frame, "TRAFFICFLOW LOCAL RUNTIME", (x1 + 16, y1 + 32), cv2.FONT_HERSHEY_DUPLEX, 0.65, (0, 220, 255), 1)
    
    # Progress & FPS
    progress_str = f"Frame: {frame_idx}" + (f"/{total_frames}" if total_frames else "")
    fps_str = f"Speed: {fps_current:.1f} FPS"
    cv2.putText(frame, f"{progress_str} | {fps_str}", (x1 + 16, y1 + 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    cv2.line(frame, (x1 + 16, y1 + 72), (x2 - 16, y1 + 72), (60, 70, 80), 1)

    # Total Count
    total_vehicles = sum(sum(v.values()) for v in counts.values())
    cv2.putText(frame, f"TOTAL COUNT: {total_vehicles}", (x1 + 16, y1 + 102), cv2.FONT_HERSHEY_DUPLEX, 0.75, (255, 255, 255), 2)

    # Per-lane breakdown
    curr_y = y1 + 134
    for lane_id, lane_counts in counts.items():
        lane_sum = sum(lane_counts.values())
        details = " ".join(f"{k}:{v}" for k, v in lane_counts.items() if v > 0) or "idle"
        cv2.putText(frame, f"[{lane_id.upper()}]: {lane_sum} ({details})", (x1 + 16, curr_y), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (120, 255, 120), 1)
        curr_y += 28


def main() -> int:
    args = parse_args()

    # Resolve Video
    if not args.video.exists():
        print(f"[ERROR] Video file not found: {args.video}", file=sys.stderr)
        return 1

    # Resolve Config
    config_path = args.config
    if config_path is None:
        config_path = PRESETS.get(args.preset)
        if not config_path or not config_path.exists():
            print(f"[ERROR] Preset config '{args.preset}' not found at {config_path}", file=sys.stderr)
            return 1
        print(f"[INFO] Using preset configuration: '{args.preset}' -> {config_path}")
    else:
        if not config_path.exists():
            print(f"[ERROR] Config file not found: {config_path}", file=sys.stderr)
            return 1
        print(f"[INFO] Using custom configuration: {config_path}")

    # Resolve Output Paths
    video_stem = args.video.stem
    results_dir = PROJECT_ROOT / "storage" / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    output_video = args.output_video or (results_dir / f"annotated_{video_stem}.mp4")
    output_jsonl = args.output_jsonl or (results_dir / f"events_{video_stem}.jsonl")
    output_video.parent.mkdir(parents=True, exist_ok=True)
    output_jsonl.parent.mkdir(parents=True, exist_ok=True)

    print("=" * 65)
    print(" TRAFFICFLOW LOCAL ANNOTATION ENGINE")
    print("=" * 65)
    print(f" Input Video   : {args.video}")
    print(f" Geometry CFG  : {config_path}")
    print(f" YOLO Model    : {args.model}")
    print(f" Device        : {args.device or 'Auto'}")
    print(f" Max Frames    : {args.max_frames or 'Full Video'}")
    print(f" Output Video  : {output_video}")
    print(f" Output Events : {output_jsonl}")
    print("=" * 65)

    # Load & scale config
    config = json.loads(config_path.read_text(encoding="utf-8"))
    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        print(f"[ERROR] Could not open video: {args.video}", file=sys.stderr)
        return 1

    video_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    raw_total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    effective_total = _effective_total_frames(raw_total_frames, args.max_frames)

    print(f"[VIDEO INFO] Resolution: {video_w}x{video_h} | FPS: {fps:.2f} | Frames: {effective_total or 'Unknown'}")

    config = scale_config_to_video(config, video_w, video_h)
    counter = build_counter(config)

    # Initialize Detector
    print("[AI INITIALIZE] Loading YOLO + ByteTrack detector...")
    detector = YoloByteTrackDetector(
        args.model,
        confidence=args.conf,
        device=args.device,
        imgsz=640,
    )

    # Video Writer
    writer = cv2.VideoWriter(
        str(output_video),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (video_w, video_h),
    )
    jsonl_fp = output_jsonl.open("w", encoding="utf-8")

    frame_idx = 0
    start_time = time.perf_counter()
    fps_smooth = fps

    print("[PROCESSING] Starting inference loop...")
    try:
        while True:
            if args.max_frames is not None and frame_idx >= args.max_frames:
                break
            ok, frame = cap.read()
            if not ok:
                break

            t0 = time.perf_counter()
            detections = detector.detect_and_track(frame)
            observations = [
                TrackObservation(
                    track_id=d.track_id,
                    class_name=d.class_name,
                    bbox_xyxy=d.bbox_xyxy,
                    point=bbox_bottom_center(d.bbox_xyxy),
                )
                for d in detections
            ]
            events = counter.update(observations, frame_idx)

            # Draw geometry
            for lane in config.get("lanes", []):
                # Valid Zone
                if lane.get("valid_zone"):
                    pts = [tuple(map(int, p)) for p in lane["valid_zone"]]
                    for a, b in zip(pts, pts[1:] + pts[:1]):
                        cv2.line(frame, a, b, (0, 180, 255), 2)
                # Counting Line
                line = [tuple(map(int, p)) for p in lane["counting_line"]]
                cv2.line(frame, line[0], line[1], (0, 0, 255), 3)
                # Direction arrow
                if lane.get("direction"):
                    direction = [tuple(map(int, p)) for p in lane["direction"]]
                    cv2.arrowedLine(frame, direction[0], direction[1], (255, 120, 0), 2, tipLength=0.25)
                # Lane label
                lane_count = sum(counter.counts.get(lane["lane_id"], {}).values())
                cv2.putText(frame, f"LANE {lane['lane_id']}: {lane_count}", (line[0][0], max(line[0][1] - 8, 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)

            # Draw Detections
            for d, obs in zip(detections, observations):
                x1, y1, x2, y2 = [int(v) for v in d.bbox_xyxy]
                pt = tuple(int(v) for v in obs.point)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (40, 220, 40), 2)
                cv2.circle(frame, pt, 5, (255, 255, 0), -1)
                label = f"{d.class_name} #{d.track_id}"
                cv2.putText(frame, label, (x1, max(y1 - 6, 15)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (40, 220, 40), 2)

            # Draw Event Triggers
            for event in events:
                pt = tuple(int(v) for v in event.point)
                cv2.circle(frame, pt, 16, (0, 0, 255), 3)
                jsonl_fp.write(json.dumps(event.__dict__, ensure_ascii=False) + "\n")

            frame_cost = time.perf_counter() - t0
            fps_smooth = 0.9 * fps_smooth + 0.1 * (1.0 / max(frame_cost, 0.001))

            # Draw Telemetry HUD
            if not args.no_hud:
                draw_rich_hud(frame, counter.counts, frame_idx + 1, effective_total, fps_smooth)

            writer.write(frame)
            frame_idx += 1

            if frame_idx % 10 == 0 or (effective_total and frame_idx == effective_total):
                pct = (frame_idx / effective_total * 100) if effective_total else 0.0
                elapsed = time.perf_counter() - start_time
                print(f"  -> Processed [{frame_idx}/{effective_total or '?'}] ({pct:.1f}%) | Speed: {fps_smooth:.1f} FPS | Elapsed: {elapsed:.1f}s", end="\r")

    finally:
        cap.release()
        writer.release()
        jsonl_fp.close()

    total_time = time.perf_counter() - start_time
    avg_fps = frame_idx / max(total_time, 0.001)

    print("\n" + "=" * 65)
    print(" ANNOTATION & COUNTING COMPLETED")
    print("=" * 65)
    print(f" Total Frames Processed: {frame_idx}")
    print(f" Total Duration Elapsed : {total_time:.2f} seconds ({avg_fps:.1f} FPS average)")
    print(f" Output Video File      : {output_video}")
    print(f" Output Events JSONL    : {output_jsonl}")
    print("-" * 65)
    print(" FINAL TRAFFIC COUNT MATRIX:")
    for lane_id, lane_counts in counter.counts.items():
        total_lane = sum(lane_counts.values())
        print(f"   Lane [{lane_id}]: Total = {total_lane} | {lane_counts}")
    print("=" * 65)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
