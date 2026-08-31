"""
finalize_clip.py — Dipanggil GitHub Actions setelah user edit caption/trim di
frontend:
    python worker/finalize_clip.py <clip_id>

Ini yang bikin fitur "edit sebelum download" tetap cepat: nggak whisper ulang,
nggak deteksi wajah ulang. Cuma baca ulang caption_words & crop_keyframes yang
sudah tersimpan di DB (sudah termasuk editan user), lalu render ulang video-nya
(termasuk hook teaser prepend).
"""

import sys
import tempfile
import traceback
from pathlib import Path

import db
import storage
import render_clip


def run(clip_id: str) -> None:
    clip = db.get_clip(clip_id)
    if clip is None:
        raise RuntimeError(f"Klip {clip_id} nggak ditemukan di database")

    job = db.get_job(clip["job_id"])
    db.update_clip(clip_id, status="finalizing")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        video_path = tmp / "source.mp4"

        print("Download video sumber dari R2...")
        storage.download_file(job["source_video_key"], str(video_path))

        start, end = clip["start_time"], clip["end_time"]
        keyframes = clip.get("crop_keyframes") or []
        words = clip.get("caption_words") or []
        hook_start = clip.get("hook_start")
        hook_end = clip.get("hook_end")

        src_w, src_h = render_clip.get_resolution(str(video_path))
        crop_w, crop_h, crop_x, crop_y = render_clip.crop_from_keyframes(
            keyframes, start, end, src_w, src_h
        )

        out_video = tmp / "render.mp4"
        print("Render ulang (pakai data yang sudah ada, tanpa whisper/mediapipe ulang)...")
        render_clip.render_clip(
            str(video_path), crop_w, crop_h, crop_x, crop_y,
            words, start, end, str(out_video),
            hook_start=hook_start,
            hook_end=hook_end,
            hook_text=clip.get("hook_text"),
        )

        rendered_key = f"clips/{clip['job_id']}/{clip_id}/render.mp4"
        storage.upload_file(str(out_video), rendered_key, "video/mp4")

        db.update_clip(clip_id, status="done", rendered_key=rendered_key, edited=False)
        print("Selesai.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Pemakaian: python finalize_clip.py <clip_id>")
        sys.exit(1)

    clip_id_arg = sys.argv[1]
    try:
        run(clip_id_arg)
    except Exception as exc:
        traceback.print_exc()
        try:
            db.update_clip(clip_id_arg, status="failed")
        except Exception as db_exc:
            print(f"(gagal juga update status ke DB: {db_exc})")
        sys.exit(1)
