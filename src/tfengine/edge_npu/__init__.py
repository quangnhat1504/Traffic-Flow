"""Edge NPU Engine Module for Rockchip RK3588 (Orange Pi 5) and ONNX Runtime."""

from .dynamic_scheduler import DynamicNPUScheduler, npu_scheduler
from .onnx_engine import ONNXDetector
from .rknn_engine import RKNNDetector

__all__ = ["RKNNDetector", "ONNXDetector", "DynamicNPUScheduler", "npu_scheduler"]
