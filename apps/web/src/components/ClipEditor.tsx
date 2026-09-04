"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Clip } from "@/lib/types";
import { formatTimestamp } from "@/lib/types";

type CaptionWord = { start: number; end: number; word: string };
type EditMode = "words" | "text";

interface ClipEditorProps {
  clip: Clip;
  videoUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ClipEditor({ clip, videoUrl, onClose, onSaved }: ClipEditorProps) {
  const [words, setWords] = useState<CaptionWord[]>(() =>
    (clip.caption_words || []).map((w) => ({ ...w }))
  );
  const [originalWords] = useState<CaptionWord[]>(() =>
    (clip.caption_words || []).map((w) => ({ ...w }))
  );
  const [startTime, setStartTime] = useState(clip.start_time);
  const [endTime, setEndTime] = useState(clip.end_time);
  const [hookText, setHookText] = useState(clip.hook_text || "");
  const [hookStart, setHookStart] = useState(clip.hook_start ?? clip.start_time);
  const [hookEnd, setHookEnd] = useState(clip.hook_end ?? clip.start_time + 3);

  const [editMode, setEditMode] = useState<EditMode>("words");
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "finalizing" | "done">("idle");

  const modalRef = useRef<HTMLDivElement>(null);

  // Sync bulk text when switching modes
  useEffect(() => {
    if (editMode === "text") {
      setBulkText(words.map((w) => w.word).join(" "));
    }
  }, [editMode, words]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  // Close on overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !saving) onClose();
    },
    [onClose, saving]
  );

