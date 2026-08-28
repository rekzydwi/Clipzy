"""
storage.py — Wrapper tipis di atas Cloudflare R2 (API-nya S3-compatible, jadi
pakai boto3 biasa, cuma beda endpoint_url).

Semua env var di-.strip() — jaga-jaga kalau ada spasi/newline nyasar ke-copy pas
isi GitHub Secrets (kejadian umum, endpoint jadi rusak kalau nggak dibersihin).
"""

import os
from functools import lru_cache

import boto3


@lru_cache(maxsize=1)
def get_client():
    account_id = os.environ["R2_ACCOUNT_ID"].strip()
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"].strip(),
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"].strip(),
        region_name="auto",
    )


def bucket_name() -> str:
    return os.environ["R2_BUCKET_NAME"].strip()


def download_file(key: str, local_path: str) -> None:
    get_client().download_file(bucket_name(), key, local_path)


def upload_file(local_path: str, key: str, content_type: str | None = None) -> None:
    extra_args = {"ContentType": content_type} if content_type else {}
    get_client().upload_file(local_path, bucket_name(), key, ExtraArgs=extra_args)


def upload_bytes(data: bytes, key: str, content_type: str | None = None) -> None:
    extra_args = {"ContentType": content_type} if content_type else {}
    get_client().put_object(Bucket=bucket_name(), Key=key, Body=data, **extra_args)