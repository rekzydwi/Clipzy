export type JobStatus = "uploaded" | "transcribing" | "analyzing" | "rendering" | "ready" | "failed";
export type ClipStatus = "pending" | "rendering" | "rendered" | "finalizing" | "done" | "failed";

export interface Job {
  id: string;
  user_id: string;
  status: JobStatus;
  source_video_key: string;
  source_filename: string | null;
  duration_seconds: number | null;
  brief: string | null;
  n_clips_requested: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Clip {
  id: string;
  job_id: string;
  idx: number;
  start_time: number;
  end_time: number;
  hook_start: number | null;
  hook_end: number | null;
  hook_text: string | null;
  reason: string | null;
  caption_words: Array<{ start: number; end: number; word: string }> | null;
  crop_keyframes: Array<{ t: number; x: number }> | null;
  status: ClipStatus;
  rendered_key: string | null;
  thumbnail_key: string | null;
  edited: boolean;
  created_at: string;
  updated_at: string;
}

export function getStatusLabel(status: JobStatus | ClipStatus): string {
  const labels: Record<string, string> = {
    uploaded: "Uploaded",
    transcribing: "Transkripsi...",
    analyzing: "Analisis AI...",
    rendering: "Rendering...",
    ready: "Selesai",
    failed: "Gagal",
    pending: "Menunggu",
    rendered: "Siap",
    finalizing: "Re-render...",
    done: "Selesai",
  };
  return labels[status] || status;
}

export function getStatusBadgeClass(status: JobStatus | ClipStatus): string {
  if (status === "ready" || status === "rendered" || status === "done") return "badge-ready";
  if (status === "failed") return "badge-failed";
  if (status === "uploaded" || status === "pending") return "badge-pending";
  return "badge-processing";
}

export function isProcessing(status: JobStatus): boolean {
  return ["transcribing", "analyzing", "rendering"].includes(status);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
