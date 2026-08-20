"""
transcribe.py — Ekstrak audio dari video & transkripsi lokal pakai faster-whisper.

100% gratis, jalan di CPU (cocok untuk laptop tanpa GPU dedicated seperti
Asus Vivobook X415EA / Intel i3-i5 11th gen). Tidak ada data yang dikirim
ke server manapun — semua proses di laptop kamu sendiri.

Pemakaian (CLI):
    python src/transcribe.py "video_saya.mp4" --model base --output transkrip.json

Model yang tersedia (dari paling cepat ke paling akurat):
    tiny   -> tercepat, akurasi paling rendah
    base   -> REKOMENDASI untuk CPU tanpa GPU (i3/i5 11th gen) — seimbang
    small  -> lebih akurat, ~2-3x lebih lambat dari base di CPU
    medium -> akurat tapi berat, sebaiknya dihindari kalau cuma CPU
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

from faster_whisper import WhisperModel


def extract_audio(video_path: Path, audio_path: Path) -> None:
    """Ekstrak audio jadi WAV mono 16kHz (format yang disukai Whisper) pakai ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",                 # buang video, ambil audio saja
        "-ac", "1",             # mono
        "-ar", "16000",         # 16kHz — cukup untuk speech recognition
        "-acodec", "pcm_s16le",
        str(audio_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"Gagal ekstrak audio. Pastikan ffmpeg terinstall & ada di PATH.\n"
            f"Detail error ffmpeg:\n{result.stderr[-1500:]}"
        )


def transcribe(
    video_path: str,
    model_size: str = "base",
    output_json: str | None = None,
    language: str | None = None,
) -> dict:
    """
    Transkripsi video jadi teks dengan timestamp per kata.

    Return dict siap dipakai tahap berikutnya (hook prompt & render caption):
    {
      "video_path": "...",
      "language": "id",
      "duration": 1834.2,
      "segments": [
        {"start": 0.0, "end": 4.2, "text": "...", "words": [{"start":0.0,"end":0.3,"word":"halo"}, ...]},
        ...
      ]
    }
    """
    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(f"Video tidak ditemukan: {video_path}")

    tmp_audio = video_path.with_suffix(".tmp_audio.wav")
    print(f"[1/2] Ekstrak audio dari '{video_path.name}' ...")
    extract_audio(video_path, tmp_audio)

    print(f"[2/2] Transkripsi pakai model '{model_size}' (CPU, int8) — ini bagian paling lama...")
    t0 = time.time()

    # device="cpu" + compute_type="int8" -> paling ringan & cukup cepat untuk laptop tanpa GPU
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments_gen, info = model.transcribe(
        str(tmp_audio),
        language=language,        # None = auto-detect (bisa dipaksa "id" kalau mau lebih cepat & akurat)
        word_timestamps=True,
        vad_filter=True,          # buang bagian hening/tanpa suara -> lebih cepat & bersih
    )

    segments = []
    for seg in segments_gen:
        words = [
            {"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word.strip()}
            for w in (seg.words or [])
        ]
        segments.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
            "words": words,
        })
        print(f"  [{seg.start:7.1f}s] {seg.text.strip()}")

    elapsed = time.time() - t0
    print(f"\nSelesai dalam {elapsed/60:.1f} menit. Bahasa terdeteksi: {info.language}")

    tmp_audio.unlink(missing_ok=True)  # bersihkan file audio sementara

    result = {
        "video_path": str(video_path),
        "language": info.language,
        "duration": info.duration,
        "segments": segments,
    }

    if output_json:
        Path(output_json).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Transkrip disimpan ke: {output_json}")

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transkripsi video lokal pakai faster-whisper (gratis, CPU-friendly).")
    parser.add_argument("video", help="Path ke file video (mp4/mkv/mov/dll)")
    parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium", "large-v3"],
                         help="Ukuran model Whisper (default: base — cocok untuk CPU tanpa GPU)")
    parser.add_argument("--output", default=None, help="Path file JSON output (default: <nama_video>.json)")
    parser.add_argument("--language", default=None, help="Paksa bahasa, misal 'id' (default: auto-detect)")
    args = parser.parse_args()

    out = args.output or str(Path(args.video).with_suffix(".transcript.json"))
    transcribe(args.video, model_size=args.model, output_json=out, language=args.language)
