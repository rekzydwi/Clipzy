/**
 * Trigger GitHub Actions workflow via repository_dispatch.
 * Pakai fine-grained PAT dengan scope Actions:write.
 */
export async function triggerWorkflow(
  eventType: "process-video" | "finalize-clip",
  payload: Record<string, string>
) {
  const token = (process.env.GITHUB_PAT || "").trim();
  const repo = (process.env.GITHUB_REPO || "").trim(); // format: "owner/repo"

  if (!token || !repo) {
    throw new Error("GITHUB_PAT atau GITHUB_REPO belum diset di environment variables.");
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "Clipzy-App",
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: payload,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub dispatch gagal (${res.status}): ${body}`);
  }
}
