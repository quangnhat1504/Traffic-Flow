"""Frame processing pipeline: stabilize → crop → mask → letterbox 640×640 → JPEG encode."""

from dataclasses import dataclass
from typing import Optional, Tuple
import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

GEOMETRY_SPACES = {"source_frame", "crop_local"}


def resolve_geometry_space(config: dict) -> str:
    """Resolve the coordinate space used by a lane configuration.

    New clients should send ``geometry_space`` explicitly. Older saved configs
    that carry crop dimensions used crop-local points, so retain that narrow
    compatibility inference instead of silently assuming the wrong space.
    """

    geometry_space = config.get("geometry_space")
    if geometry_space is None:
        geometry_space = (
            "crop_local"
            if config.get("crop_rect_padded") or config.get("processing_width")
            else "source_frame"
        )
    if geometry_space not in GEOMETRY_SPACES:
        raise ValueError(f"Unsupported geometry coordinate space: {geometry_space}")
    return geometry_space


def shift_points_to_crop(points: list, crop_rect: Tuple[int, int, int, int]) -> list:
    """Translate points from source-frame coordinates into crop-local space."""

    offset_x, offset_y = crop_rect[0], crop_rect[1]
    return [[point[0] - offset_x, point[1] - offset_y] for point in points]


@dataclass
class FrameTransform:
    """Holds linear mapping from AI-input space → cropped space → full-frame space.

    Coordinate chains:
        YOLO bbox (ai space) → crop space:  x_crop = (x_ai - pad_x) / scale_x
        YOLO bbox (ai space) → full frame:  x_full = x_crop + offset_x
    """
    full_w: int
    full_h: int
    crop_w: int
    crop_h: int
    ai_w: int
    ai_h: int
    offset_x: int = 0   # crop left edge in full-frame coords
    offset_y: int = 0   # crop top edge in full-frame coords
    scale_x: float = 1.0
    scale_y: float = 1.0
    pad_x: int = 0      # letterbox left padding in AI space
    pad_y: int = 0      # letterbox top padding in AI space

    def ai_to_crop(self, x: float, y: float) -> Tuple[float, float]:
        return ((x - self.pad_x) / self.scale_x,
                (y - self.pad_y) / self.scale_y)

    def ai_to_full(self, x: float, y: float) -> Tuple[float, float]:
        cx, cy = self.ai_to_crop(x, y)
        return (cx + self.offset_x, cy + self.offset_y)

    def bbox_ai_to_crop(self, bbox_xyxy: list) -> list:
        x1, y1 = self.ai_to_crop(bbox_xyxy[0], bbox_xyxy[1])
        x2, y2 = self.ai_to_crop(bbox_xyxy[2], bbox_xyxy[3])
        return [x1, y1, x2, y2]

    def bbox_ai_to_full(self, bbox_xyxy: list) -> list:
        x1, y1 = self.ai_to_full(bbox_xyxy[0], bbox_xyxy[1])
        x2, y2 = self.ai_to_full(bbox_xyxy[2], bbox_xyxy[3])
        return [x1, y1, x2, y2]

    def shift_lanes_to_crop(self, lanes: list) -> list:
        """Shift lane coordinates from full-frame space to crop space."""
        result = []
        for lane in lanes:
            shifted = dict(lane)
            for key in ("valid_zone", "counting_line", "direction"):
                if key in shifted and shifted[key]:
                    shifted[key] = shift_points_to_crop(
                        shifted[key],
                        (self.offset_x, self.offset_y, self.offset_x + self.crop_w, self.offset_y + self.crop_h),
                    )
            result.append(shifted)
        return result


from worker.pipeline.stabilizer import TrafficStabilizer

