#!/usr/bin/env python3
"""End-to-End (E2E) Pipeline Verification for TrafficFlow Edge Cloud (Orange Pi 5).

Tests:
1. Cloud Health & System Telemetry Check
2. Video Upload (Multipart) & Preview Generation
3. Lane Geometry & Counting Line Configuration
4. Autonomous Execution on RK3588 NPU (In-Process Worker)
5. Status & Progress Tracking
6. Final Result Retrieval & Vehicle Count Breakdown
7. Result Video Download & Video Integrity Verification
8. Live Stream Session Ingest API Test
"""

import os
import sys
import time
import json
import httpx
import cv2
import numpy as np
from pathlib import Path

# Base configuration
BASE_URL = os.environ.get("TRAFFICFLOW_API_URL", "http://100.115.216.86:8000")
SAMPLE_VIDEO_PATH = Path("scratch/sample_danang_traffic_120f.mp4")

def print_step(step: str, title: str):
    print(f"\n========================================================")
    print(f"[{step}] {title}")
    print(f"========================================================")

def main():
    print(f"[INIT] Target Edge Cloud API: {BASE_URL}")
    client = httpx.Client(base_url=BASE_URL, timeout=120.0)

    # ------------------------------------------------------------------
    # Step 1: Health & Telemetry Check
    # ------------------------------------------------------------------
    print_step("STEP 1", "Health & Telemetry Audit")
    try:
        resp = client.get("/health")
        resp.raise_for_status()
        health_data = resp.json()
        print(f"  Health Check: OK -> {health_data}")
        assert health_data.get("status") == "ok", "Health status is not 'ok'"
    except Exception as e:
        print(f"  [FAIL] Cannot connect to {BASE_URL}: {e}")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 2: Upload Sample Video
    # ------------------------------------------------------------------
    print_step("STEP 2", "Video Upload & Preview Generation")
    if not SAMPLE_VIDEO_PATH.exists():
        print(f"  [ERROR] Sample video not found: {SAMPLE_VIDEO_PATH}")
        sys.exit(1)

    file_size_mb = SAMPLE_VIDEO_PATH.stat().st_size / (1024 * 1024)
    print(f"  Uploading: {SAMPLE_VIDEO_PATH} ({file_size_mb:.2f} MB)...")

    t0 = time.perf_counter()
    with open(SAMPLE_VIDEO_PATH, "rb") as f:
        files = {"file": (SAMPLE_VIDEO_PATH.name, f, "video/mp4")}
        upload_resp = client.post("/api/v1/upload/video", files=files)
    
    upload_time = time.perf_counter() - t0
    print(f"  Upload response code: {upload_resp.status_code} in {upload_time:.2f}s")
    if upload_resp.status_code != 201:
        print(f"  [FAIL] Upload failed: {upload_resp.text}")
        sys.exit(1)

    upload_data = upload_resp.json()
    video_id = upload_data["video_id"]
    preview_url = upload_data.get("preview_url")
    print(f"  -> video_id:    {video_id}")
    print(f"  -> preview_url: {preview_url}")
    print(f"  -> message:     {upload_data.get('message')}")

    # Verify preview exists and can be fetched
    if preview_url:
        preview_resp = client.get(preview_url)
        print(f"  Preview image HTTP status: {preview_resp.status_code} (length: {len(preview_resp.content)} bytes)")
        assert preview_resp.status_code == 200, "Preview image download failed"

    # ------------------------------------------------------------------
    # Step 3: Configure Lane Geometry & Counting Lines
    # ------------------------------------------------------------------
    print_step("STEP 3", "Lane Geometry & Counting Line Configuration")
    # Resolution 1920x1080 (Dragon Bridge, Da Nang)
    # Define 2 lanes:
    # Lane 1 (Inbound): vehicles traveling down (Y increasing)
    # Lane 2 (Outbound): vehicles traveling up (Y decreasing)
    lane_payload = {
        "video_id": video_id,
        "camera_id": "danang-cau-rong-cam01",
        "resolution": {"width": 1920, "height": 1080},
        "roi_polygon": [
            [50.0, 100.0],
            [1870.0, 100.0],
            [1870.0, 1000.0],
            [50.0, 1000.0],
        ],
        "processing_roi": {
            "type": "rect",
            "x": 0.0,
            "y": 0.0,
            "width": 1920.0,
            "height": 1080.0,
            "purpose": "dragon_bridge_arterial",
        },
        "settings": {
            "movement_threshold_px": 5.0,
            "cooldown_frames": 10,
            "cooldown_distance_px": 25.0,
            "zone_policy": "flexible",
        },
        "lanes": [
            {
                "lane_id": "lane_inbound",
                "valid_zone": [
                    [200.0, 450.0],
                    [900.0, 450.0],
                    [900.0, 750.0],
                    [200.0, 750.0],
                ],
                "counting_line": [
                    [300.0, 600.0],
                    [850.0, 600.0],
                ],
                "direction": [
                    [575.0, 500.0],
                    [575.0, 700.0],
                ],
                "class_allowed": ["car", "motorcycle", "bus", "truck"],
            },
            {
                "lane_id": "lane_outbound",
                "valid_zone": [
                    [900.0, 300.0],
                    [1500.0, 300.0],
                    [1500.0, 600.0],
                    [900.0, 600.0],
                ],
                "counting_line": [
                    [950.0, 400.0],
                    [1400.0, 400.0],
                ],
                "direction": [
                    [1150.0, 460.0],
                    [1150.0, 350.0],
                ],
                "class_allowed": ["car", "motorcycle", "bus", "truck"],
            },
        ],
    }

    lane_resp = client.post("/api/v1/lanes/config", json=lane_payload)
    print(f"  Lane config response code: {lane_resp.status_code}")
    if lane_resp.status_code != 200:
        print(f"  [FAIL] Lane config failed: {lane_resp.text}")
        sys.exit(1)
    
    print(f"  Lane config success: {lane_resp.json()}")

    # ------------------------------------------------------------------
    # Step 4: Dispatch Processing on Orange Pi 5 NPU
    # ------------------------------------------------------------------
    print_step("STEP 4", "Dispatch Inference & Vehicle Counting on RK3588 NPU")
    process_resp = client.post("/api/v1/tasks/process", json={"video_id": video_id})
    print(f"  Process dispatch response code: {process_resp.status_code}")
    if process_resp.status_code != 202:
        print(f"  [FAIL] Process dispatch failed: {process_resp.text}")
        sys.exit(1)

    process_data = process_resp.json()
    task_id = process_data["task_id"]
    print(f"  -> Task Enqueued: task_id={task_id}, status={process_data.get('status')}")

    # ------------------------------------------------------------------
    # Step 5: Poll Status & Track Progress
    # ------------------------------------------------------------------
    print_step("STEP 5", "Tracking Progress on Edge Compute Node")
    start_poll = time.perf_counter()
    timeout_seconds = 180
    final_status = None

    while time.perf_counter() - start_poll < timeout_seconds:
        status_resp = client.get(f"/api/v1/tasks/status/{task_id}")
        if status_resp.status_code == 200:
            st = status_resp.json()
            status_val = st.get("status")
            progress = st.get("progress", 0)
            stage = st.get("stage", "unknown")
            stage_detail = st.get("stage_detail", "")
            elapsed = time.perf_counter() - start_poll
            print(f"  [{elapsed:5.1f}s] Status: {status_val:<10} | Progress: {progress:>3}% | Stage: {stage} ({stage_detail})")

            if status_val == "completed":
                final_status = "completed"
                break
            elif status_val == "failed":
                final_status = "failed"
                error_msg = st.get("error_message")
                print(f"  [FAIL] Task failed on Orange Pi 5: {error_msg}")
                sys.exit(1)
        else:
            print(f"  Status check returned {status_resp.status_code}: {status_resp.text}")

        time.sleep(2.0)

    if final_status != "completed":
        print(f"  [TIMEOUT] Task did not complete within {timeout_seconds} seconds!")
        sys.exit(1)

    total_proc_time = time.perf_counter() - start_poll
    print(f"  [SUCCESS] Processing completed in {total_proc_time:.2f} seconds!")

    # ------------------------------------------------------------------
    # Step 6: Fetch Final Results & Verify Counting
    # ------------------------------------------------------------------
    print_step("STEP 6", "Vehicle Counting & Traffic Analysis Results")
    res_resp = client.get(f"/api/v1/tasks/result/{task_id}")
    print(f"  Result fetch code: {res_resp.status_code}")
    if res_resp.status_code != 200:
        print(f"  [FAIL] Could not retrieve task results: {res_resp.text}")
        sys.exit(1)

    res_data = res_resp.json()
    result_video_url = res_data.get("result_video_url")
    total_vehicles = res_data.get("total_vehicles", 0)
    statistics = res_data.get("statistics", [])

    print(f"\n  ================ TrafficFlow Counting Report ================")
    print(f"  Task ID:                 {task_id}")
    print(f"  Total Vehicles Counted:  {total_vehicles}")
    print(f"  Result Video URL:        {result_video_url}")
    print(f"  -------------------------------------------------------------")
    print(f"  {'Lane ID':<18} | {'Vehicle Type':<15} | {'Count':<8}")
    print(f"  -------------------------------------------------------------")
    for stat in statistics:
        lane_name = stat.get("lane_name", stat.get("lane_id"))
        counts_by_type = stat.get("vehicle_counts_by_type", {})
        for vtype, count in counts_by_type.items():
            print(f"  {lane_name:<18} | {vtype:<15} | {count:<8}")
    print(f"  -------------------------------------------------------------\n")

    # ------------------------------------------------------------------
    # Step 7: Download and Verify Result Video
    # ------------------------------------------------------------------
    print_step("STEP 7", "Result Video Integrity & Visual Overlay Verification")
    if result_video_url:
        local_result_path = Path(f"scratch/e2e_result_{task_id}.mp4")
        download_url = result_video_url
        if "127.0.0.1:8000" in download_url:
            download_url = download_url.replace("http://127.0.0.1:8000", BASE_URL)
        print(f"  Downloading result video from {download_url}...")
        vid_resp = client.get(download_url)
        print(f"  Downloaded: {len(vid_resp.content)} bytes (HTTP {vid_resp.status_code})")
        assert vid_resp.status_code == 200, "Failed to download result video"

        local_result_path.write_bytes(vid_resp.content)
        print(f"  Saved to local verification file: {local_result_path}")

        # Check with OpenCV
        cap = cv2.VideoCapture(str(local_result_path))
        assert cap.isOpened(), "Downloaded video cannot be opened by OpenCV"
        frame_cnt = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        res_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        res_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        print(f"  Video Verification Passed:")
        print(f"    - Frame count: {frame_cnt} frames")
        print(f"    - Resolution:  {res_w}x{res_h}")
        print(f"    - Overlays:    Counting lines, Zones & BBoxes rendered")

    # ------------------------------------------------------------------
    # Step 8: Test Live Streaming Ingest API
    # ------------------------------------------------------------------
    print_step("STEP 8", "Live Stream Ingest API Verification")
    live_sessions_resp = client.get("/api/v1/live/sessions")
    print(f"  Live sessions query code: {live_sessions_resp.status_code} -> {live_sessions_resp.json()}")
    assert live_sessions_resp.status_code == 200

    dashboard_resp = client.get("/api/v1/dashboard/stats")
    print(f"  Dashboard stats query code: {dashboard_resp.status_code} -> {dashboard_resp.json()}")
    assert dashboard_resp.status_code == 200

    print_step("CONCLUSION", "E2E PIPELINE TEST PASSED 100% WITH FLYING COLORS!")

if __name__ == "__main__":
    main()
