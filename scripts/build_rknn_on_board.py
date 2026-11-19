#!/usr/bin/env python3
"""Builds RKNN binaries directly on Orange Pi 5 using rknn-toolkit2.

Converts ONNX models in models/onnx/ to models/rknn/ targeting Rockchip RK3588 NPU.
"""

import os
import sys
from pathlib import Path

def build_rknn(onnx_path: str, output_path: str, imgsz: int = 416, do_quant: bool = True, dataset: str = None):
    try:
        from rknn.api import RKNN
    except ImportError:
        print("[ERROR] rknn-toolkit2 is not installed in this environment.")
        sys.exit(1)

    rknn = RKNN(verbose=False)
    print(f"--> Configuring RKNN for RK3588 (imgsz={imgsz}, quant={do_quant})")
    rknn.config(
        mean_values=[[0, 0, 0]],
        std_values=[[255, 255, 255]],
        target_platform="rk3588",
        quantized_dtype="w8a8",
        quantized_algorithm="normal",
        quantized_method="channel",
        optimization_level=3,
        disable_rules=[
            "seperate_conv_rs_split",
            "fuse_exmatmul_add_mul_exsoftmax13_exmatmul_to_sdpa",
        ],
    )

    print(f"--> Loading ONNX: {onnx_path}")
    ret = rknn.load_onnx(model=onnx_path)
    if ret != 0:
        print(f"[ERROR] rknn.load_onnx failed with code {ret}")
        return False

    print(f"--> Building RKNN binary...")
    ret = rknn.build(do_quantization=do_quant, dataset=dataset if do_quant else None)
    if ret != 0:
        print(f"[ERROR] rknn.build failed with code {ret}")
        return False

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    print(f"--> Exporting to {output_path}...")
    ret = rknn.export_rknn(output_path)
    if ret != 0:
        print(f"[ERROR] rknn.export_rknn failed with code {ret}")
        return False

    rknn.release()
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"[SUCCESS] Exported {output_path} ({size_mb:.2f} MB)")
    return True

if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent.parent
    onnx_file = sys.argv[1] if len(sys.argv) > 1 else str(base_dir / "models/onnx/my_finetuned_yolov8_416.onnx")
    out_file = sys.argv[2] if len(sys.argv) > 2 else str(base_dir / "models/rknn/my_finetuned_yolov8_416_int8.rknn")
    dataset_file = sys.argv[3] if len(sys.argv) > 3 else "/home/orangepi/Team_B/hackathon_pi5/data/rknn_dataset.txt"
    
    if not os.path.exists(dataset_file):
        dataset_file = None
        print(f"[NOTICE] Calibration dataset not found, falling back to FP16 or uncalibrated build.")

    build_rknn(onnx_file, out_file, imgsz=416, do_quant=(dataset_file is not None), dataset=dataset_file)
