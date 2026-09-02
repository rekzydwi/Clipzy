"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import Navbar from "@/components/Navbar";
import UploadModal from "@/components/UploadModal";
import type { Job } from "@/lib/types";
import {
  getStatusLabel,
  getStatusBadgeClass,
  isProcessing,
  formatDuration,
  timeAgo,
} from "@/lib/types";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filter, setFilter] = useState<"all" | "ready" | "processing" | "uploaded">("all");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setJobs(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchJobs();

    // Realtime subscription — auto update saat status job berubah
    const channel = supabase
      .channel("jobs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs, supabase]);

  async function handleDeleteJob(e: React.MouseEvent, jobId: string) {
    e.stopPropagation();
    if (!confirm("Apakah Anda yakin ingin menghapus project video ini?")) return;
    
    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      } else {
        const data = await res.json();
        alert(data.error || "Gagal menghapus project");
      }
    } catch (err) {
      console.error("Gagal menghapus:", err);
    } finally {
      setDeletingId(null);
    }
  }

  function handleUploadComplete(jobId: string) {
    setShowUpload(false);
    router.push(`/jobs/${jobId}`);
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchSearch =
        (job.source_filename || "").toLowerCase().includes(search.toLowerCase()) ||
        (job.brief || "").toLowerCase().includes(search.toLowerCase());
      
      if (!matchSearch) return false;
      if (filter === "ready") return job.status === "ready";
      if (filter === "processing") return isProcessing(job.status);
      if (filter === "uploaded") return job.status === "uploaded";
      return true;
    });
  }, [jobs, filter, search]);

  const stats = useMemo(() => {
    return {
      total: jobs.length,
      ready: jobs.filter((j) => j.status === "ready").length,
      processing: jobs.filter((j) => isProcessing(j.status) || j.status === "uploaded").length,
    };
  }, [jobs]);

  return (
    <>
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Aurora Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 animate-fade-in">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-extrabold tracking-tight">Studio Dashboard</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent-2/15 text-accent-2 border border-accent-2/30">
                {jobs.length} Project
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              Kelola, monitor pemotongan AI otomatis, dan unduh klip video 9:16 Anda.
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="btn-primary shrink-0 self-start md:self-auto"
            id="new-project-btn"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>+ Buat Project Baru</span>
          </button>
        </div>

        {/* Stats Row */}
        {!loading && jobs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-fade-in">
            <div className="glass-card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent-1/15 border border-accent-1/25 flex items-center justify-center text-accent-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Video</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>

            <div className="glass-card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/15 border border-success/25 flex items-center justify-center text-success">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Klip Selesai</p>
                <p className="text-2xl font-bold text-success">{stats.ready}</p>
              </div>
            </div>

            <div className="glass-card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent-2/15 border border-accent-2/25 flex items-center justify-center text-accent-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin-slow">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" className="opacity-20" />
                  <path d="M4 12a8 8 0 0 1 8-8" strokeWidth="2" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dalam Proses AI</p>
                <p className="text-2xl font-bold text-accent-2">{stats.processing}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        {!loading && jobs.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 animate-fade-in">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900/60 border border-[var(--glass-border)] rounded-xl backdrop-blur-md self-start">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === "all"
                    ? "bg-gradient-to-r from-accent-1 to-accent-2 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Semua ({jobs.length})
              </button>
              <button
                onClick={() => setFilter("ready")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === "ready"
                    ? "bg-gradient-to-r from-accent-1 to-accent-2 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Selesai ({stats.ready})
              </button>
              <button
                onClick={() => setFilter("processing")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === "processing"
                    ? "bg-gradient-to-r from-accent-1 to-accent-2 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Diproses ({stats.processing})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative max-w-xs w-full">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama video..."
                className="input py-2 pl-9 text-xs"
              />
              <svg
                className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          </div>
        )}

        {/* Job List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-24 glass-card border-dashed p-8 animate-fade-in-up">
            <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-accent-1/20 via-accent-2/20 to-accent-3/20 border border-white/10 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-accent-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">Belum ada project video</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
              Upload video podcast, edukasi, atau konten panjang Anda untuk dipotong otomatis menjadi klip portrait 9:16.
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="btn-primary"
            >
              + Upload Video Pertama
            </button>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-16 glass-card p-6">
            <p className="text-muted-foreground text-sm">Tidak ada video yang cocok dengan pencarian.</p>
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="glass-card p-4 sm:p-5 w-full text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 group cursor-pointer"
                id={`job-${job.id}`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/60 flex items-center justify-center shrink-0 shadow-inner group-hover:border-accent-1/50 transition-colors">
                    {isProcessing(job.status) ? (
                      <svg className="w-5 h-5 text-accent-1 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    ) : job.status === "ready" ? (
                      <svg className="w-5 h-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    ) : job.status === "failed" ? (
                      <svg className="w-5 h-5 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-accent-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                      <p className="font-semibold text-base truncate group-hover:text-accent-1 transition-colors">
                        {job.source_filename || "Video tanpa nama"}
                      </p>
                      <span className={`badge ${getStatusBadgeClass(job.status)}`}>
                        {isProcessing(job.status) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        )}
                        {getStatusLabel(job.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {job.duration_seconds && (
                        <span className="flex items-center gap-1">
                          ⏱ {formatDuration(job.duration_seconds)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">🎬 {job.n_clips_requested} klip</span>
                      <span>🕒 {timeAgo(job.created_at)}</span>
                    </div>
                    {job.error_message && (
                      <p className="text-danger text-xs mt-1 truncate">
                        {job.error_message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions & Button */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {/* Tombol Hapus Spesifik */}
                  <button
                    onClick={(e) => handleDeleteJob(e, job.id)}
                    disabled={deletingId === job.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 hover:border-rose-500/50 transition-all cursor-pointer"
                    title="Hapus Project Ini"
                    id={`delete-btn-${job.id}`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>{deletingId === job.id ? "Menghapus..." : "Hapus"}</span>
                  </button>

                  {/* Tombol Buka Klip */}
                  <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 group-hover:bg-accent-1/20 text-muted-foreground group-hover:text-white border border-white/5 group-hover:border-accent-1/40 transition-all">
                    <span>Lihat</span>
                    <svg
                      className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onComplete={handleUploadComplete}
      />
    </>
  );
}
