# Desain Teknis: AI Video Clipper (Versi Web-Hosted)

Dokumen ini adalah blueprint implementasi untuk versi hosted dari toolkit clipper —
dibangun di atas logika processing (transkripsi, face-tracking, render) yang sudah
terbukti jalan di versi lokal, sekarang dipindah ke arsitektur async job seperti yang
sudah didiskusikan.

---

## 1. Struktur repo (monorepo, publik)

Repo **harus publik** supaya GitHub Actions gratis tanpa batas.

```
ai-clipper-web/
├── apps/
│   └── web/                      # Next.js — di-deploy ke Vercel
│       ├── app/
│       │   ├── api/
│       │   │   ├── jobs/route.ts
│       │   │   ├── jobs/[id]/start/route.ts
│       │   │   └── clips/[id]/route.ts
│       │   ├── dashboard/
│       │   └── jobs/[id]/
│       ├── lib/supabase.ts
│       └── package.json
├── worker/                       # Dijalankan oleh GitHub Actions, bukan Vercel
│   ├── pipeline.py                # orkestrator utama
│   ├── transcribe.py              # (reuse dari versi lokal)
│   ├── hook_analysis.py           # panggil Gemini API
│   ├── render_clip.py             # (reuse dari versi lokal, + simpan crop_keyframes)
│   ├── finalize_clip.py           # re-render ringan setelah user edit
│   └── requirements.txt
├── .github/workflows/
│   ├── process-video.yml          # job berat (transkripsi+analisis+render semua klip)
│   └── finalize-clip.yml          # job ringan (re-render 1 klip setelah edit)
└── README.md
```

Di pengaturan project Vercel, set **Root Directory = `apps/web`** supaya Vercel cuma
build folder frontend, sementara `worker/` dibiarkan diam di repo (cuma dieksekusi
lewat GitHub Actions).

---

## 2. Skema database (Supabase Postgres)

```sql
create type job_status as enum
  ('uploaded','transcribing','analyzing','rendering','ready','failed');

create type clip_status as enum
  ('pending','rendering','rendered','finalizing','done','failed');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  status job_status not null default 'uploaded',
  source_video_key text not null,      -- key di R2, misal raw/{job_id}/source.mp4
  source_filename text,
  duration_seconds float,
  brief text,                          -- ketentuan campaign, opsional
  n_clips_requested int default 8,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  idx int not null,                    -- urutan klip (1..n)
  start_time float not null,
  end_time float not null,
  hook_text text,
  reason text,
  caption_words jsonb,                 -- [{start,end,word}], BUKAN di-burn ke video dulu
  crop_keyframes jsonb,                 -- [{t, face_center_x}], hasil deteksi wajah
  status clip_status not null default 'pending',
  rendered_key text,                   -- key video hasil di R2
  thumbnail_key text,
  edited boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Kenapa `caption_words` dan `crop_keyframes` disimpan terpisah, bukan langsung
di-burn ke video?** Ini kunci dari fitur "edit sebelum download". Render pertama
tetap menghasilkan file .mp4 penuh (biar bisa langsung di-preview), TAPI data mentah
di baliknya (posisi crop tiap saat, teks & timing tiap kata) tetap disimpan sebagai
JSON. Kalau kamu edit teks caption atau geser sedikit titik potong, sistem render
ulang cuma pakai data yang sudah ada ini — nggak perlu whisper ulang atau deteksi
wajah ulang. Jauh lebih cepat (hitungan puluhan detik, bukan menit).

**Auth**: pakai Supabase Auth, matikan public sign-up, undang 3 email kamu manual
lewat dashboard Supabase. Nggak perlu bikin tabel allowlist sendiri — cukup itu saja
untuk skala 3 orang.

**Realtime, bukan polling**: aktifkan Supabase Realtime di tabel `jobs` dan `clips`.
Frontend subscribe ke perubahan baris job kamu — begitu worker update status jadi
`ready`, halaman otomatis ter-update tanpa perlu polling berkala. Lebih responsif dan
lebih hemat request.

---

## 3. Struktur storage (Cloudflare R2)

```
raw/{job_id}/source.mp4
raw/{job_id}/transcript.json
clips/{job_id}/{clip_id}/render.mp4
clips/{job_id}/{clip_id}/thumbnail.jpg
```

Upload video mentah **langsung dari browser ke R2** pakai presigned URL (bukan lewat
Vercel function) — ini penting karena Vercel function punya limit ukuran body &
durasi, sementara video sumber bisa ratusan MB.

---

## 4. API routes (Next.js, di `apps/web`)

| Method & path | Fungsi |
|---|---|
| `POST /api/jobs` | Bikin job baru, generate presigned upload URL R2, insert row `jobs` status `uploaded` |
| `POST /api/jobs/:id/start` | Dipanggil setelah upload selesai — trigger GitHub Actions (`repository_dispatch`) dengan `job_id`, update status jadi `transcribing` |
| `GET /api/jobs/:id` | Ambil detail job + klip-klipnya (fallback kalau realtime belum kepasang) |
| `PATCH /api/clips/:id` | Simpan edit user (caption_words, start/end baru), set `edited=true` |
| `POST /api/clips/:id/finalize` | Trigger workflow `finalize-clip.yml` — re-render ringan pakai `crop_keyframes` yang sudah ada |

Semua endpoint ini butuh cek: request datang dari user yang login (Supabase session)
DAN job/clip itu milik user tersebut — jangan skip otorisasi ini meski cuma dipakai
bertiga.

---

## 5. GitHub Actions — worker utama (`process-video.yml`)

Trigger: `repository_dispatch`, event type `process-video`, payload `{ job_id }`.

```yaml
name: Process video
on:
  repository_dispatch:
    types: [process-video]

