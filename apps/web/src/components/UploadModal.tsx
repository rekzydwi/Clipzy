"use client";

import { useState, useRef, useCallback } from "react";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (jobId: string) => void;
}

export default function UploadModal({ open, onClose, onComplete }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [brief, setBrief] = useState("");
  const [nClips, setNClips] = useState(8);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<"select" | "uploading" | "starting">("select");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) {
      setFile(f);
      setError("");
    } else {
      setError("File harus berformat video (MP4, MOV, dll)");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError("");
    }
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setStep("uploading");

    try {
      // 1. Create job & get presigned URL
      const createRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "video/mp4",
          brief: brief.trim() || null,
          nClips,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "Gagal membuat job");
      }

      const { jobId, uploadUrl } = await createRes.json();

      // 2. Upload langsung ke R2 via presigned URL
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload gagal (status ${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Upload gagal — cek koneksi internet"));
        xhr.send(file);
      });

      // 3. Trigger processing
      setStep("starting");
      const startRes = await fetch(`/api/jobs/${jobId}/start`, {
        method: "POST",
      });

      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Gagal memulai processing");
      }

      onComplete(jobId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan";
      setError(message);
      setStep("select");
    } finally {
      setUploading(false);
    }
  }

  function resetAndClose() {
    setFile(null);
    setBrief("");
    setNClips(8);
    setProgress(0);
    setStep("select");
    setError("");
    setUploading(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !uploading && resetAndClose()}>
      <div className="modal-content p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Project Baru</h2>
          {!uploading && (
            <button onClick={resetAndClose} className="btn-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {step === "select" && (
          <div className="space-y-5">
            {/* Dropzone */}
            <div
              className={`dropzone ${dragOver ? "dragover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
                id="video-file-input"
              />
              {file ? (
                <div className="animate-fade-in">
                  <svg className="w-12 h-12 mx-auto mb-3 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <>
                  <svg className="w-12 h-12 mx-auto mb-3 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="text-muted-foreground">
                    Drag & drop video, atau <span className="text-accent-1 font-medium">klik untuk browse</span>
                  </p>
                  <p className="text-xs text-muted mt-2">MP4, MOV, AVI — maks 500MB</p>
                </>
              )}
            </div>

            {/* Brief */}
            <div>
              <label className="block text-sm font-medium mb-2 text-muted-foreground">
                Brief Campaign <span className="text-muted">(opsional)</span>
              </label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="input"
                placeholder="Contoh: Durasi klip 30-45 detik, fokus pada tips produktivitas, hindari topik politik"
                rows={3}
                id="brief-input"
              />
            </div>

            {/* N clips */}
            <div>
              <label className="block text-sm font-medium mb-2 text-muted-foreground">
                Jumlah Klip: <span className="text-accent-1 font-bold">{nClips}</span>
              </label>
              <input
                type="range"
                min={1}
                max={15}
                value={nClips}
                onChange={(e) => setNClips(Number(e.target.value))}
                className="w-full accent-[var(--accent-1)]"
                id="n-clips-slider"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>1</span><span>15</span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm animate-fade-in">
                {error}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!file}
              className="btn-primary w-full"
              id="start-upload-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Upload & Proses
            </button>
          </div>
        )}

        {(step === "uploading" || step === "starting") && (
          <div className="text-center py-8 animate-fade-in">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <svg className="w-20 h-20 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="var(--border)" strokeWidth="2" />
                <path d="M4 12a8 8 0 018-8" stroke="url(#spinner-grad)" strokeWidth="2" strokeLinecap="round" />
                <defs>
                  <linearGradient id="spinner-grad" x1="4" y1="12" x2="12" y2="4">
                    <stop stopColor="#8B5CF6" /><stop offset="1" stopColor="#06B6D4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {step === "uploading" ? (
              <>
                <p className="font-semibold text-lg mb-2">Mengupload video...</p>
                <p className="text-muted-foreground text-sm mb-4">{file?.name}</p>
                <div className="progress-bar max-w-xs mx-auto">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-accent-1 font-mono text-sm mt-2">{progress}%</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-lg mb-2">Memulai processing...</p>
                <p className="text-muted-foreground text-sm">
                  Pipeline AI sedang disiapkan di cloud
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
