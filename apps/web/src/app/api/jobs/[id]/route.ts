import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase-server";

/**
 * GET /api/jobs/:id — Ambil detail job + klip-klipnya.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();

    const { data: job } = await admin
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });
    }

    if (job.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: clips } = await admin
      .from("clips")
      .select("*")
      .eq("job_id", jobId)
      .order("idx");

    return NextResponse.json({ job, clips: clips || [] });
  } catch (err) {
    console.error("GET /api/jobs/:id error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
