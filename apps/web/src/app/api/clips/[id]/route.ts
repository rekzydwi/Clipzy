import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase-server";

/**
 * PATCH /api/clips/:id — Simpan edit user (caption_words, start/end baru, hook_text).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clipId } = await params;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();

    // Cek clip ada & milik user
    const { data: clip } = await admin
      .from("clips")
      .select("id, job_id")
      .eq("id", clipId)
      .single();

    if (!clip) {
      return NextResponse.json({ error: "Klip tidak ditemukan" }, { status: 404 });
    }

    const { data: job } = await admin
      .from("jobs")
      .select("user_id")
      .eq("id", clip.job_id)
      .single();

    if (!job || job.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const allowedFields = ["caption_words", "start_time", "end_time", "hook_text", "hook_start", "hook_end"];
    const updates: Record<string, unknown> = { edited: true };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { error: updateError } = await admin
      .from("clips")
      .update(updates)
      .eq("id", clipId);

    if (updateError) {
      return NextResponse.json({ error: "Gagal update klip" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/clips/:id error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
