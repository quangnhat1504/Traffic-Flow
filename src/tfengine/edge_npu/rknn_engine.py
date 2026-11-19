"""Rockchip RK3588 NPU Inference Engine for Orange Pi 5.

Leverages librknnrt.so and rknn-toolkit-lite2 with Tri-Core (6.0 TOPS) scheduling,
in-silicon hardware normalization, and zero-copy uint8 image input.
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional, Sequence, Tuple
import numpy as np

logger = logging.getLogger(__name__)

# Canonical COCO vehicle classes used by TrafficFlow
COCO_VEHICLE_NAMES = {"car", "motorcycle", "bus", "truck"}
COCO_VEHICLE_IDS = [2, 3, 5, 7]


class RKNNDetector:
    """Rockchip RK3588 NPU Detector wrapper using RKNN-Toolkit-Lite2."""

    def __init__(
        self,
        model_path: str,
        confidence_threshold: float = 0.25,
        nms_threshold: float = 0.45,
        core_mask: int = 7,  # Default: 7 = NPU_CORE_0_1_2 (Tri-core 6 TOPS)
        input_size: Tuple[int, int] = (416, 416),
        class_ids: Optional[Sequence[int]] = None,
    ):
        self.model_path = model_path
        self.conf_thresh = confidence_threshold
        self.nms_thresh = nms_threshold
        self.core_mask = core_mask
        self.input_size = input_size
        if class_ids is not None:
            self.class_ids = set(class_ids)
        elif "finetuned" in str(model_path).lower() or "vietnamese" in str(model_path).lower():
            self.class_ids = {0, 1, 2, 3}
        else:
            self.class_ids = set(COCO_VEHICLE_IDS)
        self.rknn = None

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"RKNN model file not found: {model_path}")

        self._init_runtime()

    def _init_runtime(self) -> None:
        try:
            from rknnlite.api import RKNNLite
        except ImportError as exc:
            raise RuntimeError(
                "rknn-toolkit-lite2 is not installed. This engine requires an ARM64 "
                "environment (Orange Pi 5 / RK3588) with rknnlite installed."
            ) from exc

        self.rknn = RKNNLite(verbose=False)
        ret = self.rknn.load_rknn(self.model_path)
        if ret != 0:
            raise RuntimeError(f"Failed to load RKNN model: {self.model_path} (code: {ret})")

        # Core mask: 1 = Core 0, 2 = Core 1, 4 = Core 2, 7 = Core 0+1+2
        core_map = {
            1: RKNNLite.NPU_CORE_0,
            2: RKNNLite.NPU_CORE_1,
            4: RKNNLite.NPU_CORE_2,
            7: RKNNLite.NPU_CORE_0_1_2,
        }
        selected_mask = core_map.get(self.core_mask, RKNNLite.NPU_CORE_0_1_2)

        ret = self.rknn.init_runtime(core_mask=selected_mask)
        if ret != 0:
            raise RuntimeError(f"Failed to initialize RKNN runtime (code: {ret})")

        logger.info(
            "RKNN runtime initialized on Orange Pi 5 RK3588 (CoreMask=%d, Model=%s)",
            self.core_mask,
            self.model_path,
        )

    def preprocess(self, img: np.ndarray) -> np.ndarray:
        """Prepares raw uint8 BGR/RGB image for the NPU.

        Note: Hardware normalization (mean/std) is baked into the RKNN model,
        so we pass uint8 directly to avoid expensive CPU float conversions.
        """
        import cv2

        h, w = img.shape[:2]
        target_w, target_h = self.input_size

        if (w, h) != (target_w, target_h):
            resized = cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        else:
            resized = img

        # NPU expects shape: [1, H, W, C] in uint8
        input_tensor = np.expand_dims(resized, axis=0)
        return input_tensor

    def postprocess(
        self, outputs: List[np.ndarray], original_shape: Tuple[int, int]
    ) -> List[Tuple[int, float, Tuple[float, float, float, float]]]:
        """Vectorized postprocessing with Non-Maximum Suppression (NMS).

        Returns list of (class_id, confidence, (x1, y1, x2, y2)) scaled to original image.
        """
        import cv2

        orig_h, orig_w = original_shape
        input_w, input_h = self.input_size
        scale_x = orig_w / input_w
        scale_y = orig_h / input_h

        # Output shape parsing (standard YOLOv8 / YOLO11 detection head)
        # raw shape is typically [1, 84, N_anchors]
        predictions = outputs[0]
        if predictions.ndim == 3 and predictions.shape[0] == 1:
            predictions = predictions[0]

        # Transpose if channels first [84, N] -> [N, 84]
        if predictions.shape[0] < predictions.shape[1]:
            predictions = predictions.T

        boxes = []
        confidences = []
        class_ids_out = []

        # YOLO format: [cx, cy, w, h, class_scores...]
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
        """Executes full NPU inference on a single frame."""
        orig_shape = frame.shape[:2]
        input_tensor = self.preprocess(frame)
        outputs = self.rknn.inference(inputs=[input_tensor])
        return self.postprocess(outputs, orig_shape)

    def release(self) -> None:
        """Releases the RKNN NPU runtime context."""
        if self.rknn is not None:
            self.rknn.release()
            self.rknn = None
