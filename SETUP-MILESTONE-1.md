# Setup & Testing — Milestone 1 (pipeline cloud, tanpa frontend dulu)

Tujuan milestone ini: pastikan satu video utuh bisa diproses otomatis di GitHub
Actions (transkripsi → analisis Gemini → render klip) sebelum kita sentuh Next.js
sama sekali. Semua langkah di bawah ini perlu kamu lakukan sendiri (bikin akun,
generate API key) — bagian yang nggak bisa aku lakukan otomatis.

---

## 1. Setup Supabase (database)

1. Daftar gratis di [supabase.com](https://supabase.com), buat project baru (pilih
   region Singapore biar latency ke Indonesia lebih enak).
2. Buka **SQL Editor** di dashboard, jalankan schema ini:

```sql
create type job_status as enum
  ('uploaded','transcribing','analyzing','rendering','ready','failed');

create type clip_status as enum
  ('pending','rendering','rendered','finalizing','done','failed');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  status job_status not null default 'uploaded',
  source_video_key text not null,
  source_filename text,
  duration_seconds float,
  brief text,
  n_clips_requested int default 8,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  idx int not null,
  start_time float not null,
  end_time float not null,
  hook_text text,
  reason text,
  caption_words jsonb,
  crop_keyframes jsonb,
  status clip_status not null default 'pending',
  rendered_key text,
  thumbnail_key text,
  edited boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

> Catatan: `user_id` sengaja belum di-`references auth.users` dan RLS belum
> diaktifkan di tahap ini — itu ditambahkan nanti pas kita bikin auth di milestone
> 4. Untuk testing pipeline sekarang, kita insert job manual tanpa login.

3. Buka **Settings → API**, catat dua nilai ini (dipakai sebagai secrets nanti):
   - `Project URL` → jadi `SUPABASE_URL`
   - `service_role` key (BUKAN `anon` key — yang ini punya akses penuh, jangan pernah
     dipakai di frontend) → jadi `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. Setup Cloudflare R2 (storage)

1. Daftar gratis di [dash.cloudflare.com](https://dash.cloudflare.com), buka menu
   **R2 Object Storage** di sidebar, buat bucket baru (misal `ai-clipper`).
2. Buka **R2 → Manage API Tokens → Create API Token**, kasih permission
   **Object Read & Write**, scope ke bucket itu saja.
3. Catat 3 nilai yang muncul:
   - `Access Key ID` → jadi `R2_ACCESS_KEY_ID`
   - `Secret Access Key` → jadi `R2_SECRET_ACCESS_KEY`
   - `Account ID` (keliatan di URL dashboard atau halaman token) → jadi `R2_ACCOUNT_ID`
4. Nama bucket yang kamu buat tadi → jadi `R2_BUCKET_NAME`

---

## 3. Dapatkan Gemini API key (gratis)

1. Buka [aistudio.google.com/apikey](https://aistudio.google.com/apikey), login
   pakai akun Google, klik **Create API key**.
2. Catat key-nya → jadi `GEMINI_API_KEY`.

---

## 4. Push ke GitHub (repo PUBLIC)

```
git init
git add .
git commit -m "Setup awal: worker pipeline"
git branch -M main
git remote add origin https://github.com/USERNAME/ai-clipper-web.git
git push -u origin main
```

Pastikan repo dibuat **Public** waktu create di GitHub (biar GitHub Actions gratis
tanpa batas menit).

---

## 5. Tambahkan Secrets di GitHub

Di repo → **Settings → Secrets and variables → Actions → New repository secret**,
tambahkan satu-satu (nama harus persis sama):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `GEMINI_API_KEY`

---

## 6. Testing manual (tanpa frontend)

1. **Upload video test ke R2** — buka bucket kamu di dashboard Cloudflare, upload
   satu video pendek (5-10 menit dulu buat tes cepat) manual lewat tombol Upload.
   Catat key-nya, misal kalau kamu upload ke folder `raw/test-1/`, key-nya
   `raw/test-1/source.mp4`.

2. **Insert job manual ke Supabase** — buka **Table Editor → jobs → Insert row**:
   - `source_video_key`: `raw/test-1/source.mp4` (sesuai yang kamu upload)
   - `brief`: boleh dikosongin atau isi coba-coba, misal "durasi klip 30-45 detik"
   - `n_clips_requested`: `5` (biar tes lebih cepat, nggak usah 8 dulu)
   - Field lain biarkan default
   - Klik Save, **copy `id`** yang ter-generate (ini `job_id` buat langkah berikutnya)

3. **Trigger workflow manual** — buka tab **Actions** di repo GitHub, pilih
   **"Process video (manual test)"** di sidebar kiri, klik **"Run workflow"**,
   paste `job_id` yang tadi di-copy, klik **Run workflow**.

4. **Pantau prosesnya** — klik run yang baru muncul, lihat log real-time. Kalau
   berhasil, di log bakal keliatan tahapan `[1/5]` sampai `[5/5]`.

5. **Cek hasilnya**:
   - Buka **Table Editor → jobs**, cek row-nya, `status` harusnya berubah jadi `ready`
   - Buka **Table Editor → clips**, harusnya ada beberapa row baru dengan `rendered_key` terisi
   - Buka bucket R2 kamu, cek folder `clips/{job_id}/`, harusnya ada file `.mp4` dan `.jpg` di sana — download & tonton buat mastiin hasilnya bagus

Kalau ada error di log Actions, screenshot aja dan kirim ke aku — kita debug bareng.
Ini justru gunanya testing manual dulu sebelum ada frontend: lebih gampang isolasi
masalahnya ada di worker atau nanti di sisi UI.
