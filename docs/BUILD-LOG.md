# Build Log & Roadmap

Proyek ini sengaja dibangun bertahap, satu potongan kecil per commit, biar riwayat
Git-nya mencerminkan proses pengerjaan yang sebenarnya — bukan satu commit raksasa.

## Milestone 1 — Worker pipeline (cloud, tanpa frontend dulu)

Tujuan: pastikan pipeline AI (transkripsi, analisis, render) beneran jalan di
GitHub Actions sebelum bangun UI. Lihat `docs/ARCHITECTURE.md` untuk desain lengkap
dan `SETUP-MILESTONE-1.md` untuk cara testing.

- [ ] **1. Scaffolding awal** — README, .gitignore, dokumen arsitektur
- [ ] **2. Modul transkripsi** — `worker/transcribe.py` (faster-whisper, CPU-only)
- [ ] **3. Helper storage R2** — `worker/storage.py` (upload/download video & hasil)
- [ ] **4. Helper database Supabase** — `worker/db.py` (baca/tulis status job & klip)
- [ ] **5. Analisis momen & hook otomatis** — `worker/hook_analysis.py` (Gemini API, dukung brief campaign opsional)
- [ ] **6. Render engine** — `worker/render_clip.py` (crop 9:16 face-tracking, caption, hook overlay — simpan `crop_keyframes` & `caption_words` biar bisa dipakai ulang saat edit)
- [ ] **7. Pipeline orchestrator** — `worker/pipeline.py` (menyatukan semua tahap di atas)
- [ ] **8. Finalize/edit re-render** — `worker/finalize_clip.py` (re-render ringan setelah user edit, skip whisper & mediapipe ulang)
- [ ] **9. CI workflow** — `.github/workflows/*.yml` (trigger manual buat testing)
- [ ] **10. Panduan setup & testing** — `SETUP-MILESTONE-1.md`

## Milestone berikutnya (belum digarap)

- [ ] Milestone 2 — Frontend minimal (Next.js: upload, status job, download)
- [ ] Milestone 3 — Review & edit UI + tombol finalize
- [ ] Milestone 4 — Auth 3 user, polish UI, auto-cleanup storage R2
