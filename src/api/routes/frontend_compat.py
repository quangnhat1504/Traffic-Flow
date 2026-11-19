"""Compatibility routes matching frontend's expected API endpoints."""

import logging
import os
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse

from shared.database import get_database
from api.middleware.file_validator import validate_video_file
from api.services.upload_service import create_uploaded_video_task_from_path, save_upload_to_temp
from api.schemas.task import TaskCreateRequest
from api.schemas.lane import LaneConfigRequest
from api.routes.tasks import process_task, get_task_status, get_task_result

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/videos")
async def compat_upload(request: Request, file: UploadFile = File(...)):
    file = validate_video_file(file)
    db = get_database()
    if db is None:
        raise HTTPException(503, "Database not connected")

    temp_path = await save_upload_to_temp(file)
    try:
        uploaded = await create_uploaded_video_task_from_path(
            request=request,
            db=db,
            video_path=temp_path,
            content_type=file.content_type or "video/mp4",
        )
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

    return {
        "task_id": uploaded.video_id,
        "video_id": uploaded.video_id,
        "status": "uploaded",
        "preview_url": uploaded.preview_url,
        "working_video_url": uploaded.task_doc["working_video_url"],
        "original_resolution": uploaded.task_doc["original_resolution"],
        "working_resolution": uploaded.task_doc["working_resolution"],
    }


@router.get("/videos/{task_id}/preview")
async def compat_preview(task_id: str):
    if task_id == "demo-cau-rong-danang":
        demo_file = Path("storage/previews/cd0ff4ec-e1d2-45ba-9501-ecaa0213b396.jpg")
        if demo_file.exists():
            return FileResponse(str(demo_file), media_type="image/jpeg")
    preview = Path("storage/previews") / f"{task_id}.jpg"
    if preview.exists():
        return FileResponse(str(preview), media_type="image/jpeg")
    raise HTTPException(404, "Preview not found")


@router.post("/tasks")
async def compat_submit(request: Request, payload: dict):
    import traceback
    video_id = payload.get("task_id") or payload.get("video_id", "")
    lane_config = payload.get("lane_config")

    if not video_id:
        raise HTTPException(400, "task_id or video_id required")
    if video_id in {"demo-cau-rong-danang", "cam-01"}:
        return {"task_id": "demo-cau-rong-danang", "status": "completed", "progress": 100}
    db = get_database()
    if db is None:
        raise HTTPException(503, "Database not connected")

    # Check if task exists
    task = await db.tasks.find_one({"video_id": video_id})
    if not task:
        task = await db.tasks.find_one({"task_id": video_id})
    if not task:
        raise HTTPException(404, f"No upload session found for {video_id}")

    task_id = task["task_id"]
    video_id = task.get("video_id") or video_id

    # If task was previously completed or failed, allow re-running analysis
    if task.get("status") in {"completed", "failed"}:
        await db.tasks.update_one(
            {"task_id": task_id},
            {"$set": {"status": "configured", "progress": 0, "stage": "configured", "updated_at": datetime.utcnow()}},
        )

    # Save lane config if provided by frontend
    if lane_config:
        cfg = dict(lane_config)
        cfg["video_id"] = video_id
        try:
            # The compatibility endpoint receives an untyped JSON body, so it
            # must apply the same contract as /api/v1/lanes/config before the
            # document can reach the worker.
            validated_cfg = LaneConfigRequest.model_validate(cfg)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Invalid lane configuration") from exc

        cfg = validated_cfg.model_dump()
        cfg["video_id"] = video_id
        cfg["task_id"] = task_id
        cfg["created_at"] = datetime.utcnow()
        await db.lane_configs.update_one(
            {"video_id": video_id},
            {"$set": cfg},
            upsert=True,
        )
        await db.tasks.update_one(
            {"task_id": task_id},
            {"$set": {"status": "configured", "updated_at": datetime.utcnow()}},
        )

    try:
        req = TaskCreateRequest(video_id=video_id)
        resp = await process_task(req, request, db=db)
        return {"task_id": resp.task_id, "status": resp.status, "progress": 0}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Process failed: {e}")


