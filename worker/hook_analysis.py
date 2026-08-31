"""
hook_analysis.py — Analisis transkrip buat cari momen terbaik + hook, otomatis
lewat Gemini API (free tier), plus dukungan brief campaign opsional.

Hook = potongan 3 detik dari video klip itu sendiri yang paling bikin penasaran
(kalimat kontroversial, pertanyaan provokatif, klaim mengejutkan). Potongan ini
akan diprepend di awal klip sebagai teaser — bukan teks yang di-overlay.
"""

import json
import os
import time

from google import genai
from google.genai import types
from google.genai.errors import ServerError

MODEL = "gemini-3.6-flash"  # ada di free tier (Agu 2026); cek ai.google.dev kalau berubah lagi
MAX_RETRIES = 3
RETRY_DELAYS = [15, 45, 90]  # detik — nunggu makin lama tiap percobaan ulang


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

Untuk setiap klip, tentukan juga "hook moment" — yaitu potongan singkat (2-3 detik)
DARI DALAM rentang klip itu sendiri yang paling bikin penonton penasaran. Potongan
ini akan ditaruh di awal klip sebagai teaser sebelum klip utama diputar. Pilih
momen yang menyisakan pertanyaan atau membuat penonton berpikir "apa maksudnya?".

Hook moment HARUS berada di dalam rentang [start_time, end_time] klip.

Balas HANYA dengan JSON array (tanpa markdown code fence, tanpa teks lain), format:
[
  {{
    "start_time": <detik, angka desimal>,
    "end_time": <detik, angka desimal>,
    "hook_start": <detik, angka desimal — awal hook moment>,
    "hook_end": <detik, angka desimal — akhir hook moment, selisih ~2-3 detik>,
    "hook_text": "<ringkasan singkat isi hook, untuk ditampilkan di UI>",
    "reason": "<kenapa momen ini berpotensi viral>"
  }},
  ...
]
Urutkan dari yang paling berpotensi viral. Semua waktu dalam detik (angka desimal),
diukur dari awal video.

Transkrip:
---
{transcript_text}
---
"""


def analyze(transcript: dict, n_clips: int = 8, brief: str | None = None) -> list[dict]:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"].strip())
    prompt = _build_prompt(transcript, n_clips, brief)

    response = None
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.4,
                ),
            )
            break
        except ServerError as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt]
                print(f"  Gemini lagi sibuk (percobaan {attempt + 1}/{MAX_RETRIES}), nunggu {delay}s...")
                time.sleep(delay)

    if response is None:
        raise RuntimeError(f"Gemini tetap gagal setelah {MAX_RETRIES}x percobaan: {last_error}")

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
        if end - start < 5:
            continue

        # hook_start/hook_end: fallback ke 3 detik pertama klip kalau Gemini nggak isi
        hook_start = float(c.get("hook_start", start))
        hook_end = float(c.get("hook_end", start + 3))
        # pastikan hook ada di dalam rentang klip
        hook_start = max(start, min(hook_start, end - 2))
        hook_end = max(hook_start + 1, min(hook_end, end))
        # batasi durasi hook maks 4 detik
        if hook_end - hook_start > 4:
            hook_end = hook_start + 3

        validated.append({
            "start_time": round(start, 2),
            "end_time": round(end, 2),
            "hook_start": round(hook_start, 2),
            "hook_end": round(hook_end, 2),
            "hook_text": str(c.get("hook_text", "")).strip(),
            "reason": str(c.get("reason", "")).strip(),
        })

    if not validated:
        raise RuntimeError("Gemini balas JSON tapi nggak ada klip valid setelah divalidasi.")

    return validated