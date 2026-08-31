# Clipzy — AI Video Clipper

Upload video panjang, dapat klip pendek **9:16** dengan **hook teaser 3 detik** &
**caption otomatis**, siap upload ke TikTok, Reels, dan Shorts.

## Fitur

- 🎯 **Hook Teaser** — AI memilih momen paling bikin penasaran dari klip, dipotong
  3 detik dan ditaruh di awal sebagai pemancing
- 🎙️ **Transkripsi Otomatis** — faster-whisper (CPU, gratis, offline)
- 🧠 **Analisis AI** — Gemini menganalisis transkrip, pilih momen terbaik, dukung
  brief campaign opsional
- 📱 **9:16 Face-Tracking Crop** — mediapipe deteksi wajah, auto-crop portrait
- 💬 **Caption Otomatis** — kata per kata, posisi & timing presisi
- ⚡ **Realtime Status** — UI otomatis ter-update saat processing selesai
- 🔒 **Invite-Only Auth** — Supabase Auth, 3 user

## Arsitektur

```
apps/web/     → Next.js 15 (App Router) — deploy ke Vercel
worker/       → Python pipeline — jalan di GitHub Actions (gratis)
.github/      → Workflow: process-video & finalize-clip
```

**Pipeline**: Upload → R2 → GitHub Actions → Whisper → Gemini → ffmpeg → R2 → Selesai

Lihat [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) untuk desain teknis lengkap.

## Setup & Deploy

### 1. Supabase

- Buat project di [supabase.com](https://supabase.com)
- Jalankan schema SQL dari [`SETUP-MILESTONE-1.md`](SETUP-MILESTONE-1.md)
- Jalankan migration dari [`docs/migration-hook-and-rls.sql`](docs/migration-hook-and-rls.sql)
- Matikan "Enable sign up" di Authentication → Settings
- Invite user lewat Authentication → Users → Invite

### 2. Cloudflare R2

- Buat bucket di [dash.cloudflare.com](https://dash.cloudflare.com) → R2
- Buat API token dengan Object Read & Write

### 3. GitHub Secrets

Tambahkan di Settings → Secrets → Actions:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `GEMINI_API_KEY`

### 4. Vercel

- Import repo, set Root Directory = `apps/web`
- Tambahkan env vars (lihat `apps/web/.env.example`)
- Buat fine-grained PAT di GitHub → Settings → Developer → Personal Access Tokens
  (scope: Actions write, repo ini saja) → set sebagai `GITHUB_PAT`

### 5. Gemini API Key

- Dapatkan gratis di [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## Roadmap

- [x] Milestone 1 — Worker pipeline (GitHub Actions)
- [x] Milestone 2 — Frontend (Next.js: upload, dashboard, status realtime)
- [x] Milestone 3 — Review klip & download
- [x] Milestone 4 — Auth, RLS, deploy
- [ ] Milestone 5 — Edit caption & re-render UI
