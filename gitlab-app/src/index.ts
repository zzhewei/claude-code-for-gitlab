import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import {
  triggerPipeline,
  cancelOldPipelines,
  getProject,
  branchExists,
  createBranch,
  sanitizeBranchName,
} from "./gitlab";
import { limitByUser } from "./limiter";
import { logger } from "./logger";
import type { WebhookPayload } from "./types";
import { sendPipelineNotification, sendRateLimitNotification } from "./discord";

// Utility function to parse trigger command and extract base branch
interface TriggerCommandResult {
  baseBranch: string | null;
  cleanedNote: string;
}

function parseTriggerCommand(note: string, triggerPhrase: string): TriggerCommandResult {
  // Escape special regex characters in trigger phrase
  const escapedTrigger = triggerPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Look for pattern: @claude base:branch-name
  const baseRegex = new RegExp(`${escapedTrigger}\\s+base:([\\w-/]+)`, 'i');
  const match = note.match(baseRegex);

  if (match) {
    const baseBranch = match[1];
    // Remove the base:branch-name part from the note, keeping just @claude
    const cleanedNote = note.replace(baseRegex, triggerPhrase).trim();
    return {
      baseBranch,
      cleanedNote
    };
  }

  // No base branch specified, return original note
  return {
    baseBranch: null,
    cleanedNote: note
  };
}

const app = new Hono();

// Log all requests
app.use("*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  logger.info(`${method} ${path}`, {
    method,
    path,
    headers: logger.maskSensitive(Object.fromEntries(c.req.raw.headers)),
  });

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  logger.info(`${method} ${path} ${status} ${duration}ms`, {
    method,
    path,
    status,
    duration,
  });
});
app.get("/health", (c) => c.text("ok"));

// Optional admin endpoint to disable bot
app.get(
  "/admin/disable",
  bearerAuth({ token: process.env.ADMIN_TOKEN! }),
  (c) => {
    process.env.CLAUDE_DISABLED = "true";
    logger.warn("Bot disabled via admin endpoint");
    return c.text("disabled");
  },
);

app.get(
  "/admin/enable",
  bearerAuth({ token: process.env.ADMIN_TOKEN! }),
  (c) => {
    process.env.CLAUDE_DISABLED = "false";
    logger.info("Bot enabled via admin endpoint");
    return c.text("enabled");
  },
);