jobs:
  process:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
          cache-dependency-path: worker/requirements.txt
      - run: pip install -r worker/requirements.txt
      - name: Run pipeline
        env:
          JOB_ID: ${{ github.event.client_payload.job_id }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: python worker/pipeline.py "$JOB_ID"
```

`worker/pipeline.py` adalah orkestrator: update status di Supabase di tiap tahap,
download video dari R2, transkripsi (reuse `transcribe.py`), panggil Gemini dengan
transkrip + `brief` (kalau diisi) buat dapat daftar klip+hook, insert ke tabel
`clips`, lalu loop render tiap klip (reuse `render_clip.py`, ditambah simpan
`crop_keyframes` ke DB alih-alih cuma langsung burn), upload hasil ke R2, update
status jadi `ready`. Kalau ada exception di step manapun, tangkap dan set status
`failed` + `error_message` biar user lihat di UI, bukan cuma job yang diam macet.

**Workflow kedua** (`finalize-clip.yml`) mirip tapi lebih ringan — trigger
`finalize-clip` dengan `clip_id`, jalanin `worker/finalize_clip.py` yang cuma baca
ulang `caption_words`+`crop_keyframes` dari DB (skip whisper & mediapipe), render
ulang caption+trim, upload versi baru, timpa `rendered_key`.

---

## 6. Environment variables & secrets

**Vercel (server-side)**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — aman diekspos, data tetap dilindungi Row Level Security
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, buat generate presigned URL
- `R2_*` (account id, access key, secret) — server-only, buat generate presigned upload URL
- `GITHUB_TOKEN` — fine-grained Personal Access Token, scope cuma ke repo ini, permission `Actions: write` saja — dipakai buat manggil `repository_dispatch`

**GitHub Actions secrets** (di Settings → Secrets repo):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `GEMINI_API_KEY`

Karena repo publik, **pastikan tidak ada satupun secret ini nyasar ke kode** — semua
lewat env var / GitHub Secrets, never hardcoded.

---

## 7. Row Level Security (RLS) — jangan skip

Supabase defaultnya row bisa diakses siapa saja kalau RLS nggak diaktifkan. Aktifkan
RLS di `jobs` dan `clips`, dengan policy: user cuma bisa `select`/`update` row yang
`user_id`-nya sama dengan sesi login mereka. Worker (GitHub Actions) pakai
`service_role` key yang otomatis bypass RLS, jadi tetap bisa nulis data.

---

## 8. Urutan pembangunan yang disarankan

Jangan bangun semua sekaligus — ini urutan yang masuk akal:

1. **Validasi pipeline cloud dulu, tanpa frontend.** Adaptasi `transcribe.py` &
   `render_clip.py` yang sudah ada supaya baca/tulis dari R2+Supabase, trigger manual
   lewat tombol "Run workflow" di GitHub UI (`workflow_dispatch`). Pastikan satu video
   utuh berhasil diproses end-to-end sebelum sentuh Next.js sama sekali.
2. **Frontend minimal**: form upload + brief, daftar job, status (realtime), link
   download. Belum ada editor.
3. **Fitur review & edit**: UI buat edit teks caption per baris, geser trim, tombol
   "Finalize" yang manggil `finalize-clip.yml`.
4. **Polish**: auth 3 user, UI pakai shadcn/ui + Tailwind biar rapi, error state yang
   jelas, auto-hapus `raw/` video mentah beberapa hari setelah job `ready` (biar
   storage 10GB nggak cepat penuh).

Milestone 1 itu yang paling penting divalidasi duluan — kalau pipeline-nya nggak
jalan mulus di GitHub Actions (beda environment dari laptop kamu), percuma buru-buru
bikin frontend cantik dulu.
