#!/usr/bin/env python3
"""Export and prepare models for Orange Pi 5 (Rockchip RK3588 NPU).

Exports YOLO PyTorch models to ONNX Slim format and generates RKNN conversion
descriptors for on-device compilation on Orange Pi 5.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("export_opi5")


def export_to_onnx(
    model_path: str,
    output_dir: str,
    imgsz: int = 416,
    half: bool = False,
    opset: int = 12,
) -> str:
    """Exports a YOLO model to ONNX format optimized for RKNN conversion."""
    try:
        from ultralytics import YOLO
    except ImportError:
        logger.error("ultralytics is required for ONNX export: pip install ultralytics")
        sys.exit(1)

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    logger.info("Loading PyTorch model: %s", model_path)
    model = YOLO(model_path)

    logger.info("Exporting to ONNX (imgsz=%d, half=%s, opset=%d)...", imgsz, half, opset)
    exported_file = model.export(
        format="onnx",
        imgsz=imgsz,
        half=half,
        opset=opset,
        simplify=True,
        dynamic=False,
    )

    stem = Path(model_path).stem
    target_onnx = out_path / f"{stem}_{imgsz}.onnx"
    if Path(exported_file) != target_onnx:
        if target_onnx.exists():
            target_onnx.unlink()
        Path(exported_file).rename(target_onnx)

    logger.info("ONNX export completed successfully: %s", target_onnx)
    return str(target_onnx)


def generate_rknn_config(
    onnx_path: str,
    output_dir: str,
    imgsz: int = 416,
    quantized: bool = True,
    dataset_txt: str = "data/calibration_dataset.txt",
) -> dict:
    """Generates RKNN Toolkit 2 build config matching RK3588 NPU constraints."""
    stem = Path(onnx_path).stem
    rknn_name = f"{stem}_int8.rknn" if quantized else f"{stem}_fp16.rknn"
    rknn_path = Path(output_dir) / rknn_name

    cfg = {
        "model_name": stem,
        "onnx_model": str(onnx_path),
        "target_platform": "rk3588",
        "output_rknn": str(rknn_path),
        "mean_values": [[0, 0, 0]],
        "std_values": [[255, 255, 255]],
        "input_size": [1, 3, imgsz, imgsz],
        "quantized": quantized,
        "quantized_algorithm": "normal",
        "quantized_method": "channel",
        "dataset": dataset_txt,
        "core_mask": "NPU_CORE_0_1_2",
        "optimization_level": 3,
    }

    cfg_file = Path(output_dir) / f"{stem}_rknn_config.json"
    with open(cfg_file, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

    logger.info("Saved RKNN build configuration: %s", cfg_file)
    return cfg


def update_registry(
    model_name: str,
    onnx_file: str,
    imgsz: int,
    registry_path: str = "configs/edge_models_registry.json",
):
    """Updates the machine-readable edge model registry."""
    reg_path = Path(registry_path)
    reg_path.parent.mkdir(parents=True, exist_ok=True)

    data = {}
    if reg_path.exists():
        try:
            with open(reg_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}

    entry = {
        "model_name": model_name,
        "onnx_path": onnx_file,
        "rknn_path": f"models/rknn/{Path(onnx_file).stem}_int8.rknn",
        "resolution": [imgsz, imgsz],
        "hardware_target": "Rockchip RK3588 (Orange Pi 5)",
        "in_silicon_norm": True,
        "status": "ready_for_board_compile",
    }

    data[f"{model_name}_{imgsz}"] = entry
    with open(reg_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    logger.info("Updated edge models registry: %s", registry_path)


def main():
    parser = argparse.ArgumentParser(description="Export models for Orange Pi 5 RK3588 NPU")
    parser.add_argument(
        "--model",
        type=str,
        default="models/vietnamese_vehicle_detection/my_finetuned_yolov8.pt",
        help="Input PyTorch checkpoint (.pt)",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=416,
        choices=[320, 416, 640],
        help="Target inference resolution (default: 416)",
    )
    parser.add_argument(
        "--all-resolutions",
        action="store_true",
        help="Export all supported resolutions (416 and 320)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="models/onnx",
        help="Output directory for ONNX and config files",
    )
    args = parser.parse_args()

    if not os.path.exists(args.model):
        # Fallback to yolov8n.pt if fine-tuned is missing
        if os.path.exists("models/yolov8n.pt"):
            logger.warning("Specified model %s not found, falling back to models/yolov8n.pt", args.model)
            args.model = "models/yolov8n.pt"
        else:
            logger.error("No valid model file found at %s", args.model)
            sys.exit(1)

    resolutions = [416, 320] if args.all_resolutions else [args.imgsz]
    for res in resolutions:
        logger.info("Processing resolution: %dx%d", res, res)
        onnx_file = export_to_onnx(args.model, args.output_dir, imgsz=res)
        generate_rknn_config(onnx_file, "models/rknn", imgsz=res, quantized=True)
        update_registry(Path(args.model).stem, onnx_file, res)
    logger.info("All export and configuration steps completed!")


if __name__ == "__main__":
    main()
