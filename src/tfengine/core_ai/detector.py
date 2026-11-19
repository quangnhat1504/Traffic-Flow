from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence


# Canonical COCO vehicle classes used by TrafficFlow
COCO_VEHICLE_NAMES = {"car", "motorcycle", "bus", "truck"}
COCO_VEHICLE_IDS = [2, 3, 5, 7]  # COCO: 2=car, 3=motorcycle, 5=bus, 7=truck

# Aliases (legacy configs may use "motorbike" → map to motorcycle)
_CLASS_ALIASES = {"motorbike": "motorcycle"}


@dataclass(frozen=True)
class Detection:
    track_id: int
    class_id: int
    class_name: str
    confidence: float
    bbox_xyxy: tuple[float, float, float, float]


class YoloByteTrackDetector:
    def __init__(
        self,
        model_path: str,
        classes: Optional[Sequence[str]] = None,
        confidence: float = 0.1,
        device: Optional[str] = None,
        imgsz: int = 640,
        half: bool = False,
        class_ids: Optional[Sequence[int]] = None,
        class_name_map: Optional[dict[int, str]] = None,
        backend: Optional[str] = None,
    ):
        self.model_path = model_path
        self.confidence = confidence
        self.device = device
        self.imgsz = imgsz
        self.half = half
        # Auto-detect class mapping for fine-tuned Vietnamese vehicle models (4 classes: motorbike, car, minibus, truck)
        if model_path and ("finetuned" in str(model_path).lower() or "vietnamese" in str(model_path).lower()):
            self.class_ids = list(class_ids) if class_ids is not None else [0, 1, 2, 3]
            self.class_name_map = class_name_map or {
                0: "motorcycle",
                1: "car",
                2: "bus",
                3: "truck",
            }
        else:
            self.class_ids = list(class_ids) if class_ids else COCO_VEHICLE_IDS
            self.class_name_map = class_name_map or {
                2: "car",
                3: "motorcycle",
                5: "bus",
                7: "truck",
            }

        if classes is not None:
            self.classes = {_CLASS_ALIASES.get(c, c) for c in classes} & COCO_VEHICLE_NAMES
        else:
            self.classes = set(COCO_VEHICLE_NAMES)

        # Detect backend: "rknn", "onnx", or "ultralytics"
        ext = os.path.splitext(model_path)[1].lower() if model_path else ""
        if backend:
            self.backend = backend.lower()
        elif ext == ".rknn":
            self.backend = "rknn"
        elif ext == ".onnx":
            self.backend = "onnx"
        else:
            self.backend = "ultralytics"

        self.rknn_detector = None
        self.onnx_detector = None
        self.model = None
        self._local_tracker = None

        if self.backend == "rknn":
            from tfengine.edge_npu.rknn_engine import RKNNDetector
            self.rknn_detector = RKNNDetector(
                model_path=model_path,
                confidence_threshold=self.confidence,
                input_size=(self.imgsz, self.imgsz),
                class_ids=self.class_ids,
            )
            self._init_local_tracker()
        elif self.backend == "onnx":
            from tfengine.edge_npu.onnx_engine import ONNXDetector
            self.onnx_detector = ONNXDetector(
                model_path=model_path,
                confidence_threshold=self.confidence,
                input_size=(self.imgsz, self.imgsz),
                class_ids=self.class_ids,
            )
            self._init_local_tracker()
        else:
            try:
                from ultralytics import YOLO
            except ImportError as exc:
                raise RuntimeError(
                    "Missing dependency 'ultralytics'. Install it to run Phase B: "
                    "python -m pip install ultralytics"
                ) from exc

            self.model = YOLO(model_path)
            # Apply half precision on model itself (newer ultralytics API)
            if self.half and self.device and self.device != "cpu":
                try:
                    self.model.model.half()
                except Exception:
                    pass

    def _init_local_tracker(self):
        try:
            from worker.pipeline.tracker import LocalTracker
            self._local_tracker = LocalTracker(
                match_threshold=0.3,
                track_buffer=30,
            )
        except Exception:
            self._local_tracker = None

    def detect_and_track(self, frame) -> List[Detection]:
        if self.backend in ("rknn", "onnx"):
            raw_dets = self.detect_raw(frame)
            if self._local_tracker is not None:
                # Format for LocalTracker: list of dicts
                obs = [
                    {
                        "class_id": d.class_id,
                        "class_name": d.class_name,
                        "confidence": d.confidence,
                        "bbox_xyxy": list(d.bbox_xyxy),
                    }
                    for d in raw_dets
                ]
                tracks = self._local_tracker.update(obs)
                inv_map = {name: cid for cid, name in self.class_name_map.items()}
                return [
                    Detection(
                        track_id=t.track_id,
                        class_id=inv_map.get(t.class_name, 2),
                        class_name=t.class_name,
                        confidence=t.confidence,
                        bbox_xyxy=tuple(float(v) for v in t.bbox_xyxy),
                    )
                    for t in tracks
                    if not t.is_lost
                ]
            return raw_dets

        results = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            conf=self.confidence,
            device=self.device,
            classes=self.class_ids,
            imgsz=self.imgsz,
            verbose=False,
        )
        if not results:
            return []

        result = results[0]
        if result.boxes is None or result.boxes.id is None:
            return []

        names = result.names
        boxes = result.boxes.xyxy.cpu().tolist()
        ids = result.boxes.id.cpu().tolist()
        class_ids = result.boxes.cls.cpu().tolist()
        confidences = result.boxes.conf.cpu().tolist()

        detections: List[Detection] = []
        for bbox, track_id, class_id, conf in zip(boxes, ids, class_ids, confidences):
            class_id_int = int(class_id)
            class_name = self.class_name_map.get(class_id_int, str(names.get(class_id_int, class_id_int)))
            class_name = _CLASS_ALIASES.get(class_name, class_name)
            if class_name not in self.classes:
                continue
            detections.append(
                Detection(
                    track_id=int(track_id),
                    class_id=class_id_int,
                    class_name=class_name,
                    confidence=float(conf),
                    bbox_xyxy=tuple(float(v) for v in bbox),
                )
            )
        return detections

    def detect_raw(self, frame) -> List[Detection]:
        """Run detection without ByteTrack state for the worker's local tracker."""
        if self.backend == "rknn":
            raw = self.rknn_detector.detect(frame)
            detections: List[Detection] = []
            for cid, score, bbox in raw:
                class_name = self.class_name_map.get(cid, "car")
                class_name = _CLASS_ALIASES.get(class_name, class_name)
                if class_name not in self.classes:
                    continue
                detections.append(
                    Detection(
                        track_id=-1,
                        class_id=cid,
                        class_name=class_name,
                        confidence=score,
                        bbox_xyxy=bbox,
                    )
                )
            return detections

        if self.backend == "onnx":
            raw = self.onnx_detector.detect(frame)
            detections: List[Detection] = []
            for cid, score, bbox in raw:
                class_name = self.class_name_map.get(cid, "car")
                class_name = _CLASS_ALIASES.get(class_name, class_name)
                if class_name not in self.classes:
                    continue
                detections.append(
                    Detection(
                        track_id=-1,
                        class_id=cid,
                        class_name=class_name,
                        confidence=score,
                        bbox_xyxy=bbox,
                    )
                )
            return detections

        results = self.model.predict(
            frame,
            conf=self.confidence,
            device=self.device,
            classes=self.class_ids,
            imgsz=self.imgsz,
            verbose=False,
        )
        if not results:
            return []

        result = results[0]
        if result.boxes is None:
            return []
        names = result.names
        boxes = result.boxes.xyxy.cpu().tolist()
        class_ids = result.boxes.cls.cpu().tolist()
        confidences = result.boxes.conf.cpu().tolist()

        detections: List[Detection] = []
        for bbox, class_id, conf in zip(boxes, class_ids, confidences):
            class_id_int = int(class_id)
            class_name = self.class_name_map.get(class_id_int, str(names.get(class_id_int, class_id_int)))
            class_name = _CLASS_ALIASES.get(class_name, class_name)
            if class_name not in self.classes:
                continue
            detections.append(
                Detection(
                    track_id=-1,
                    class_id=class_id_int,
                    class_name=class_name,
                    confidence=float(conf),
                    bbox_xyxy=tuple(float(v) for v in bbox),
                )
            )
        return detections
