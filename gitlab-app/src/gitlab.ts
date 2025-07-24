const BASE = process.env.GITLAB_URL || "https://gitlab.com";
const TOKEN = process.env.GITLAB_TOKEN!;

export async function triggerPipeline(
  projectId: number,
  ref: string,
  variables?: Record<string, string>,
): Promise<number> {
  const url = `${BASE}/api/v4/projects/${projectId}/pipeline`;

  const body = new URLSearchParams({ ref });
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      body.append(`variables[${key}]`, value);
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": TOKEN,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitLab API error ${response.status}: ${error}`);
  }

  const data = (await response.json()) as { id: number };
  return data.id;
}

export async function cancelOldPipelines(
  projectId: number,
  keepPipelineId: number,
  ref: string,
): Promise<void> {
  try {
    // List pipelines for the ref
    const url = `${BASE}/api/v4/projects/${projectId}/pipelines?ref=${encodeURIComponent(ref)}&status=pending`;

    const response = await fetch(url, {
      headers: { "PRIVATE-TOKEN": TOKEN },
    });

    if (!response.ok) {
      console.warn(`Failed to list pipelines: ${response.status}`);
      return;
    }

    const pipelines = (await response.json()) as Array<{
      id: number;
      status: string;
    }>;

    // Cancel older pending pipelines
    const older = pipelines.filter(
      (p) => p.id !== keepPipelineId && p.status === "pending",
    );

    if (older.length === 0) {
      return;
    }

    console.log(`Cancelling ${older.length} old pipelines`);

    await Promise.all(
      older.map((p) =>
        fetch(`${BASE}/api/v4/projects/${projectId}/pipelines/${p.id}/cancel`, {
          method: "POST",
          headers: { "PRIVATE-TOKEN": TOKEN },
        }).catch((err) =>
          console.warn(`Failed to cancel pipeline ${p.id}:`, err),
        ),
      ),
    );
  } catch (error) {
    console.error("Error cancelling old pipelines:", error);
    // Don't throw - this is not critical
  }
}
