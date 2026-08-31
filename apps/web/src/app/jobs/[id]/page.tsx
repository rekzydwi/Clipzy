"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import Navbar from "@/components/Navbar";
import type { Job, Clip, JobStatus } from "@/lib/types";
import {
  getStatusLabel,
  getStatusBadgeClass,
  isProcessing,
  formatDuration,
  formatTimestamp,
} from "@/lib/types";

const PROCESSING_STEPS: { status: JobStatus; label: string; icon: string }[] = [
  { status: "uploaded", label: "Upload", icon: "☁️" },
  { status: "transcribing", label: "Transkripsi", icon: "🎙️" },
  { status: "analyzing", label: "Analisis AI", icon: "🧠" },
  { status: "rendering", label: "Rendering", icon: "🎬" },
  { status: "ready", label: "Selesai", icon: "✅" },
];

function getStepIndex(status: JobStatus): number {
  if (status === "failed") return -1;
  return PROCESSING_STEPS.findIndex((s) => s.status === status);
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const supabase = createSupabaseBrowserClient();

  const [job, setJob] = useState<Job | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [clipUrls, setClipUrls] = useState<Record<string, string>>({});
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobData) setJob(jobData);

    const { data: clipData } = await supabase
      .from("clips")
      .select("*")
      .eq("job_id", jobId)
      .order("idx");

    if (clipData) {
      setClips(clipData);
      // Fetch thumbnail URLs for rendered clips
      for (const clip of clipData) {
        if (clip.thumbnail_key && !thumbUrls[clip.id]) {
          fetchThumbUrl(clip.id, clip.thumbnail_key);
        }
      }
    }

    setLoading(false);
  }, [jobId, supabase, thumbUrls]);

  async function fetchThumbUrl(clipId: string, key: string) {
    try {
      const res = await fetch(`/api/clips/${clipId}/download?type=thumbnail`);
      if (res.ok) {
        const { url } = await res.json();
        setThumbUrls((prev) => ({ ...prev, [clipId]: url }));
      }
    } catch {
      // ignore
    }
  }

  async function handleDownload(clip: Clip) {
    setDownloading((prev) => ({ ...prev, [clip.id]: true }));
    try {
      const res = await fetch(`/api/clips/${clip.id}/download`);
      if (!res.ok) throw new Error("Gagal ambil URL download");
      const { url } = await res.json();

      // Trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = `clip-${clip.idx}.mp4`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading((prev) => ({ ...prev, [clip.id]: false }));
    }
  }

  async function handlePreview(clip: Clip) {
    if (clipUrls[clip.id]) {
      // Already fetched — toggle off
      setClipUrls((prev) => {
        const next = { ...prev };
        delete next[clip.id];
        return next;
      });
      return;
    }
    try {
      const res = await fetch(`/api/clips/${clip.id}/download`);
      if (!res.ok) throw new Error("Gagal ambil URL preview");
      const { url } = await res.json();
      setClipUrls((prev) => ({ ...prev, [clip.id]: url }));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchData();

    // Realtime
    const jobChannel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        () => fetchData()
      )
      .subscribe();

    const clipChannel = supabase
      .channel(`clips-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clips", filter: `job_id=eq.${jobId}` },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobChannel);
      supabase.removeChannel(clipChannel);
    };
  }, [fetchData, jobId, supabase]);

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="skeleton h-8 w-48 mb-4" />
          <div className="skeleton h-4 w-96 mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-72" />
            ))}
          </div>
        </main>
      </>
    );
  }

  if (!job) {
    return (
      <>
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">Job tidak ditemukan</h2>
            <button onClick={() => router.push("/dashboard")} className="btn-secondary mt-4">
              Kembali ke Dashboard
            </button>
          </div>
        </main>
      </>
    );
  }

  const currentStep = getStepIndex(job.status);

  return (
    <>
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="animate-fade-in mb-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Dashboard
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                {job.source_filename || "Video tanpa nama"}
              </h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {job.duration_seconds && (
                  <span>⏱ {formatDuration(job.duration_seconds)}</span>
                )}
                <span>🎬 {job.n_clips_requested} klip</span>
                <span className={`badge ${getStatusBadgeClass(job.status)}`}>
                  {isProcessing(job.status) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  )}
                  {getStatusLabel(job.status)}
                </span>
              </div>
              {job.brief && (
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  📋 {job.brief}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Processing Steps — tampilkan saat masih proses */}
        {(isProcessing(job.status) || job.status === "uploaded") && (
          <div className="glass-card p-6 mb-8 animate-fade-in-up">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">
              Progress
            </h3>
            <div className="flex items-center gap-2">
              {PROCESSING_STEPS.map((step, i) => {
                const isActive = i === currentStep;
                const isDone = i < currentStep;
                return (
                  <div key={step.status} className="flex items-center gap-2 flex-1">
                    <div
                      className={`
                        w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-all
                        ${isActive ? "bg-accent-1/20 ring-2 ring-accent-1 scale-110" : ""}
                        ${isDone ? "bg-success/20" : ""}
                        ${!isActive && !isDone ? "bg-card opacity-50" : ""}
                      `}
                    >
                      {step.icon}
                    </div>
                    {i < PROCESSING_STEPS.length - 1 && (
                      <div className="flex-1 h-0.5 rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent-1 to-accent-2 transition-all duration-500"
                          style={{ width: isDone ? "100%" : isActive ? "50%" : "0%" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              {isProcessing(job.status)
                ? "Pipeline AI sedang berjalan di cloud... halaman ini akan otomatis ter-update."
                : "Menunggu proses dimulai..."}
            </p>
          </div>
        )}

        {/* Error State */}
        {job.status === "failed" && (
          <div className="glass-card p-6 mb-8 border-danger/30 animate-fade-in">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-danger shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <h3 className="font-semibold text-danger">Processing Gagal</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {job.error_message || "Terjadi kesalahan yang tidak diketahui."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Clip Grid — tampilkan saat ada klip */}
        {clips.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">
              Klip Hasil ({clips.filter((c) => c.status === "rendered" || c.status === "done").length}/{clips.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger-children">
              {clips.map((clip) => (
                <div key={clip.id} className="glass-card overflow-hidden group" id={`clip-${clip.id}`}>
                  {/* Thumbnail / Video */}
                  <div className="aspect-[9/16] bg-black relative overflow-hidden">
                    {clipUrls[clip.id] ? (
                      <video
                        src={clipUrls[clip.id]}
                        controls
                        className="w-full h-full object-contain"
                        playsInline
                      />
                    ) : thumbUrls[clip.id] ? (
                      <img
                        src={thumbUrls[clip.id]}
                        alt={`Klip ${clip.idx}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-card">
                        {clip.status === "rendering" ? (
                          <svg className="w-8 h-8 text-accent-1 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-25" />
                            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg className="w-8 h-8 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </div>
                    )}

                    {/* Play overlay */}
                    {(clip.status === "rendered" || clip.status === "done") && !clipUrls[clip.id] && (
                      <button
                        onClick={() => handlePreview(clip)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                          <svg className="w-6 h-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                      </button>
                    )}

                    {/* Status overlay */}
                    <div className="absolute top-2 right-2">
                      <span className={`badge text-[10px] ${getStatusBadgeClass(clip.status)}`}>
                        {clip.status === "rendering" && (
                          <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                        )}
                        {getStatusLabel(clip.status)}
                      </span>
                    </div>

                    {/* Duration overlay */}
                    <div className="absolute bottom-2 left-2">
                      <span className="text-xs font-mono bg-black/60 px-2 py-0.5 rounded text-white">
                        {formatTimestamp(clip.end_time - clip.start_time)}
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <p className="font-semibold text-sm mb-1">Klip {clip.idx}</p>
                    {clip.hook_text && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        🎯 {clip.hook_text}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <span>{formatTimestamp(clip.start_time)} – {formatTimestamp(clip.end_time)}</span>
                    </div>

                    {/* Actions */}
                    {(clip.status === "rendered" || clip.status === "done") && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handlePreview(clip)}
                          className="btn-secondary text-xs py-1.5 px-3 flex-1"
                        >
                          {clipUrls[clip.id] ? "Tutup" : "Preview"}
                        </button>
                        <button
                          onClick={() => handleDownload(clip)}
                          disabled={downloading[clip.id]}
                          className="btn-primary text-xs py-1.5 px-3 flex-1"
                          id={`download-clip-${clip.id}`}
                        >
                          {downloading[clip.id] ? "..." : "Download"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
