# AI Video Clipper (Web, Hosted)

Versi hosted dari AI video clipper — upload video panjang, dapat beberapa klip
pendek 9:16 dengan caption otomatis dan hook di 3 detik pertama, siap upload ke
TikTok/Reels/Shorts.

**Status**: Milestone 1 — worker pipeline (belum ada frontend, sengaja).

## Kenapa belum ada frontend?

Sebelum bangun UI, kita pastikan dulu bagian paling berisiko — pipeline AI (whisper,
Gemini, ffmpeg+face-tracking) — beneran jalan mulus di lingkungan GitHub Actions,
yang beda dari laptop lokal (nggak ada GPU, resource terbatas). Lihat
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) untuk desain teknis lengkap, dan
[`SETUP-MILESTONE-1.md`](SETUP-MILESTONE-1.md) untuk cara setup & testing sekarang.

## Struktur

```
worker/     — script Python yang dijalankan GitHub Actions (bukan Vercel)
.github/    — workflow trigger manual buat testing pipeline
docs/       — desain arsitektur lengkap
```

## Alur singkat

1. Video mentah di-upload ke Cloudflare R2, row baru dibuat di tabel `jobs` (Supabase)
2. GitHub Actions terpicu, jalanin `worker/pipeline.py <job_id>`
3. Pipeline: transkripsi (faster-whisper) → analisis momen & hook (Gemini, + brief
   campaign opsional) → render tiap klip (ffmpeg + face-tracking crop + caption)
4. Hasil naik ke R2, status job jadi `ready`
5. (Milestone berikutnya) User review & edit lewat frontend, klik finalize kalau ada
   perubahan → `worker/finalize_clip.py` render ulang ringan tanpa whisper/mediapipe
   ulang, karena data face-tracking & caption sudah tersimpan di DB

## Roadmap

- [x] Milestone 1 — worker pipeline jalan di GitHub Actions (trigger manual)
- [ ] Milestone 2 — frontend minimal (upload, status, download)
- [ ] Milestone 3 — review & edit UI + finalize flow
- [ ] Milestone 4 — auth 3 user, polish UI, auto-cleanup storage
