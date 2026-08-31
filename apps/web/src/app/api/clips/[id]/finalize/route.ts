import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase-server";
import { triggerWorkflow } from "@/lib/github";

/**
 * POST /api/clips/:id/finalize — Trigger re-render ringan setelah user edit.
 */
export async function POST(
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
      .select("id, job_id, status")
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

    // Trigger re-render workflow
    await triggerWorkflow("finalize-clip", { clip_id: clipId });

    // Update status
    await admin.from("clips").update({ status: "finalizing" }).eq("id", clipId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/clips/:id/finalize error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