@router.get("/tasks/{task_id}")
async def compat_status(task_id: str):
    if task_id == "demo-cau-rong-danang":
        return {
            "task_id": "demo-cau-rong-danang",
            "status": "completed",
            "progress": 100,
            "stage": "completed",
            "stage_detail": "Đà Nẵng Cầu Rồng traffic counting completed (1,377 vehicles).",
        }
    from shared.database import get_database
    db = get_database()
    resp = await get_task_status(task_id, db=db)
    return {
        "task_id": resp.task_id,
        "status": resp.status,
        "progress": resp.progress,
        "stage": resp.stage,
        "stage_detail": resp.stage_detail,
    }


@router.get("/tasks/{task_id}/result")
async def compat_result(task_id: str):
    if task_id == "demo-cau-rong-danang":
        return {
            "task_id": "demo-cau-rong-danang",
            "status": "completed",
            "counts": {
                "lane_1": {"car": 3, "motorcycle": 10, "bus": 1, "truck": 2},
                "lane_2": {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0},
            },
            "total_count": 16,
            "lane_volume_total": 16,
            "global_unique_count": 16,
            "multi_lane_track_count": 0,
            "multi_lane_tracks": [],
            "outputs": {"video_path": "/static/results/264801f2-290c-4163-9efd-876eb0627b0a.mp4"},
            "total_frames": 3614,
            "frames": 3614,
        }
    import traceback
    from shared.database import get_database
    db = get_database()
    if db is None:
        raise HTTPException(503, "Database not connected")
    try:
        resp = await get_task_result(task_id, db=db)

        # Build counts: lane_id -> {vehicle_type: count}
        counts = {}
        for s in resp.statistics:
            lane_id = s.lane_id
            if lane_id not in counts:
                counts[lane_id] = {}
            # LaneStatistics has counts dict: {"car": 5, "bus": 2}
            for vt, cnt in (s.counts or {}).items():
                counts[lane_id][vt] = counts[lane_id].get(vt, 0) + cnt

        return {
            "task_id": resp.task_id,
            "status": resp.status,
            "counts": counts,
            "total_count": resp.total_vehicles,
            "lane_volume_total": resp.lane_volume_total,
            "global_unique_count": resp.global_unique_count,
            "multi_lane_track_count": resp.multi_lane_track_count,
            "multi_lane_tracks": resp.multi_lane_tracks,
            "outputs": {"video_path": resp.result_video_url},
            "total_frames": 0,
            "frames": 0,
        }
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        logger.error(tb)
        raise HTTPException(500, f"Result failed: {e}")


@router.get("/demo/sample")
async def compat_demo_sample():
    """Returns bundled demo data for Đà Nẵng Cầu Rồng so operators can explore without uploading."""
    return {
        "task_id": "demo-cau-rong-danang",
        "video_id": "demo-cau-rong-danang",
        "name": "Đà Nẵng - Cầu Rồng Arterial Hub",
        "status": "completed",
        "preview_url": "/static/previews/cd0ff4ec-e1d2-45ba-9501-ecaa0213b396.jpg",
        "working_video_url": "/static/uploads/cd0ff4ec-e1d2-45ba-9501-ecaa0213b396.mp4",
        "result_video_url": "/static/results/264801f2-290c-4163-9efd-876eb0627b0a.mp4",
        "original_resolution": "1920x1080",
        "working_resolution": "1920x1080",
        "lane_config": {
            "movement_threshold_px": 5,
            "cooldown_frames": 12,
            "cooldown_distance_px": 32,
            "zone_policy": "flexible",
            "lanes": [
                {
                    "id": "lane-1",
                    "lane_id": "lane_1",
                    "valid_zone": [[200, 450], [800, 450], [900, 1000], [100, 1000]],
                    "counting_line": [[150, 700], [850, 700]],
                    "direction": [[500, 600], [500, 800]]
                },
                {
                    "id": "lane-2",
                    "lane_id": "lane_2",
                    "valid_zone": [[820, 450], [1400, 450], [1500, 1000], [750, 1000]],
                    "counting_line": [[800, 700], [1450, 700]],
                    "direction": [[1100, 800], [1100, 600]]
                }
            ]
        },
        "statistics": {
            "total_count": 16,
            "lane_volume_total": 16,
            "global_unique_count": 16,
            "counts": {
                "lane_1": {"car": 3, "motorcycle": 10, "bus": 1, "truck": 2},
                "lane_2": {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
            }
        }
    }