  // Update a single word
  function updateWord(index: number, newWord: string) {
    setWords((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], word: newWord };
      return next;
    });
  }

  // Apply bulk text back to words (preserving timestamps)
  function applyBulkText() {
    const newWordList = bulkText.trim().split(/\s+/);
    setWords((prev) => {
      const next: CaptionWord[] = [];
      for (let i = 0; i < newWordList.length; i++) {
        if (i < prev.length) {
          next.push({ ...prev[i], word: newWordList[i] });
        } else {
          // New words beyond original count — use last word's timing
          const last = prev[prev.length - 1] || { start: 0, end: 0.5 };
          next.push({ start: last.end, end: last.end + 0.5, word: newWordList[i] });
        }
      }
      return next;
    });
  }

  // Check if a word was edited
  function isWordEdited(index: number): boolean {
    if (index >= originalWords.length) return true;
    return words[index]?.word !== originalWords[index]?.word;
  }

  // Auto-size input to content
  function autoSize(input: HTMLInputElement) {
    // Approximate character width
    const len = Math.max(input.value.length, 2);
    input.style.width = `${len * 9 + 24}px`;
  }

  // Has changes
  const hasChanges =
    startTime !== clip.start_time ||
    endTime !== clip.end_time ||
    hookText !== (clip.hook_text || "") ||
    hookStart !== (clip.hook_start ?? clip.start_time) ||
    hookEnd !== (clip.hook_end ?? clip.start_time + 3) ||
    words.some((w, i) => i >= originalWords.length || w.word !== originalWords[i]?.word);

  // Save & Re-render
  async function handleSave() {
    setSaving(true);
    setError("");
    setStatus("saving");

    // If in text mode, apply bulk text first
    if (editMode === "text") {
      applyBulkText();
    }

    try {
      // 1. PATCH clip data
      const finalWords = editMode === "text"
        ? bulkText.trim().split(/\s+/).map((word, i) => {
            if (i < words.length) return { ...words[i], word };
            const last = words[words.length - 1] || { start: 0, end: 0.5 };
            return { start: last.end, end: last.end + 0.5, word };
          })
        : words;

      const patchBody: Record<string, unknown> = {
        caption_words: finalWords,
        start_time: startTime,
        end_time: endTime,
        hook_text: hookText || null,
        hook_start: hookStart,
        hook_end: hookEnd,
      };

      const patchRes = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (!patchRes.ok) {
        const data = await patchRes.json();
        throw new Error(data.error || "Gagal menyimpan perubahan");
      }

      // 2. POST finalize (trigger re-render)
      setStatus("finalizing");
      const finalizeRes = await fetch(`/api/clips/${clip.id}/finalize`, {
        method: "POST",
      });

      if (!finalizeRes.ok) {
        const data = await finalizeRes.json();
        throw new Error(data.error || "Gagal memulai re-render");
      }

      setStatus("done");
      // Give a moment for the user to see the success state
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      setError(msg);
      setStatus("idle");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-overlay" onClick={handleOverlayClick} id="clip-editor-overlay">
      <div className="editor-modal" ref={modalRef} id="clip-editor-modal">
        {/* Header */}
        <div className="editor-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Klip {clip.idx}
          </h2>
          <button
            className="editor-close"
            onClick={onClose}
            disabled={saving}
            id="editor-close-btn"
            aria-label="Tutup editor"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="editor-body">
          {/* Video Preview */}
          {videoUrl && (
            <div className="editor-section">
              <div className="editor-section-title">
                🎬 Preview Video
              </div>
              <div style={{ borderRadius: "var(--radius)", overflow: "hidden", maxHeight: "280px" }}>
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  style={{ width: "100%", maxHeight: "280px", objectFit: "contain", background: "#000" }}
                />
              </div>
            </div>
          )}

          {/* Subtitle Editor */}
          <div className="editor-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div className="editor-section-title" style={{ marginBottom: 0 }}>
                💬 Subtitle / Caption
              </div>
              <div className="editor-mode-toggle">
                <button
                  className={`editor-mode-btn ${editMode === "words" ? "active" : ""}`}
                  onClick={() => {
                    if (editMode === "text") applyBulkText();
                    setEditMode("words");
                  }}
                  type="button"
                >
                  Per Kata
                </button>
                <button
                  className={`editor-mode-btn ${editMode === "text" ? "active" : ""}`}
                  onClick={() => setEditMode("text")}
                  type="button"
                >
                  Teks
                </button>
              </div>
            </div>

            {editMode === "words" ? (
              words.length > 0 ? (
                <div className="subtitle-words">
                  {words.map((w, i) => (
                    <div key={`${i}-${w.start}`} className="subtitle-word">
                      <input
                        type="text"
                        className={`subtitle-word-input ${isWordEdited(i) ? "edited" : ""}`}
                        value={w.word}
                        onChange={(e) => updateWord(i, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        ref={(el) => { if (el) autoSize(el); }}
                        onInput={(e) => autoSize(e.target as HTMLInputElement)}
                        disabled={saving}
                      />
                      <span className="subtitle-word-time">
                        {formatTimestamp(w.start)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "14px" }}>
                  Tidak ada data caption untuk klip ini.
                </p>
              )
            ) : (
              <textarea
                className="subtitle-textarea"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Edit semua teks subtitle di sini..."
                disabled={saving}
              />
            )}

            {editMode === "words" && words.some((_, i) => isWordEdited(i)) && (
              <p style={{ marginTop: "10px", fontSize: "12px", color: "var(--warning)" }}>
                ⚡ {words.filter((_, i) => isWordEdited(i)).length} kata diubah
              </p>
            )}
          </div>

          {/* Trim Editor */}
          <div className="editor-section">
            <div className="editor-section-title">
              ✂️ Trim Durasi
            </div>
            <div className="trim-controls">
              <div className="trim-field">
                <label>Waktu Mulai (detik)</label>
                <input
                  type="number"
                  value={startTime}
                  onChange={(e) => setStartTime(Number(e.target.value))}
                  step={0.1}
                  min={0}
                  disabled={saving}
                  id="trim-start-input"
                />
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  {formatTimestamp(startTime)}
                </span>
              </div>
              <div className="trim-field">
                <label>Waktu Selesai (detik)</label>
                <input
                  type="number"
                  value={endTime}
                  onChange={(e) => setEndTime(Number(e.target.value))}
                  step={0.1}
                  min={startTime + 0.5}
                  disabled={saving}
                  id="trim-end-input"
                />
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  {formatTimestamp(endTime)}
                </span>
              </div>
            </div>
            <p style={{ marginTop: "10px", fontSize: "12px", color: "var(--muted-foreground)" }}>
              📐 Durasi: {formatTimestamp(endTime - startTime)}
            </p>
          </div>

          {/* Hook Text Editor */}
          <div className="editor-section">
            <div className="editor-section-title">
              🎯 Hook Teaser
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted-foreground)", display: "block", marginBottom: "6px" }}>
                Teks Hook
              </label>
              <input
                type="text"
                className="hook-input"
                value={hookText}
                onChange={(e) => setHookText(e.target.value)}
                placeholder="Teks hook yang menarik perhatian..."
                disabled={saving}
                id="hook-text-input"
              />
            </div>
            <div className="trim-controls">
              <div className="trim-field">
                <label>Hook Mulai (detik)</label>
                <input
                  type="number"
                  value={hookStart}
                  onChange={(e) => setHookStart(Number(e.target.value))}
                  step={0.1}
                  min={startTime}
                  max={endTime}
                  disabled={saving}
                  id="hook-start-input"
                />
              </div>
              <div className="trim-field">
                <label>Hook Selesai (detik)</label>
                <input
                  type="number"
                  value={hookEnd}
                  onChange={(e) => setHookEnd(Number(e.target.value))}
                  step={0.1}
                  min={hookStart + 0.5}
                  max={endTime}
                  disabled={saving}
                  id="hook-end-input"
                />
              </div>
            </div>
            <p style={{ marginTop: "10px", fontSize: "11px", color: "var(--muted)" }}>
              Hook teaser = potongan singkat dari klip yang diprepend di awal video sebagai pemancing.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="editor-footer">
          <div className="editor-status">
            {status === "finalizing" && (
              <>
                <span className="dot dot-finalizing" />
                Re-rendering sedang berjalan...
              </>
            )}
            {status === "done" && (
              <>
                <span className="dot dot-done" />
                <span style={{ color: "var(--success)" }}>Berhasil! Video sedang di-render ulang.</span>
              </>
            )}
            {status === "saving" && (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin-slow">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Menyimpan perubahan...
              </>
            )}
            {error && (
              <span style={{ color: "var(--danger)" }}>❌ {error}</span>
            )}
          </div>

          <div className="editor-footer-actions">
            <button
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
              id="editor-cancel-btn"
            >
              Batal
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || !hasChanges || status === "done"}
              id="editor-save-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {saving ? "Menyimpan..." : "Simpan & Re-render"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
