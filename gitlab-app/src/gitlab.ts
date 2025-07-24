import { logger } from "./logger";

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
      logger.warn(`Failed to list pipelines: ${response.status}`);
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

    logger.info(`Cancelling ${older.length} old pipelines`);

    await Promise.all(
      older.map((p) =>
        fetch(`${BASE}/api/v4/projects/${projectId}/pipelines/${p.id}/cancel`, {
          method: "POST",
          headers: { "PRIVATE-TOKEN": TOKEN },
        }).catch((err) =>
          logger.warn(`Failed to cancel pipeline ${p.id}:`, err),
        ),
      ),
    );
  } catch (error) {
    logger.error("Error cancelling old pipelines:", { error: error instanceof Error ? error.message : error });
    // Don't throw - this is not critical
  }
}

// Get project details including default branch
export async function getProject(projectId: number): Promise<{
  id: number;
  default_branch: string;
  path_with_namespace: string;
}> {
  const url = `${BASE}/api/v4/projects/${projectId}`;
  
  logger.debug("Fetching project details", { projectId, url });
  
  const response = await fetch(url, {
    headers: { "PRIVATE-TOKEN": TOKEN },
  });
  
  if (!response.ok) {
    const error = await response.text();
    logger.error("Failed to fetch project", { 
      projectId, 
      status: response.status, 
      error 
    });
    throw new Error(`GitLab API error ${response.status}: ${error}`);
  }
  
  const data = await response.json() as {
    id: number;
    default_branch: string;
    path_with_namespace: string;
  };
  
  logger.debug("Project details fetched", { 
    projectId: data.id, 
    defaultBranch: data.default_branch 
  });
  
  return data;
}

// Check if a branch exists
export async function branchExists(
  projectId: number,
  branchName: string,
): Promise<boolean> {
  const url = `${BASE}/api/v4/projects/${projectId}/repository/branches/${encodeURIComponent(branchName)}`;
  
  logger.debug("Checking if branch exists", { projectId, branchName });
  
  try {
    const response = await fetch(url, {
      headers: { "PRIVATE-TOKEN": TOKEN },
    });
    
    const exists = response.ok;
    logger.debug("Branch existence check", { projectId, branchName, exists });
    
    return exists;
  } catch (error) {
    logger.error("Error checking branch existence", { 
      projectId, 
      branchName, 
      error 
    });
    return false;
  }
}

// Create a new branch
export async function createBranch(
  projectId: number,
  branchName: string,
  ref: string,
): Promise<void> {
  const url = `${BASE}/api/v4/projects/${projectId}/repository/branches`;
  
  logger.info("Creating new branch", { projectId, branchName, ref });
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch: branchName,
      ref: ref,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    logger.error("Failed to create branch", { 
      projectId, 
      branchName, 
      status: response.status, 
      error 
    });
    throw new Error(`GitLab API error ${response.status}: ${error}`);
  }
  
  logger.info("Branch created successfully", { projectId, branchName });
}

// Sanitize issue title for branch name
export function sanitizeBranchName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove non-word characters except spaces and hyphens
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .slice(0, 50); // Truncate to reasonable length
}
