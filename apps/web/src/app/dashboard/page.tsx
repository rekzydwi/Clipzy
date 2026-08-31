"use client";

import { useState, useEffect, useCallback } from "react";
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

  function handleUploadComplete(jobId: string) {
    setShowUpload(false);
    router.push(`/jobs/${jobId}`);
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Kelola semua project video kamu
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="btn-primary"
            id="new-project-btn"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Project Baru
          </button>
        </div>

        {/* Job List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-24 animate-fade-in-up">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="2" y1="7" x2="7" y2="7" />
              <line x1="2" y1="17" x2="7" y2="17" />
              <line x1="17" y1="7" x2="22" y2="7" />
              <line x1="17" y1="17" x2="22" y2="17" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Belum ada project</h3>
            <p className="text-muted-foreground mb-6">
              Upload video pertama kamu untuk mulai
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="btn-primary"
            >
              Upload Video
            </button>
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="glass-card p-5 w-full text-left flex items-center gap-4 group cursor-pointer"
                id={`job-${job.id}`}
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-1/20 to-accent-2/20 flex items-center justify-center shrink-0">
                  {isProcessing(job.status) ? (
                    <svg className="w-5 h-5 text-accent-1 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : job.status === "ready" ? (
                    <svg className="w-5 h-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  ) : job.status === "failed" ? (
                    <svg className="w-5 h-5 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                    </svg>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-semibold truncate">
                      {job.source_filename || "Video tanpa nama"}
                    </p>
                    <span className={`badge ${getStatusBadgeClass(job.status)}`}>
                      {isProcessing(job.status) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      )}
                      {getStatusLabel(job.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {job.duration_seconds && (
                      <span>⏱ {formatDuration(job.duration_seconds)}</span>
                    )}
                    <span>🎬 {job.n_clips_requested} klip</span>
                    <span>{timeAgo(job.created_at)}</span>
                  </div>
                  {job.error_message && (
                    <p className="text-danger text-xs mt-1 truncate">
                      {job.error_message}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <svg
                  className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-all group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
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