class FrameProcessor:
    """Transforms a raw video frame into an AI-ready 640×640 letterboxed JPEG.

    Pipeline order (roi_crop mode):
      1. Real-time lightweight camera stabilization (TrafficStabilizer)
      2. ROI crop to bounding rect (with 10% padding)
      3. Letterbox/pad to ROI_INPUT_SIZE × ROI_INPUT_SIZE
      4. JPEG encode

    Returns FrameTransform for correct coordinate remap.
    """

    def __init__(self, roi_input_size: int = 640,
                 roi_mode: str = "crop_rect",
                 enable_stabilization: bool = True):
        self.roi_input_size = roi_input_size
        self.roi_mode = roi_mode
        self.enable_stabilization = enable_stabilization
        self.stabilizer = TrafficStabilizer(
            analysis_width=320,
            smoothing_radius=0.88,
            max_correction_px=24.0,
            enabled=enable_stabilization,
        )

    def set_reference_frame(self, frame: np.ndarray):
        if frame is not None:
            self.stabilizer.set_reference_frame(frame)
            logger.info(f"Stabilizer reference frame captured ({frame.shape[1]}x{frame.shape[0]})")

    def process_for_ai(self, frame: np.ndarray,
                       crop_rect: Optional[Tuple[int, int, int, int]] = None,
                       poly_mask: Optional[np.ndarray] = None,
                       ) -> Tuple[np.ndarray, np.ndarray, FrameTransform]:
        """Run full processing on one frame.

        Args:
            frame: Raw BGR frame.
            crop_rect: (min_x, min_y, max_x, max_y) or None.
            poly_mask: Integer polygon points (N×2) in cropped coords or None.

        Returns:
            cropped_frame: Frame after crop (before letterbox), for overlay rendering.
            ai_frame: The letterboxed 640×640 JPEG-ready frame.
            transform: FrameTransform for coordinate remap.
        """
        # 1. High-Performance Lightweight Camera Stabilization
        if self.enable_stabilization:
            frame, _ = self.stabilizer.stabilize(frame)

        full_h, full_w = frame.shape[:2]

        # 2. Crop
        if self.roi_mode in ("roi_crop", "crop_rect", "roi_mask") and crop_rect:
            min_x, min_y, max_x, max_y = crop_rect
            if max_y > min_y and max_x > min_x:
                cropped = frame[min_y:max_y, min_x:max_x]
                offset_x, offset_y = min_x, min_y
            else:
                cropped = frame
                offset_x, offset_y = 0, 0
        else:
            cropped = frame
            offset_x, offset_y = 0, 0

        crop_h, crop_w = cropped.shape[:2]

        # 3. Polygon mask (only if explicitly in roi_mask mode)
        if self.roi_mode == "roi_mask" and poly_mask is not None and len(poly_mask) >= 3:
            mask = np.zeros(cropped.shape[:2], dtype=np.uint8)
            cv2.fillPoly(mask, [poly_mask], 255)
            cropped = cv2.bitwise_and(cropped, cropped, mask=mask)

        # 4. Letterbox to target size (preserve aspect ratio, pad with gray)
        target = self.roi_input_size
        scale = min(target / crop_w, target / crop_h) if crop_w > 0 and crop_h > 0 else 1.0
        new_w = int(crop_w * scale)
        new_h = int(crop_h * scale)
        resized = cv2.resize(cropped, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        # Create letterbox canvas
        ai_frame = np.full((target, target, 3), 114, dtype=np.uint8)
        pad_x = (target - new_w) // 2
        pad_y = (target - new_h) // 2
        ai_frame[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = resized

        transform = FrameTransform(
            full_w=full_w,
            full_h=full_h,
            crop_w=crop_w,
            crop_h=crop_h,
            ai_w=target,
            ai_h=target,
            offset_x=offset_x,
            offset_y=offset_y,
            scale_x=scale,
            scale_y=scale,
            pad_x=pad_x,
            pad_y=pad_y,
        )

        return cropped, ai_frame, transform

    def encode_jpeg(self, ai_frame: np.ndarray, quality: int = 85) -> Optional[bytes]:
        success, buf = cv2.imencode('.jpg', ai_frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not success:
            return None
        return buf.tobytes()
