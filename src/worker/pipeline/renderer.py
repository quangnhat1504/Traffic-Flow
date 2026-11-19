"""Draw annotation overlays on video frames."""

from typing import List, Optional
import cv2
import numpy as np
from shared.config import settings
from worker.services.counting_service import bbox_bottom_center, point_in_polygon
from worker.pipeline.tracker import TrackOutput


class FrameRenderer:
    """Draws lane geometry + detection tracks onto a frame."""

    def __init__(self, lanes: List[dict], roi_polygon: Optional[List] = None, settings_obj=settings):
        self.lanes = lanes
        self.roi_polygon = roi_polygon
        self.settings = settings_obj

    def draw(self, frame: np.ndarray, detections: List[dict], debug: dict | None = None) -> np.ndarray:
        """Mutate ``frame`` in-place with overlays (returns it for chaining)."""
        # Draw lane zones and counting lines (ROI outline is omitted per user preference)

        # 2. Draw lane zones and counting lines
        for lane in self.lanes:
            zone = lane.get("valid_zone", [])
            line_ = lane.get("counting_line", [])

            if len(zone) > 2:
                pts = np.array(zone, np.int32).reshape((-1, 1, 2))
                cv2.polylines(frame, [pts], isClosed=True,
                              color=(255, 0, 0), thickness=2)

            if len(line_) == 2:
                p1 = (int(line_[0][0]), int(line_[0][1]))
                p2 = (int(line_[1][0]), int(line_[1][1]))
                cv2.line(frame, p1, p2, (0, 0, 255), thickness=2)

        # 3. Draw detections filtered strictly to original ROI polygon
        for det in detections:
            bbox = det.get("bbox_xyxy")
            if not bbox or len(bbox) != 4:
                continue
            if not det.get("confirmed", True):
                continue
            if det.get("is_lost") and not self.settings.RENDER_SHOW_LOST:
                continue
            x1, y1, x2, y2 = map(int, bbox)
            track_id = det.get("track_id", "")
            cls_name = det.get("class_name", "")

            anchor = bbox_bottom_center(bbox)

            # Filter strictly by user's original configured ROI polygon
            if self.roi_polygon is not None and len(self.roi_polygon) >= 3:
                poly_list = [[float(p[0]), float(p[1])] for p in self.roi_polygon]
                if not point_in_polygon(anchor[0], anchor[1], poly_list):
                    continue

            in_any_zone = self._in_any_zone(anchor)
            if not in_any_zone and not self.settings.RENDER_SHOW_OUT_OF_ZONE:
                continue

            if in_any_zone:
                color = (0, 220, 100)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                label = f"{cls_name} #{track_id}"
                (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(frame, (x1, max(0, y1 - h - 6)), (x1 + w + 6, y1), color, -1)
                cv2.putText(frame, label, (x1 + 3, max(h, y1 - 4)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
                cv2.circle(frame, (int(anchor[0]), int(anchor[1])), 4, (0, 0, 255), -1)
            else:
                color = (150, 150, 150)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 1)
                label = f"{cls_name} #{track_id}"
                cv2.putText(frame, label, (x1, y1 - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

        if debug:
            self._draw_debug(frame, debug)
        return frame

    def _in_any_zone(self, anchor) -> bool:
        for lane in self.lanes:
            zone = lane.get("valid_zone", [])
            if zone and point_in_polygon(anchor[0], anchor[1], zone):
                return True
        return False

    def _draw_debug(self, frame: np.ndarray, debug: dict) -> None:
        tracks = debug.get("tracks", {})
        for tid, info in tracks.items():
            history = info.get("history", [])
            pts = [(int(x), int(y)) for x, y in history]
            for a, b in zip(pts, pts[1:]):
                cv2.line(frame, a, b, (0, 255, 255), 2)
            if pts:
                lane = info.get("lane_locked") or info.get("lane_candidate") or "no_lane"
                cv2.circle(frame, pts[-1], 6, (0, 255, 255), -1)
                cv2.putText(frame, f"anchor {tid} {lane}", (pts[-1][0] + 6, pts[-1][1] + 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        for event in debug.get("events", [])[-8:]:
            anchor = event.get("anchor") or []
            if len(anchor) == 2:
                p = (int(anchor[0]), int(anchor[1]))
                cv2.circle(frame, p, 14, (0, 0, 255), 3)
                cv2.putText(frame, f"COUNT {event.get('class_name')} {event.get('lane_id')}",
                            (p[0] + 12, p[1] - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)