// Single webhook endpoint for all projects
app.post("/webhook", async (c) => {
  const gitlabEvent = c.req.header("x-gitlab-event");
  const gitlabToken = c.req.header("x-gitlab-token");

  logger.debug("Webhook received", {
    event: gitlabEvent,
    hasToken: !!gitlabToken,
  });

  // Verify webhook secret
  if (gitlabToken !== process.env.WEBHOOK_SECRET) {
    logger.warn("Webhook unauthorized - invalid token");
    return c.text("unauthorized", 401);
  }

  // Only handle Note Hook events
  if (gitlabEvent !== "Note Hook") {
    logger.debug("Ignoring non-Note Hook event", { event: gitlabEvent });
    return c.text("ignored");
  }

  const body = await c.req.json<WebhookPayload>();

  // Log webhook payload (with sensitive data masked)
  logger.debug("Webhook payload received", {
    payload: logger.maskSensitive(body),
  });

  const note = body.object_attributes?.note || "";
  const projectId = body.project?.id;
  const projectPath = body.project?.path_with_namespace;
  const mrIid = body.merge_request?.iid;
  const issueIid = body.issue?.iid;
  const issueTitle = body.issue?.title;
  const authorUsername = body.user?.username;

  // Get trigger phrase from environment or use default
  const triggerPhrase = process.env.TRIGGER_PHRASE || "@claude";

  // Parse the trigger command to extract base branch if specified
  const { baseBranch, cleanedNote } = parseTriggerCommand(note, triggerPhrase);

  const triggerRegex = new RegExp(
    `${triggerPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  );

  // Check for trigger phrase mention (use cleanedNote for consistent checking)
  if (!triggerRegex.test(cleanedNote)) {
    logger.debug(`No ${triggerPhrase} mention found in note`);
    return c.text("skipped");
  }

  if (process.env.CLAUDE_DISABLED === "true") {
    logger.warn("Bot is disabled, skipping trigger");
    return c.text("disabled");
  }

  // Rate limit: 3 triggers per author per MR/issue per 15 min
  const resourceId = mrIid || issueIid || "general";
  const key = `${authorUsername}:${projectId}:${resourceId}`;

  if (!(await limitByUser(key))) {
    logger.warn("Rate limit exceeded", { key, author: authorUsername });

    // Send Discord notification for rate limit
    sendRateLimitNotification(
      projectPath,
      authorUsername,
      mrIid ? "merge_request" : issueIid ? "issue" : "unknown",
      String(mrIid || issueIid || ""),
    );

    return c.text("rate-limited", 429);
  }

  logger.info(`${triggerPhrase} triggered`, {
    project: projectPath,
    author: authorUsername,
    resourceType: mrIid ? "merge_request" : issueIid ? "issue" : "unknown",
    resourceId: mrIid || issueIid,
  });

  // Determine branch ref
  let ref = body.merge_request?.source_branch;
  let branchValidationMessage = "";

  // For issues, create a branch
  if (issueIid && !mrIid) {
    try {
      // Get project details for default branch
      const project = await getProject(projectId);
      const defaultBranch = project.default_branch || "main";

      // Determine which branch to use as base
      let sourceBranch = defaultBranch;

      if (baseBranch) {
        // Validate the specified base branch exists
        logger.debug("Validating specified base branch", {
          baseBranch,
          projectId
        });

        const branchValid = await branchExists(projectId, baseBranch);
        if (branchValid) {
          sourceBranch = baseBranch;
          branchValidationMessage = `✅ Using specified base branch: ${baseBranch}`;
        } else {
          branchValidationMessage = `⚠️ Specified branch '${baseBranch}' not found, falling back to default branch: ${defaultBranch}`;
          logger.warn("Specified base branch not found", {
            baseBranch,
            defaultBranch,
            projectId
          });
        }
      }

      // Generate branch name with timestamp to ensure uniqueness
      const timestamp = Date.now();
      const branchName = `claude/issue-${issueIid}-${sanitizeBranchName(issueTitle || "")}-${timestamp}`;

      logger.info("Creating branch for issue", {
        issueIid,
        issueTitle: issueTitle || "untitled",
        branchName,
        fromBranch: sourceBranch,
        requestedBaseBranch: baseBranch || "default",
        baseBranchValid: !baseBranch || sourceBranch === baseBranch,
      });

      // Try to create the branch
      await createBranch(projectId, branchName, sourceBranch);
      ref = branchName;
    } catch (error) {
      logger.error("Failed to create branch for issue", {
        issueIid,
        error: error instanceof Error ? error.message : error,
      });

      // Don't fall back to main - fail the request
      return c.text("branch-creation-failed", 500);
    }
  } else if (!ref) {
    // For merge requests without a source branch, fail
    logger.error("No branch ref determined for merge request");
    return c.text("no-branch-ref", 400);
  }

  // Extract the prompt after the trigger phrase
  const promptMatch = note.match(
    new RegExp(
      `${triggerPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(.*)`,
      "is",
    ),
  );
  const directPrompt = promptMatch ? promptMatch[1].trim() : "";

  // Create minimal webhook payload for CI/CD variable (10KB limit)
  const minimalPayload = {
    object_kind: body.object_kind,
    project: body.project,
    user: body.user,
    object_attributes: body.object_attributes
      ? {
          note: body.object_attributes.note,
          noteable_type: body.object_attributes.noteable_type,
        }
      : undefined,
    merge_request: body.merge_request
      ? {
          iid: body.merge_request.iid,
          title: body.merge_request.title,
          state: body.merge_request.state,
        }
      : undefined,
    issue: body.issue
      ? {
          iid: body.issue.iid,
          title: body.issue.title,
          state: body.issue.state,
        }
      : undefined,
  };

  // Trigger pipeline with variables
  const variables = {
    CLAUDE_TRIGGER: "true",
    CLAUDE_AUTHOR: authorUsername,
    CLAUDE_RESOURCE_TYPE: mrIid ? "merge_request" : "issue",
    CLAUDE_RESOURCE_ID: String(mrIid || issueIid || ""),
    CI_MERGE_REQUEST_IID: mrIid,
    CLAUDE_NOTE: cleanedNote, // Use cleaned note without base: syntax
    CLAUDE_PROJECT_PATH: projectPath,
    CLAUDE_BRANCH: ref,
    TRIGGER_PHRASE: triggerPhrase,
    DIRECT_PROMPT: directPrompt,
    GITLAB_WEBHOOK_PAYLOAD: JSON.stringify(minimalPayload),
  };

  logger.info("Triggering pipeline", {
    projectId,
    ref,
    requestedBaseBranch: baseBranch,
    branchValidationMessage,
    variables: logger.maskSensitive(variables),
  });

  try {
    const pipelineId = await triggerPipeline(projectId, ref, variables);

    logger.info("Pipeline triggered successfully", {
      pipelineId,
      projectId,
      ref,
    });

    // Send Discord notification (fire-and-forget)
    sendPipelineNotification({
      projectPath,
      authorUsername,
      resourceType: mrIid ? "merge_request" : issueIid ? "issue" : "unknown",
      resourceId: String(mrIid || issueIid || ""),
      branch: ref,
      pipelineId,
      gitlabUrl: process.env.GITLAB_URL || "https://gitlab.com",
      triggerPhrase,
      directPrompt,
      issueTitle: issueTitle || undefined,
    });

    // Cancel old pipelines if configured
    if (process.env.CANCEL_OLD_PIPELINES === "true") {
      await cancelOldPipelines(projectId, pipelineId, ref);
    }

    return c.json({ status: "started", pipelineId, branch: ref });
  } catch (error) {
    logger.error("Failed to trigger pipeline", {
      error: error instanceof Error ? error.message : error,
      projectId,
      ref,
    });
    return c.json({ error: "Failed to trigger pipeline" }, 500);
  }
});

const port = Number(process.env.PORT) || 3000;
logger.info(`GitLab Claude Webhook Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
