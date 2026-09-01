import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase-server";
import { triggerWorkflow } from "@/lib/github";

/**
 * POST /api/jobs/:id/start — Dipanggil setelah upload selesai.
 * Trigger GitHub Actions (repository_dispatch) dengan job_id.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Auth check
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Cek job milik user ini
    const admin = await createSupabaseAdminClient();
    const { data: job } = await admin
      .from("jobs")
      .select("id, user_id, status")
      .eq("id", jobId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });
    }

    if (job.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (job.status !== "uploaded") {
      return NextResponse.json({ error: "Job sudah diproses" }, { status: 400 });
    }

    // Trigger GitHub Actions
    await triggerWorkflow("process-video", { job_id: jobId });

    // Update status
    await admin.from("jobs").update({ status: "transcribing" }).eq("id", jobId);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("POST /api/jobs/:id/start error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
