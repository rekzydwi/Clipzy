-- Migration: tambah kolom hook_start & hook_end ke tabel clips
-- Jalankan di Supabase SQL Editor

ALTER TABLE clips ADD COLUMN IF NOT EXISTS hook_start float;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS hook_end float;

-- RLS Policies (jalankan sekalian kalau belum pernah)
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;

-- Jobs: user cuma bisa lihat & edit job miliknya sendiri
CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs" ON jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Clips: user cuma bisa lihat & edit klip dari job miliknya
CREATE POLICY "Users can view own clips" ON clips
  FOR SELECT USING (
    job_id IN (SELECT id FROM jobs WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own clips" ON clips
  FOR UPDATE USING (
    job_id IN (SELECT id FROM jobs WHERE user_id = auth.uid())
  );
