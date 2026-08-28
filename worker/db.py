"""
db.py — Wrapper tipis di atas Supabase buat baca/tulis status job & klip.

Worker jalan sebagai service (bukan user login), jadi selalu pakai
SUPABASE_SERVICE_ROLE_KEY (bypass Row Level Security). Jangan pernah pakai
key ini di frontend/browser — cuma boleh di worker & server-side Next.js.
"""

import os
from functools import lru_cache

from supabase import create_client, Client


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ["SUPABASE_URL"].strip()
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()
    return create_client(url, key)


def get_job(job_id: str) -> dict:
    res = get_client().table("jobs").select("*").eq("id", job_id).single().execute()
    return res.data


def update_job(job_id: str, **fields) -> None:
    get_client().table("jobs").update(fields).eq("id", job_id).execute()


def mark_job_failed(job_id: str, error_message: str) -> None:
    update_job(job_id, status="failed", error_message=error_message[:2000])


def insert_clips(job_id: str, clips: list[dict]) -> list[dict]:
    rows = [{**c, "job_id": job_id, "status": "pending"} for c in clips]
    res = get_client().table("clips").insert(rows).execute()
    return res.data


def update_clip(clip_id: str, **fields) -> None:
    get_client().table("clips").update(fields).eq("id", clip_id).execute()


def list_clips(job_id: str) -> list[dict]:
    res = (
        get_client()
        .table("clips")
        .select("*")
        .eq("job_id", job_id)
        .order("idx")
        .execute()
    )
    return res.data


def get_clip(clip_id: str) -> dict:
    res = get_client().table("clips").select("*").eq("id", clip_id).single().execute()
    return res.data