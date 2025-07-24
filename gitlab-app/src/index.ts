import { Hono } from "hono";
import { logger } from "hono/logger";
import { bearerAuth } from "hono/bearer-auth";
import { triggerPipeline, cancelOldPipelines } from "./gitlab";
import { limitByUser } from "./limiter";
import type { WebhookPayload } from "./types";

const app = new Hono();

app.use("*", logger());
app.get("/health", (c) => c.text("ok"));

// Optional admin endpoint to disable bot
app.get(
  "/admin/disable",
  bearerAuth({ token: process.env.ADMIN_TOKEN! }),
  (c) => {
    process.env.CLAUDE_DISABLED = "true";
    return c.text("disabled");
  },
);

app.get(
  "/admin/enable",
  bearerAuth({ token: process.env.ADMIN_TOKEN! }),
  (c) => {
    process.env.CLAUDE_DISABLED = "false";
    return c.text("enabled");
  },
);

// Single webhook endpoint for all projects
app.post("/webhook", async (c) => {
  // Verify webhook secret
  if (c.req.header("x-gitlab-token") !== process.env.WEBHOOK_SECRET) {
    return c.text("unauthorized", 401);
  }

  // Only handle Note Hook events
  if (c.req.header("x-gitlab-event") !== "Note Hook") {
    return c.text("ignored");
  }

  const body = await c.req.json<WebhookPayload>();
  const note = body.object_attributes?.note || "";
  const projectId = body.project?.id;
  const projectPath = body.project?.path_with_namespace;

  // Get branch from MR or issue context
  const ref = body.merge_request?.source_branch || "main";
  const mrIid = body.merge_request?.iid;
  const issueIid = body.issue?.iid;
  const authorUsername = body.user?.username;

  // Check for @claude mention
  if (!/@claude\b/i.test(note) || process.env.CLAUDE_DISABLED === "true") {
    return c.text("skipped");
  }

  // Rate limit: 3 triggers per author per MR/issue per 15 min
  const resourceId = mrIid || issueIid || "general";
  const key = `${authorUsername}:${projectId}:${resourceId}`;

  if (!(await limitByUser(key))) {
    console.log("rate-limited", key);
    return c.text("rate-limited", 429);
  }

  console.log(`@claude triggered in ${projectPath} by ${authorUsername}`);

  // Trigger pipeline with variables
  const variables = {
    CLAUDE_TRIGGER: "true",
    CLAUDE_AUTHOR: authorUsername,
    CLAUDE_RESOURCE_TYPE: mrIid ? "merge_request" : "issue",
    CLAUDE_RESOURCE_ID: String(mrIid || issueIid || ""),
    CLAUDE_NOTE: note,
    CLAUDE_PROJECT_PATH: projectPath,
  };

  try {
    const pipelineId = await triggerPipeline(projectId, ref, variables);

    // Cancel old pipelines if configured
    if (process.env.CANCEL_OLD_PIPELINES === "true") {
      await cancelOldPipelines(projectId, pipelineId, ref);
    }

    return c.json({ status: "started", pipelineId });
  } catch (error) {
    console.error("Failed to trigger pipeline:", error);
    return c.json({ error: "Failed to trigger pipeline" }, 500);
  }
});

const port = Number(process.env.PORT) || 3000;
console.log(`GitLab Claude Webhook Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
