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

  // Check for @claude mention
  if (!/@claude\b/i.test(note)) {
    logger.debug("No @claude mention found in note");
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
    return c.text("rate-limited", 429);
  }

  logger.info(`@claude triggered`, {
    project: projectPath,
    author: authorUsername,
    resourceType: mrIid ? "merge_request" : issueIid ? "issue" : "unknown",
    resourceId: mrIid || issueIid,
  });

  // Determine branch ref
  let ref = body.merge_request?.source_branch;

  // For issues, create a branch
  if (issueIid && !mrIid) {
    try {
      // Get project details for default branch
      const project = await getProject(projectId);
      const defaultBranch = project.default_branch || "main";

      // Generate branch name
      const branchName = `claude/issue-${issueIid}-${sanitizeBranchName(issueTitle || "")}`;

      logger.info("Checking branch for issue", {
        issueIid,
        branchName,
        defaultBranch,
      });

      // Check if branch already exists
      const exists = await branchExists(projectId, branchName);

      if (!exists) {
        logger.info("Creating branch for issue", {
          issueIid,
          branchName,
          fromBranch: defaultBranch,
        });

        await createBranch(projectId, branchName, defaultBranch);
      } else {
        logger.info("Branch already exists", { branchName });
      }

      ref = branchName;
    } catch (error) {
      logger.error("Failed to create branch for issue", {
        issueIid,
        error: error instanceof Error ? error.message : error,
      });
      // Fall back to default branch
      ref = "main";
    }
  }

  // Default to main if no ref determined
  ref = ref || "main";

  // Trigger pipeline with variables
  const variables = {
    CLAUDE_TRIGGER: "true",
    CLAUDE_AUTHOR: authorUsername,
    CLAUDE_RESOURCE_TYPE: mrIid ? "merge_request" : "issue",
    CLAUDE_RESOURCE_ID: String(mrIid || issueIid || ""),
    CLAUDE_NOTE: note,
    CLAUDE_PROJECT_PATH: projectPath,
    CLAUDE_BRANCH: ref,
  };

  logger.info("Triggering pipeline", {
    projectId,
    ref,
    variables: logger.maskSensitive(variables),
  });

  try {
    const pipelineId = await triggerPipeline(projectId, ref, variables);

    logger.info("Pipeline triggered successfully", {
      pipelineId,
      projectId,
      ref,
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
