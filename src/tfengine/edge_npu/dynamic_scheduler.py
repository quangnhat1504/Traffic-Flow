"""Rockchip RK3588 Dynamic Multi-Core NPU Scheduler.

Provides dynamic auto-sharding across the 3 independent hardware NPU cores:
- Single Active Stream: Combined Tri-Core mode (core_mask=7: Cores 0+1+2, 6.0 TOPS)
- Multiple Active Streams: Shards individual camera streams across dedicated cores
  (Core 0 = mask 1, Core 1 = mask 2, Core 2 = mask 4, round-robin for 3+)
"""

from __future__ import annotations

import logging
import threading
from typing import Dict, List, Optional

logger = logging.getLogger("npu_scheduler")


class DynamicNPUScheduler:
    """Thread-safe core scheduler for RK3588 (Orange Pi 5) NPU."""

    CORE_0 = 1        # Core 0: 2.0 TOPS
    CORE_1 = 2        # Core 1: 2.0 TOPS
    CORE_2 = 4        # Core 2: 2.0 TOPS
    CORE_ALL = 7      # Tri-core Combined: 6.0 TOPS

    INDIVIDUAL_CORES = [CORE_0, CORE_1, CORE_2]

    _instance: Optional["DynamicNPUScheduler"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "DynamicNPUScheduler":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init_state()
            return cls._instance

    def _init_state(self) -> None:
        self.lock = threading.RLock()
        self.active_streams: Dict[str, int] = {}  # stream_id -> core_mask
        self._round_robin_idx = 0

    def register_stream(self, stream_id: str) -> int:
        """Registers a video stream and assigns an optimal NPU core mask."""
        with self.lock:
            if stream_id in self.active_streams:
                return self.active_streams[stream_id]

            num_active = len(self.active_streams)

            if num_active == 0:
                # First stream gets full 6 TOPS Tri-core power
                mask = self.CORE_ALL
            elif num_active == 1:
                # Second stream joins -> Shard first stream to Core 0, new stream to Core 1
                existing_stream = list(self.active_streams.keys())[0]
                self.active_streams[existing_stream] = self.CORE_0
                mask = self.CORE_1
                logger.info(
                    "Multi-stream detected: Sharding existing stream %s -> Core 0 (mask=1), new stream %s -> Core 1 (mask=2)",
                    existing_stream,
                    stream_id,
                )
            elif num_active == 2:
                # Third stream gets Core 2
                mask = self.CORE_2
                logger.info("Third stream %s allocated to Core 2 (mask=4)", stream_id)
            else:
                # 4+ streams: Round-robin across cores 0, 1, 2
                mask = self.INDIVIDUAL_CORES[self._round_robin_idx % len(self.INDIVIDUAL_CORES)]
                self._round_robin_idx += 1
                logger.info(
                    "Stream %s sharded to Core mask %d (Round-robin index=%d)",
                    stream_id,
                    mask,
                    self._round_robin_idx,
                )

            self.active_streams[stream_id] = mask
            return mask

    def deregister_stream(self, stream_id: str) -> None:
        """Removes a stream and promotes remaining stream to full Tri-core if only 1 remains."""
        with self.lock:
            if stream_id in self.active_streams:
                del self.active_streams[stream_id]
                logger.info("Deregistered stream %s from NPU scheduler", stream_id)

            # If only 1 stream remains, promote it back to full Tri-core combined
            if len(self.active_streams) == 1:
                remaining_stream = list(self.active_streams.keys())[0]
                self.active_streams[remaining_stream] = self.CORE_ALL
                logger.info(
                    "Single stream remaining: Promoted %s -> Full Tri-Core Combined (mask=7, 6.0 TOPS)",
                    remaining_stream,
                )

    def get_core_mask(self, stream_id: Optional[str] = None) -> int:
        """Returns the assigned core mask for a given stream or default."""
        with self.lock:
            if stream_id and stream_id in self.active_streams:
                return self.active_streams[stream_id]
            if len(self.active_streams) <= 1:
                return self.CORE_ALL
            return self.CORE_0

    def get_status(self) -> dict:
        """Returns current scheduler status and core distribution telemetry."""
        with self.lock:
            return {
                "active_stream_count": len(self.active_streams),
                "allocations": dict(self.active_streams),
                "mode": "combined_tri_core" if len(self.active_streams) <= 1 else "dynamic_sharded",
            }


# Module singleton
npu_scheduler = DynamicNPUScheduler()
