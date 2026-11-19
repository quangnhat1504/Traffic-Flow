#!/usr/bin/env python3
"""
TrafficFlow Showcase Master Assembler (Full Console Walkthrough Edition)
========================================================================
Assembles the complete 5-Act Narrative Sequence:
- Clip 1: Brand Intro (0:00 - 0:05, 5s)
- Clip 2: Console Entrance & Camera Fleet Operations (0:05 - 0:22, 17s)
- Clip 3: Sources Ingest & Geometry Workspace (0:22 - 0:34, 12s)
- Clip 4: Velocity Blitz: 4K YOLOv8 + ByteTrack Live Traffic Flow (0:34 - 0:48, 14s)
- Clip 5: Unified Observability Matrix (Side-by-Side Console & Ingest) (0:48 - 0:60, 12s)
- Clip 6: Monolithic Hero Lockup & Benchmark Credentials (0:60 - 0:68, 8s)

Total Duration: 68.0s @ 60 FPS
"""

import os
import sys
import subprocess
from pathlib import Path

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SHOWCASE_DIR = PROJECT_ROOT / "showcase"
RAW_DIR = SHOWCASE_DIR / "raw"
AUDIO_DIR = SHOWCASE_DIR / "audio"
OUTPUT_DIR = SHOWCASE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

INTRO_FILE = RAW_DIR / "intro.mp4"
ANNOTATED_FILE = RAW_DIR / "cau_rong_annotated_150f.mp4"
AUDIO_FILE = AUDIO_DIR / "showcase_audio.wav"
FINAL_OUTPUT = OUTPUT_DIR / "trafficflow_showcase_master.mp4"


def find_browser_recording():
    webms = list(RAW_DIR.glob("*.webm"))
    if not webms:
        raise FileNotFoundError("No .webm recording found in showcase/raw")
    return sorted(webms, key=lambda f: f.stat().st_mtime)[-1]


def run_ffmpeg(cmd, desc):
    print(f"[*] {desc}...")
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print(f"[ERROR] {desc} failed:\n{result.stderr[-1200:]}", file=sys.stderr)
        raise RuntimeError(f"FFmpeg command failed: {result.returncode}")
    print(f"[+] {desc} complete.")


