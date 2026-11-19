"""Cross-platform ONNX Runtime Inference Engine.

Supports ARM64 NEON execution on Orange Pi 5 / Linux as well as desktop CPU/GPU,
providing a high-performance fallback when RKNN is not available.
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional, Sequence, Tuple
import numpy as np

logger = logging.getLogger(__name__)

COCO_VEHICLE_IDS = [2, 3, 5, 7]


class ONNXDetector:
    """ONNX Runtime detector wrapper with vectorized postprocessing."""

    def __init__(
        self,
        model_path: str,
        confidence_threshold: float = 0.25,
        nms_threshold: float = 0.45,
        input_size: Tuple[int, int] = (640, 640),
        class_ids: Optional[Sequence[int]] = None,
        num_threads: int = 4,
    ):
        self.model_path = model_path
        self.conf_thresh = confidence_threshold
        self.nms_thresh = nms_threshold
        self.input_size = input_size
        self.class_ids = set(class_ids if class_ids is not None else COCO_VEHICLE_IDS)
        self.num_threads = num_threads
        self.session = None

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"ONNX model file not found: {model_path}")

        self._init_runtime()

    def _init_runtime(self) -> None:
        try:
            import onnxruntime as ort
        except ImportError as exc:
            raise RuntimeError(
                "onnxruntime is not installed. Install via: pip install onnxruntime"
            ) from exc

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = self.num_threads
        opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        # Prefer CPU Execution Provider on Edge, CUDA/DirectML on desktop if available
        providers = ["CPUExecutionProvider"]
        if "CUDAExecutionProvider" in ort.get_available_providers():
            providers.insert(0, "CUDAExecutionProvider")

        self.session = ort.InferenceSession(self.model_path, sess_options=opts, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [o.name for o in self.session.get_outputs()]

        logger.info(
            "ONNX runtime initialized (Model=%s, Providers=%s, Threads=%d)",
            self.model_path,
            providers,
            self.num_threads,
        )

    def preprocess(self, img: np.ndarray) -> np.ndarray:
        """Preprocesses frame for ONNX: Resize, BGR2RGB, HWC -> CHW, / 255.0."""
        import cv2

        h, w = img.shape[:2]
        target_w, target_h = self.input_size

        if (w, h) != (target_w, target_h):
            resized = cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        else:
            resized = img

        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        tensor = rgb.astype(np.float32) / 255.0
        tensor = np.transpose(tensor, (2, 0, 1))  # HWC -> CHW
        tensor = np.expand_dims(tensor, axis=0)   # [1, 3, H, W]
        return tensor

    def postprocess(
        self, outputs: List[np.ndarray], original_shape: Tuple[int, int]
    ) -> List[Tuple[int, float, Tuple[float, float, float, float]]]:
        """Postprocesses raw ONNX tensor outputs with NMS."""
        import cv2

        orig_h, orig_w = original_shape
        input_w, input_h = self.input_size
        scale_x = orig_w / input_w
        scale_y = orig_h / input_h

        predictions = outputs[0]
        if predictions.ndim == 3 and predictions.shape[0] == 1:
            predictions = predictions[0]

        if predictions.shape[0] < predictions.shape[1]:
            predictions = predictions.T

        cx = predictions[:, 0]
        cy = predictions[:, 1]
        w = predictions[:, 2]
        h = predictions[:, 3]
        scores = predictions[:, 4:]

        max_scores = np.max(scores, axis=1)
        max_classes = np.argmax(scores, axis=1)

        mask = max_scores >= self.conf_thresh
        valid_cx = cx[mask]
        valid_cy = cy[mask]
        valid_w = w[mask]
        valid_h = h[mask]
        valid_scores = max_scores[mask]
        valid_classes = max_classes[mask]

        if len(valid_scores) == 0:
            return []

        x1 = (valid_cx - valid_w / 2.0) * scale_x
        y1 = (valid_cy - valid_h / 2.0) * scale_y
        bw = valid_w * scale_x
        bh = valid_h * scale_y

        nms_boxes = np.column_stack([x1, y1, bw, bh]).tolist()
        nms_indices = cv2.dnn.NMSBoxes(
            nms_boxes,
            valid_scores.tolist(),
            self.conf_thresh,
            self.nms_thresh,
        )

        detections = []
        if len(nms_indices) > 0:
            for idx in nms_indices.flatten():
                cid = int(valid_classes[idx])
                if self.class_ids and cid not in self.class_ids:
                    continue
                score = float(valid_scores[idx])
                box = nms_boxes[idx]
                bbox_xyxy = (
                    max(0.0, float(box[0])),
                    max(0.0, float(box[1])),
                    min(float(orig_w), float(box[0] + box[2])),
                    min(float(orig_h), float(box[1] + box[3])),
                )
                detections.append((cid, score, bbox_xyxy))

        return detections

    def detect(
        self, frame: np.ndarray
    ) -> List[Tuple[int, float, Tuple[float, float, float, float]]]:
        orig_shape = frame.shape[:2]
        input_tensor = self.preprocess(frame)
        outputs = self.session.run(self.output_names, {self.input_name: input_tensor})
        return self.postprocess(outputs, orig_shape)
