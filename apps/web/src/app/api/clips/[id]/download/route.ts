import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase-server";
import { getPresignedDownloadUrl } from "@/lib/r2";

/**
 * GET /api/clips/:id/download — Generate presigned download URL dari R2.
 * Query param ?type=thumbnail untuk thumbnail, default untuk video.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clipId } = await params;
    const type = request.nextUrl.searchParams.get("type");

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();

    const { data: clip } = await admin
      .from("clips")
      .select("id, job_id, rendered_key, thumbnail_key")
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

    const key = type === "thumbnail" ? clip.thumbnail_key : clip.rendered_key;
    if (!key) {
      return NextResponse.json({ error: "File belum tersedia" }, { status: 404 });
    }

    const url = await getPresignedDownloadUrl(key);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("GET /api/clips/:id/download error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
