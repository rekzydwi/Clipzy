"""
pipeline.py — Orkestrator utama, dipanggil GitHub Actions:
    python worker/pipeline.py <job_id>

Alur: download video dari R2 -> transkripsi -> analisis Gemini (+ brief kalau ada)
-> insert klip ke DB -> render tiap klip (dengan hook teaser prepend + caption,
simpan crop_keyframes & caption_words biar bisa dipakai ulang saat user edit)
-> upload ke R2 -> update status jadi 'ready'.

Kalau ada tahap manapun yang gagal, job ditandai 'failed' dengan pesan error di DB
(biar keliatan di UI), dan proses exit dengan kode error (biar run di GitHub Actions
juga keliatan gagal, gampang di-debug lewat log).
"""

import sys
import tempfile
import traceback
from pathlib import Path

import db
import storage
import transcribe as transcribe_mod
import hook_analysis
import render_clip


def run(job_id: str) -> None:
    job = db.get_job(job_id)
    if job is None:
        raise RuntimeError(f"Job {job_id} nggak ditemukan di database")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        video_path = tmp / "source.mp4"

        print(f"[1/5] Download video sumber dari R2: {job['source_video_key']}")
        storage.download_file(job["source_video_key"], str(video_path))

        # ---------- transkripsi ----------
        db.update_job(job_id, status="transcribing")
        print("[2/5] Transkripsi (faster-whisper, model base)...")
        transcript_path = tmp / "transcript.json"
        transcript = transcribe_mod.transcribe(
            str(video_path), model_size="base", output_json=str(transcript_path)
        )
        storage.upload_file(str(transcript_path), f"raw/{job_id}/transcript.json", "application/json")
        db.update_job(job_id, duration_seconds=transcript["duration"])

        # ---------- analisis momen & hook ----------
        db.update_job(job_id, status="analyzing")
        print("[3/5] Analisis momen & hook (Gemini)...")
        candidates = hook_analysis.analyze(
            transcript,
            n_clips=job.get("n_clips_requested") or 8,
            brief=job.get("brief"),
        )
        clip_rows = db.insert_clips(job_id, [
            {
                "idx": i + 1,
                "start_time": c["start_time"],
                "end_time": c["end_time"],
                "hook_start": c["hook_start"],
                "hook_end": c["hook_end"],
                "hook_text": c["hook_text"],
                "reason": c["reason"],
            }
            for i, c in enumerate(candidates)
        ])
        print(f"  {len(clip_rows)} klip kandidat disimpan ke DB")

        # ---------- render tiap klip ----------
        db.update_job(job_id, status="rendering")
        print("[4/5] Render tiap klip...")
        src_w, src_h = render_clip.get_resolution(str(video_path))

        for i, clip in enumerate(clip_rows, 1):
            clip_id = clip["id"]
            start, end = clip["start_time"], clip["end_time"]
            hook_start = clip.get("hook_start")
            hook_end = clip.get("hook_end")
            print(f"  [{i}/{len(clip_rows)}] {start:.0f}s-{end:.0f}s | hook: {hook_start}-{hook_end}s | {clip['hook_text']}")
            db.update_clip(clip_id, status="rendering")

            try:
                keyframes = render_clip.detect_face_keyframes(str(video_path), start, end)
                crop_w, crop_h, crop_x, crop_y = render_clip.crop_from_keyframes(
                    keyframes, start, end, src_w, src_h
                )
                words = render_clip.words_in_range(transcript, start, end)

                out_video = tmp / f"clip_{i:02d}.mp4"
                render_clip.render_clip(
                    str(video_path), crop_w, crop_h, crop_x, crop_y,
                    words, start, end, str(out_video),
                    hook_start=hook_start,
                    hook_end=hook_end,
                    hook_text=clip.get("hook_text"),
                )
                out_thumb = tmp / f"clip_{i:02d}.jpg"
                render_clip.make_thumbnail(str(video_path), start + 1.5, str(out_thumb))

                rendered_key = f"clips/{job_id}/{clip_id}/render.mp4"
                thumb_key = f"clips/{job_id}/{clip_id}/thumbnail.jpg"
                storage.upload_file(str(out_video), rendered_key, "video/mp4")
                storage.upload_file(str(out_thumb), thumb_key, "image/jpeg")

                db.update_clip(
                    clip_id,
                    status="rendered",
                    rendered_key=rendered_key,
                    thumbnail_key=thumb_key,
                    caption_words=words,
                    crop_keyframes=keyframes,
                )
            except Exception as e:
                print(f"  Klip {i} GAGAL: {e}")
                db.update_clip(clip_id, status="failed")
                # lanjut ke klip berikutnya, jangan gagalin seluruh job gara-gara 1 klip

        print("[5/5] Selesai.")
        db.update_job(job_id, status="ready")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Pemakaian: python pipeline.py <job_id>")
        sys.exit(1)

    job_id_arg = sys.argv[1]
    try:
        run(job_id_arg)
    except Exception as exc:
        traceback.print_exc()
        try:
            db.mark_job_failed(job_id_arg, f"{type(exc).__name__}: {exc}")
        except Exception as db_exc:
            print(f"(gagal juga nyimpen error ke DB: {db_exc})")
        sys.exit(1)
