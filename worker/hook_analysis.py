"""
hook_analysis.py — Analisis transkrip buat cari momen terbaik + hook, otomatis
lewat Gemini API (free tier), plus dukungan brief campaign opsional.

Ini versi otomatis dari alur "copy-paste ke claude.ai" di toolkit lokal — perlu
diotomatiskan karena worker ini jalan tanpa manusia di depan layar.
"""

import json
import os

from google import genai
from google.genai import types

MODEL = "gemini-2.5-flash"  # ada di free tier; cek ai.google.dev kalau berubah


def _format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _build_prompt(transcript: dict, n_clips: int, brief: str | None) -> str:
    lines = [f"[{_format_timestamp(seg['start'])}] {seg['text']}" for seg in transcript["segments"]]
    transcript_text = "\n".join(lines)

    brief_block = ""
    if brief and brief.strip():
        brief_block = f"""
PENTING — ada ketentuan khusus dari brief campaign yang WAJIB kamu ikuti:
---
{brief.strip()}
---
Kalau ada instruksi di brief yang bertentangan dengan panduan umum di bawah, brief
campaign yang menang.
"""

    return f"""\
Kamu adalah ahli konten short-form video viral (spesialisasi TikTok, Reels, YouTube
Shorts). Di bawah ini transkrip video panjang lengkap dengan timestamp per segmen.
{brief_block}
TUGAS: cari {n_clips} momen terbaik untuk dijadikan klip pendek (30-90 detik),
prioritaskan momen dengan potensi HOOK KUAT di 3 detik pertama — klaim kontroversial/
mengejutkan, curiosity gap, cerita dengan setup+payoff lengkap, atau kalimat quotable.

Kalau kalimat pembuka asli lemah, isi "hook_text" dengan teks hook BUATAN (bukan dari
transkrip) yang cocok di-overlay di 3 detik pertama sebagai pemancing perhatian.

Balas HANYA dengan JSON array (tanpa markdown code fence, tanpa teks lain), format:
[
  {{"start_time": <detik, angka>, "end_time": <detik, angka>, "hook_text": "...", "reason": "..."}},
  ...
]
Urutkan dari yang paling berpotensi viral. start_time dan end_time dalam detik
(angka desimal), diukur dari awal video.

Transkrip:
---
{transcript_text}
---
"""


def analyze(transcript: dict, n_clips: int = 8, brief: str | None = None) -> list[dict]:
    """
    Return list of dict: {start_time, end_time, hook_text, reason} — sudah divalidasi
    (durasi masuk akal, nggak keluar batas video, terurut).
    """
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    prompt = _build_prompt(transcript, n_clips, brief)

    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.4,
        ),
    )

    try:
        raw_clips = json.loads(response.text)
    except (json.JSONDecodeError, TypeError) as e:
        raise RuntimeError(f"Gemini nggak balas JSON valid: {e}\nRaw: {response.text[:1000]}")

    duration = transcript.get("duration") or float("inf")
    validated = []
    for c in raw_clips:
        try:
            start = max(0.0, float(c["start_time"]))
            end = min(float(duration), float(c["end_time"]))
        except (KeyError, TypeError, ValueError):
            continue
        if end - start < 5:  # klip kependekan, kemungkinan hasil parsing yang aneh
            continue
        validated.append({
            "start_time": round(start, 2),
            "end_time": round(end, 2),
            "hook_text": str(c.get("hook_text", "")).strip(),
            "reason": str(c.get("reason", "")).strip(),
        })

    if not validated:
        raise RuntimeError("Gemini balas JSON tapi nggak ada klip valid setelah divalidasi.")

    return validated
