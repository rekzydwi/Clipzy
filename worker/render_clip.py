"""
render_clip.py (versi worker) — Sama seperti versi lokal (crop 9:16 face-tracking,
caption otomatis, hook overlay), TAPI sekarang:

1. Input klip datang dari baris DB (start_time/end_time/hook_text), bukan parsing
   teks hasil paste manual.
2. crop_keyframes & caption_words disimpan dengan timestamp ABSOLUT (relatif ke video
   sumber, bukan relatif ke klip) — supaya kalau user geser trim di editor nanti,
   finalize_clip.py tinggal filter ulang rentang yang relevan tanpa perlu jalanin
   mediapipe/whisper lagi.
"""

import subprocess
from pathlib import Path

import cv2
import mediapipe as mp


# ---------- info video ----------

def get_resolution(video_path: str) -> tuple[int, int]:
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=s=x:p=0", video_path,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
    w, h = out.split("x")
    return int(w), int(h)


# ---------- face-tracking (mediapipe, CPU) ----------

def detect_face_keyframes(video_path: str, start: float, end: float, samples: int = 8) -> list[dict]:
    """
    Sampling beberapa frame di rentang [start, end], deteksi wajah, dan kembalikan
    keyframe list [{"t": <detik absolut>, "x": <posisi horizontal wajah, 0-1>}, ...].
    Cuma entri yang beneran ketemu wajah yang dimasukkan (biar rata-rata nggak bias
    ke 0.5 gara-gara frame yang emang nggak ada wajahnya).
    """
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    detector = mp.solutions.face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.5)

    keyframes = []
    duration = max(end - start, 0.1)
    for i in range(samples):
        t = start + duration * (i + 0.5) / samples
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = detector.process(rgb)
        if result.detections:
            best = max(result.detections, key=lambda d: d.location_data.relative_bounding_box.width)
            box = best.location_data.relative_bounding_box
            keyframes.append({"t": round(t, 2), "x": round(box.xmin + box.width / 2, 4)})

    cap.release()
    detector.close()
    return keyframes


def crop_from_keyframes(keyframes: list[dict], start: float, end: float,
                         src_w: int, src_h: int, target_w: int = 1080, target_h: int = 1920):
    """Filter keyframes dalam rentang [start,end], rata-ratakan, hitung window crop 9:16."""
    in_range = [k["x"] for k in keyframes if start <= k["t"] <= end]
    face_center_x = sum(in_range) / len(in_range) if in_range else 0.5

    target_ratio = target_w / target_h
    crop_w = min(int(src_h * target_ratio), src_w)
    crop_h = src_h
    center_px = face_center_x * src_w
    x = max(0, min(int(center_px - crop_w / 2), src_w - crop_w))
    return crop_w, crop_h, x, 0


# ---------- caption words ----------

def words_in_range(transcript: dict, start: float, end: float) -> list[dict]:
    """Ambil kata-kata (timestamp absolut) dalam rentang [start,end] dari transkrip penuh."""
    words = []
    for seg in transcript["segments"]:
        for w in seg.get("words", []):
            if w["start"] >= start and w["end"] <= end + 0.5:
                words.append(w)
    return words


# ---------- .ass subtitle ----------

ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,64,&H00FFFFFF,&H00000000,&H80000000,1,0,1,4,0,2,60,60,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _sec_to_ass_ts(t: float) -> str:
    t = max(t, 0.0)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


def build_captions_ass(words: list[dict], clip_start: float, out_path: str, words_per_chunk: int = 4):
    """words pakai timestamp absolut — clip_start dipakai buat geser jadi relatif ke klip."""
    lines = [ASS_HEADER]
    chunk = []
    for w in words:
        chunk.append(w)
        if len(chunk) >= words_per_chunk:
            lines.append(_chunk_to_ass_line(chunk, clip_start))
            chunk = []
    if chunk:
        lines.append(_chunk_to_ass_line(chunk, clip_start))
    Path(out_path).write_text("".join(lines), encoding="utf-8")


def _chunk_to_ass_line(chunk: list[dict], clip_start: float) -> str:
    start = _sec_to_ass_ts(chunk[0]["start"] - clip_start)
    end = _sec_to_ass_ts(chunk[-1]["end"] - clip_start)
    text = " ".join(w["word"] for w in chunk).upper()
    return f"Dialogue: 0,{start},{end},Caption,,0,0,0,,{text}\n"


def _ffmpeg_escape(path: str) -> str:
    return path.replace("\\", "/").replace(":", r"\:")


# ---------- render utama ----------

def render_clip(
    video_path: str,
    crop_w: int, crop_h: int, crop_x: int, crop_y: int,
    words: list[dict],
    clip_start: float,
    clip_end: float,
    out_path: str,
    hook_text: str | None = None,
    font_path: str = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
):
    ass_path = Path(out_path).with_suffix(".ass")
    build_captions_ass(words, clip_start, str(ass_path))

    vf_parts = [
        f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}",
        "scale=1080:1920",
        f"subtitles='{_ffmpeg_escape(str(ass_path))}'",
    ]

    if hook_text:
        text = hook_text.replace("'", r"\'").replace(":", r"\:")
        vf_parts.append(
            "drawtext=fontfile='%s':text='%s':fontcolor=white:fontsize=70:"
            "box=1:boxcolor=black@0.55:boxborderw=20:x=(w-text_w)/2:y=180:"
            "enable='between(t,0,3)'" % (font_path, text)
        )

    vf = ",".join(vf_parts)
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(clip_start),
        "-i", video_path,
        "-t", str(clip_end - clip_start),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    ass_path.unlink(missing_ok=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg gagal render klip:\n{result.stderr[-2000:]}")


def make_thumbnail(video_path: str, at_second: float, out_path: str):
    cmd = ["ffmpeg", "-y", "-ss", str(at_second), "-i", video_path, "-frames:v", "1", str(out_path)]
    subprocess.run(cmd, capture_output=True, text=True, check=True)
