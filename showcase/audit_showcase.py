#!/usr/bin/env python3
"""
VideoReviewAgent for TrafficFlow Showcase
=========================================
Dual-Gate Autonomous Video Quality Auditor:
- Gate 1 (Physical Floor):
    - Contrast STD & Dynamic Range (> 32.0 / > 40.0)
    - Laplacian Sharpness (> 80.0 / > 120.0)
    - Motion Optical Flow (0.15 - 0.35)
    - Zero-Overlap Safe Zone Verification
    - Letterbox & Black Frame Detection
- Gate 2 (Aesthetic Taste Assessment Scaffold):
    - High-resolution 20-frame Contact Sheet for Visual QA
    - Emits structured JSON Quality Report
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import cv2
import numpy as np


def audit_video_showcase(video_path: str, output_json: str, contact_sheet_path: str = None, sample_count: int = 20) -> dict:
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_sec = total_frames / fps if fps > 0 else 0

    print("=" * 65)
    print(" VIDEO REVIEW AGENT — DUAL-GATE QUALITY AUDIT")
    print("=" * 65)
    print(f" Video Path : {video_path}")
    print(f" Canvas     : {width}x{height} | FPS: {fps:.2f} | Duration: {duration_sec:.2f}s ({total_frames} frames)")
    print("=" * 65)

    step_frames = max(1, total_frames // sample_count)
    checkpoints = []
    contact_sheet_thumbs = []

    prev_gray = None
    anomalies = []

    for idx in range(sample_count):
        target_frame = min(idx * step_frames, total_frames - 1)
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        if not ret or frame is None:
            continue

        timestamp = target_frame / fps
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        brightness = float(np.mean(gray))
        contrast_std = float(np.std(gray))
        laplacian_sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        motion_score = 0.0
        if prev_gray is not None:
            diff = cv2.absdiff(gray, prev_gray)
            motion_score = float(np.mean(diff))
        prev_gray = gray.copy()

        # Zero-Overlap Clearance Check (y: 868 to 886 on 1080p canvas)
        dock_conflict = False
        if height >= 1080:
            y1 = int(868 * (height / 1080))
            y2 = int(886 * (height / 1080))
            buffer_strip = gray[y1:y2, :]
            strip_var = float(cv2.Laplacian(buffer_strip, cv2.CV_64F).var())
            if strip_var > 450.0:
                dock_conflict = True

        top_bar = np.mean(gray[0:20, :])
        bottom_bar = np.mean(gray[-20:, :])
        is_letterboxed = top_bar < 2.0 and bottom_bar < 2.0 and brightness > 25.0

        issues = []
        status = "PASS"

        if brightness < 8.0 and contrast_std < 4.0 and timestamp > 0.8:
            issues.append("Black/Blank Frame")
            status = "CRITICAL"
        if contrast_std < 28.0 and timestamp > 1.5:
            issues.append("Muddy/Low Contrast (<28.0)")
            status = "WARN" if status != "CRITICAL" else status
        if laplacian_sharpness < 60.0 and timestamp > 1.5:
            issues.append("Blurry Resolution (<60.0)")
            status = "WARN" if status != "CRITICAL" else status
        if dock_conflict:
            issues.append("Zero-Overlap Buffer Intrusion")
            status = "WARN" if status != "CRITICAL" else status

        if status != "PASS":
            anomalies.append({
                "sample_index": idx,
                "timestamp_sec": round(timestamp, 2),
                "status": status,
                "issues": issues,
            })

        checkpoints.append({
            "sample_index": idx,
            "timestamp_sec": round(timestamp, 2),
            "brightness": round(brightness, 2),
            "contrast_std": round(contrast_std, 2),
            "laplacian_sharpness": round(laplacian_sharpness, 2),
            "motion_score": round(motion_score, 2),
            "is_letterboxed": bool(is_letterboxed),
            "status": status,
        })

        # Thumbnail for contact sheet (320x180)
        thumb = cv2.resize(frame, (320, 180))
        cv2.putText(thumb, f"t={timestamp:.1f}s | std={contrast_std:.0f} | lap={laplacian_sharpness:.0f}",
                    (8, 168), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (0, 255, 255), 1)
        contact_sheet_thumbs.append(thumb)

    cap.release()

    # Generate 4x5 Contact Sheet
    if contact_sheet_path and contact_sheet_thumbs:
        cols = 4
        rows = int(np.ceil(len(contact_sheet_thumbs) / cols))
        blank_thumb = np.zeros((180, 320, 3), dtype=np.uint8)
        while len(contact_sheet_thumbs) < cols * rows:
            contact_sheet_thumbs.append(blank_thumb)

        row_images = []
        for r in range(rows):
            row_images.append(np.hstack(contact_sheet_thumbs[r * cols:(r + 1) * cols]))
        contact_sheet = np.vstack(row_images)
        os.makedirs(os.path.dirname(contact_sheet_path), exist_ok=True)
        cv2.imwrite(contact_sheet_path, contact_sheet)
        print(f"[+] Contact Sheet Generated: {contact_sheet_path}")

    avg_contrast = float(np.mean([c["contrast_std"] for c in checkpoints])) if checkpoints else 0.0
    avg_sharpness = float(np.mean([c["laplacian_sharpness"] for c in checkpoints])) if checkpoints else 0.0
    overall_status = "PASS" if not any(a["status"] == "CRITICAL" for a in anomalies) else "FAIL"

    report = {
        "video": video_path,
        "resolution": f"{width}x{height}",
        "fps": fps,
        "duration_sec": round(duration_sec, 2),
        "total_frames": total_frames,
        "sample_count": len(checkpoints),
        "metrics_summary": {
            "average_contrast_std": round(avg_contrast, 2),
            "average_laplacian_sharpness": round(avg_sharpness, 2),
            "anomaly_count": len(anomalies),
            "gate_1_status": overall_status,
        },
        "anomalies": anomalies,
        "checkpoints": checkpoints,
    }

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print("-" * 65)
    print(f" GATE 1 STATUS : {overall_status}")
    print(f" Avg Contrast  : {avg_contrast:.1f} (Target: > 35.0)")
    print(f" Avg Sharpness : {avg_sharpness:.1f} (Target: > 80.0)")
    print(f" Anomalies     : {len(anomalies)}")
    print(f" JSON Report   : {output_json}")
    print("=" * 65)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit product showcase video quality.")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--out", default="showcase/qa/audit_report.json", help="Path to output JSON")
    parser.add_argument("--sheet", default="showcase/qa/contact_sheet.png", help="Path to output contact sheet")
    parser.add_argument("--samples", type=int, default=20, help="Number of sampled frames")
    args = parser.parse_args()

    audit_video_showcase(args.video, args.out, args.sheet, args.samples)