def main():
    browser_recording = find_browser_recording()
    print("=" * 65)
    print(" TRAFFICFLOW SHOWCASE MASTER ASSEMBLER")
    print("=" * 65)
    print(f" Brand Intro      : {INTRO_FILE}")
    print(f" Browser Session  : {browser_recording}")
    print(f" Annotated Flow   : {ANNOTATED_FILE}")
    print(f" Master Audio     : {AUDIO_FILE}")
    print(f" Output Video     : {FINAL_OUTPUT}")
    print("=" * 65)

    clip_intro = OUTPUT_DIR / "c1_intro.mp4"
    clip_console = OUTPUT_DIR / "c2_console.mp4"
    clip_geometry = OUTPUT_DIR / "c3_geometry.mp4"
    clip_inference = OUTPUT_DIR / "c4_inference.mp4"
    clip_multiview = OUTPUT_DIR / "c5_multiview.mp4"
    clip_hero = OUTPUT_DIR / "c6_hero.mp4"
    concat_list = OUTPUT_DIR / "concat_list.txt"

    font_bold = "fontfile='C\\:/Windows/Fonts/segoeuib.ttf'"
    font_reg = "fontfile='C\\:/Windows/Fonts/segoeui.ttf'"

    # 1. Clip 1: Brand Intro (5s, 60fps, 1080p)
    cmd_c1 = [
        "ffmpeg", "-y", "-i", str(INTRO_FILE),
        "-vf", "fps=60,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-t", "5.0", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an", str(clip_intro)
    ]
    run_ffmpeg(cmd_c1, "Clip 1: Brand Intro (5s)")

    # 2. Clip 2: Landing into Console & Camera Fleet Operations (0.5s to 17.5s, 17s)
    cmd_c2 = [
        "ffmpeg", "-y", "-ss", "0.5", "-i", str(browser_recording),
        "-vf", (
            "fps=60,scale=1920:1080,format=yuv420p,"
            f"drawtext={font_bold}:text='01 / CENTRALIZED OPERATIONS CONSOLE':fontcolor=white:fontsize=24:x=60:y=60:box=1:boxcolor=black@0.6:boxborderw=8,"
            f"drawtext={font_reg}:text='ACTIVE FLEET INSPECTION & MULTI-LANE TELEMETRY':fontcolor=0x00F2FE:fontsize=16:x=60:y=96:box=1:boxcolor=black@0.6:boxborderw=6"
        ),
        "-t", "17.0", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an", str(clip_console)
    ]
    run_ffmpeg(cmd_c2, "Clip 2: Console Entrance & Fleet Operations (17s)")

    # 3. Clip 3: Sources Ingest & Geometry Canvas (20.0s to 32.0s, 12s)
    cmd_c3 = [
        "ffmpeg", "-y", "-ss", "20.0", "-i", str(browser_recording),
        "-vf", (
            "fps=60,scale=1920:1080,format=yuv420p,"
            f"drawtext={font_bold}:text='02 / SPATIAL GEOMETRY WORKSPACE':fontcolor=white:fontsize=24:x=60:y=60:box=1:boxcolor=black@0.6:boxborderw=8,"
            f"drawtext={font_reg}:text='INTERACTIVE ROAD ROI, VALID ZONES & COUNTING LINES':fontcolor=0x00F2FE:fontsize=16:x=60:y=96:box=1:boxcolor=black@0.6:boxborderw=6"
        ),
        "-t", "12.0", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an", str(clip_geometry)
    ]
    run_ffmpeg(cmd_c3, "Clip 3: Sources & Geometry Canvas (12s)")

    # 4. Clip 4: Real 4K YOLO + ByteTrack Live Traffic Flow with HUD (14s)
    cmd_c4 = [
        "ffmpeg", "-y", "-stream_loop", "2", "-i", str(ANNOTATED_FILE),
        "-vf", (
            "fps=60,scale=1920:1080,format=yuv420p,"
            f"drawtext={font_bold}:text='03 / REAL-TIME EDGE INFERENCE ENGINE':fontcolor=white:fontsize=24:x=60:y=60:box=1:boxcolor=black@0.6:boxborderw=8,"
            f"drawtext={font_reg}:text='YOLOv8 + BYTETRACK + BOTTOM-CENTER ANCHOR GATE':fontcolor=0x00F2FE:fontsize=16:x=60:y=96:box=1:boxcolor=black@0.6:boxborderw=6"
        ),
        "-t", "14.0", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an", str(clip_inference)
    ]
    run_ffmpeg(cmd_c4, "Clip 4: AI Inference & Counting (14s)")

    # 5. Clip 5: Multi-View Scale (Side-by-Side Console & Live Ingest, 12s)
    cmd_c5 = [
        "ffmpeg", "-y",
        "-ss", "34.0", "-i", str(browser_recording),
        "-stream_loop", "2", "-i", str(ANNOTATED_FILE),
        "-filter_complex", (
            "[0:v]fps=60,scale=930:523,pad=940:533:5:5:color=0x00F2FE,pad=960:1080:10:(oh-ih)/2:color=0x05070E[left];"
            "[1:v]fps=60,scale=930:523,pad=940:533:5:5:color=0x10B981,pad=960:1080:0:(oh-ih)/2:color=0x05070E[right];"
            "[left][right]hstack=inputs=2[stacked];"
            f"[stacked]drawtext={font_bold}:text='04 / UNIFIED OBSERVABILITY MATRIX':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=120:box=1:boxcolor=black@0.6:boxborderw=8,"
            f"drawtext={font_reg}:text='SYNCHRONIZED CAMERA FLEET & REAL-TIME LOCAL INFERENCE':fontcolor=0x00F2FE:fontsize=16:x=(w-text_w)/2:y=156:box=1:boxcolor=black@0.6:boxborderw=6,"
            f"drawtext={font_bold}:text='WEB CONSOLE (LEFT)  |  YOLOv8 EDGE INFERENCE (RIGHT)':fontcolor=0xEDEDED:fontsize=15:x=(w-text_w)/2:y=890:box=1:boxcolor=black@0.6:boxborderw=6[outv]"
        ),
        "-map", "[outv]", "-t", "12.0", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an", str(clip_multiview)
    ]
    run_ffmpeg(cmd_c5, "Clip 5: Multi-View Split Screen (12s)")

    # 6. Clip 6: Monolithic Hero Lockup & Badges (8s)
    cmd_c6 = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "color=c=0x05070E:s=1920x1080:r=60",
        "-vf", (
            f"drawtext={font_bold}:text='TRAFFICFLOW':fontcolor=white:fontsize=76:x=(w-text_w)/2:y=(h-text_h)/2-80,"
            f"drawtext={font_reg}:text='PRECISION SPATIAL INTELLIGENCE FOR URBAN ARTERIES':fontcolor=0x00F2FE:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2-10,"
            f"drawtext={font_bold}:text='[ 75.8 FPS BATCH ]   •   [ 15.0 FPS LIVE HLS ]   •   [ 0.942 EVENT F1 ]':fontcolor=0xEDEDED:fontsize=20:x=(w-text_w)/2:y=(h-text_h)/2+60:box=1:boxcolor=black@0.7:boxborderw=10,"
            f"drawtext={font_reg}:text='READY FOR PRODUCTION ON LOCAL NVIDIA RTX GPU':fontcolor=0x8892B0:fontsize=16:x=(w-text_w)/2:y=(h-text_h)/2+110"
        ),
        "-t", "8.0", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an", str(clip_hero)
    ]
    run_ffmpeg(cmd_c6, "Clip 6: Hero Lockup (8s)")

    # 7. Concatenate all 6 Clips
    concat_content = (
        f"file '{clip_intro.as_posix()}'\n"
        f"file '{clip_console.as_posix()}'\n"
        f"file '{clip_geometry.as_posix()}'\n"
        f"file '{clip_inference.as_posix()}'\n"
        f"file '{clip_multiview.as_posix()}'\n"
        f"file '{clip_hero.as_posix()}'\n"
    )
    concat_list.write_text(concat_content, encoding="utf-8")

    temp_video = OUTPUT_DIR / "temp_video_only.mp4"
    cmd_concat = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
        "-c", "copy", str(temp_video)
    ]
    run_ffmpeg(cmd_concat, "Concatenating 6-Part Video")

    # 8. Mux Audio & Color Grade (Total = 5 + 17 + 12 + 14 + 12 + 8 = 68.0s)
    total_duration = 68.0
    fade_out_start = total_duration - 2.5

    cmd_final = [
        "ffmpeg", "-y",
        "-i", str(temp_video),
        "-i", str(AUDIO_FILE),
        "-filter_complex", (
            "[0:v]eq=contrast=1.05:brightness=0.01:saturation=1.04,noise=c1s=3:allf=t+u[vfinal];"
            f"[1:a]afade=t=in:st=0:d=1.5,afade=t=out:st={fade_out_start:.1f}:d=2.5[afinal]"
        ),
        "-map", "[vfinal]", "-map", "[afinal]",
        "-t", str(total_duration),
        "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "320k",
        str(FINAL_OUTPUT)
    ]
    run_ffmpeg(cmd_final, "Final Broadcast Muxing with Master Audio")

    print("\n" + "=" * 65)
    print(" TRAFFICFLOW SHOWCASE BROADCAST MASTER COMPLETED!")
    print("=" * 65)
    print(f" Master File : {FINAL_OUTPUT}")
    print(f" File Size   : {(FINAL_OUTPUT.stat().st_size / 1024 / 1024):.2f} MB")
    print(f" Duration    : {total_duration}s @ 60 FPS")
    print("=" * 65)


if __name__ == "__main__":
    main()
