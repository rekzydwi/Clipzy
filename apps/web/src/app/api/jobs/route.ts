import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase-server";
import { getPresignedUploadUrl } from "@/lib/r2";
import { randomUUID } from "crypto";

/**
 * POST /api/jobs — Bikin job baru + generate presigned upload URL ke R2.
 *
 * Body: { filename, contentType, brief?, nClips? }
 * Return: { jobId, uploadUrl }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { filename, contentType, brief, nClips } = body;

    if (!filename) {
      return NextResponse.json({ error: "filename wajib diisi" }, { status: 400 });
    }

    const jobId = randomUUID();
    const sourceVideoKey = `raw/${jobId}/source.mp4`;

    // Insert job ke database (pakai admin client supaya bypass RLS kalau perlu)
    const admin = await createSupabaseAdminClient();
    const { error: dbError } = await admin.from("jobs").insert({
      id: jobId,
      user_id: user.id,
      status: "uploaded",
      source_video_key: sourceVideoKey,
      source_filename: filename,
      brief: brief || null,
      n_clips_requested: nClips || 8,
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
      return NextResponse.json(
        { error: `Gagal membuat job: ${dbError.message}` },
        { status: 500 }
      );
    }

    // Generate presigned upload URL
    const uploadUrl = await getPresignedUploadUrl(sourceVideoKey, contentType || "video/mp4");

    return NextResponse.json({ jobId, uploadUrl });
  } catch (err: unknown) {
    console.error("POST /api/jobs error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
