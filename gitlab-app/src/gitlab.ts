import { Gitlab } from "@gitbeaker/rest";
import { logger } from "./logger";

// Initialize GitLab client
const gitlab = new Gitlab({
  host: process.env.GITLAB_URL || "https://gitlab.com",
  token: process.env.GITLAB_TOKEN!,
});

export async function triggerPipeline(
  projectId: number,
  ref: string,
  variables?: Record<string, string>,
): Promise<number> {
  try {
    logger.debug("Creating pipeline", {
      projectId,
      ref,
      variables: logger.maskSensitive(variables),
    });

    // Transform variables to the format Gitbeaker expects
    const pipelineVariables = variables
      ? Object.entries(variables).map(([key, value]) => ({
          key,
          value,
          variable_type: "env_var" as const,
        }))
      : undefined;

    // For Gitbeaker, pass variables directly in the options object
    const options = pipelineVariables ? { variables: pipelineVariables } : {};

    const pipeline = await gitlab.Pipelines.create(projectId, ref, options);

    logger.info("Pipeline created successfully", { pipelineId: pipeline.id });
    return pipeline.id;
  } catch (error) {
    logger.error("Failed to create pipeline", {
      error: error instanceof Error ? error.message : error,
      projectId,
      ref,
    });
    throw error;
  }
}

export async function cancelOldPipelines(
  projectId: number,
  keepPipelineId: number,
  ref: string,
): Promise<void> {
  try {
    logger.debug("Fetching pipelines for cancellation", { projectId, ref });

    // List pipelines for the ref
    const pipelines = await gitlab.Pipelines.all(projectId, {
      ref,
      status: "pending",
    });

    // Cancel old pipelines
    const cancelPromises = pipelines
      .filter((p) => p.id !== keepPipelineId)
      .map((p) =>
        gitlab.Pipelines.cancel(projectId, p.id).catch((err) => {
          logger.warn(`Failed to cancel pipeline ${p.id}:`, {
            error: err instanceof Error ? err.message : err,
          });
        }),
      );

    await Promise.all(cancelPromises);
    logger.info("Old pipelines cancelled", { count: cancelPromises.length });
  } catch (error) {
    logger.error("Error cancelling old pipelines:", {
      error: error instanceof Error ? error.message : error,
    });
    // Don't throw - this is not critical
  }
}

// Get project details including default branch
export async function getProject(projectId: number): Promise<{
  id: number;
  default_branch: string;
  path_with_namespace: string;
}> {
  try {
    logger.debug("Fetching project details", { projectId });
    const project = await gitlab.Projects.show(projectId);

    return {
      id: project.id,
      default_branch: project.default_branch || "main",
      path_with_namespace: project.path_with_namespace,
    };
  } catch (error) {
    logger.error("Failed to fetch project", {
      error: error instanceof Error ? error.message : error,
      projectId,
    });
    throw error;
  }
}

// Check if a branch exists
export async function branchExists(
  projectId: number,
  branchName: string,
): Promise<boolean> {
  try {
    logger.debug("Checking branch existence", { projectId, branchName });
    await gitlab.Branches.show(projectId, branchName);
    return true;
  } catch (error: any) {
    // 404 means branch doesn't exist
    if (error.response?.statusCode === 404) {
      return false;
    }
    logger.error("Error checking branch", {
      error: error instanceof Error ? error.message : error,
      projectId,
      branchName,
    });
    throw error;
  }
}

// Create a new branch
export async function createBranch(
  projectId: number,
  branchName: string,
  ref: string,
): Promise<void> {
  try {
    logger.info("Creating new branch", { projectId, branchName, ref });
    await gitlab.Branches.create(projectId, branchName, ref);
    logger.info("Branch created successfully", { projectId, branchName });
  } catch (error) {
    logger.error("Failed to create branch", {
      error: error instanceof Error ? error.message : error,
      projectId,
      branchName,
      ref,
    });
    throw error;
  }
}

// Sanitize branch name for GitLab
export function sanitizeBranchName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric chars with dashes
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .replace(/^-|-$/g, "") // Remove leading/trailing dashes
    .substring(0, 50); // Limit length
}
