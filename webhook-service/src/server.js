#!/usr/bin/env node

import express from "express";
import crypto from "crypto";
import axios from "axios";
import helmet from "helmet";
import cors from "cors";
import winston from "winston";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.raw({ type: "application/json", limit: "10mb" }));

// Verify GitLab webhook signature
function verifyGitLabSignature(payload, signature, secret) {
  if (!signature || !secret) return true; // Skip verification if no secret configured

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  // Handle different signature lengths safely
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    );
  } catch (error) {
    return false;
  }
}

// Check if comment contains Claude trigger
function containsClaudeTrigger(text, triggerPhrase = "@claude") {
  if (!text) return false;
  return text.toLowerCase().includes(triggerPhrase.toLowerCase());
}

// Trigger GitLab pipeline
async function triggerGitLabPipeline(projectId, ref, variables = {}) {
  try {
    const gitlabUrl = process.env.GITLAB_URL || "https://gitlab.com";
    const token = process.env.GITLAB_TOKEN;

    if (!token) {
      throw new Error("GITLAB_TOKEN not configured");
    }

    const response = await axios.post(
      `${gitlabUrl}/api/v4/projects/${projectId}/trigger/pipeline`,
      {
        token: process.env.GITLAB_TRIGGER_TOKEN,
        ref: ref,
        variables: {
          TRIGGER_SOURCE: "claude_webhook",
          CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN || "",
          ...variables,
        },
      },
      {
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json",
        },
      },
    );

    logger.info("Pipeline triggered successfully", {
      projectId,
      pipelineId: response.data.id,
      ref,
      variables,
    });

    return response.data;
  } catch (error) {
    logger.error("Failed to trigger pipeline", {
      projectId,
      error: error.message,
      response: error.response?.data,
    });
    throw error;
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../package.json"),
        "utf-8",
      ),
    ).version,
  });
});

// Main webhook endpoint
app.post("/webhook/gitlab", async (req, res) => {
  try {
    const signature = req.headers["x-gitlab-token"];
    const eventType = req.headers["x-gitlab-event"];

    // Parse the request body
    let data;
    try {
      data = Buffer.isBuffer(req.body) ? JSON.parse(req.body) : req.body;
      if (!data || typeof data !== "object") {
        throw new Error("Invalid payload format");
      }
    } catch (parseError) {
      logger.warn("Invalid JSON payload", { error: parseError.message });
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    // Verify webhook signature if secret is configured
    if (process.env.GITLAB_WEBHOOK_SECRET) {
      const payload = Buffer.isBuffer(req.body)
        ? req.body
        : JSON.stringify(req.body);
      if (
        !verifyGitLabSignature(
          payload,
          signature,
          process.env.GITLAB_WEBHOOK_SECRET,
        )
      ) {
        logger.warn("Invalid webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    logger.info("Received GitLab webhook", {
      eventType,
      projectId: data.project?.id,
      objectKind: data.object_kind,
    });

    let shouldTrigger = false;
    let triggerVariables = {};
    let targetRef = data.project?.default_branch || "main";

    // Handle different event types
    switch (eventType) {
      case "Note Hook":
      case "note":
        // Handle merge request comments
        if (
          data.merge_request &&
          containsClaudeTrigger(data.object_attributes?.note)
        ) {
          shouldTrigger = true;
          triggerVariables = {
            TRIGGER_TYPE: "merge_request_note",
            CI_MERGE_REQUEST_IID: data.merge_request.iid,
            CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:
              data.merge_request.source_branch,
            CI_MERGE_REQUEST_TARGET_BRANCH_NAME:
              data.merge_request.target_branch,
            GITLAB_USER_NAME: data.user?.name || "Unknown",
            GITLAB_USER_EMAIL: data.user?.email || "",
            COMMENT_BODY: data.object_attributes?.note || "",
          };
          targetRef = data.merge_request.source_branch;
        }
        // Handle issue comments
        else if (
          data.issue &&
          containsClaudeTrigger(data.object_attributes?.note)
        ) {
          shouldTrigger = true;
          triggerVariables = {
            TRIGGER_TYPE: "issue_comment",
            CI_ISSUE_IID: data.issue.iid,
            GITLAB_USER_NAME: data.user?.name || "Unknown",
            GITLAB_USER_EMAIL: data.user?.email || "",
            COMMENT_BODY: data.object_attributes?.note || "",
            CLAUDE_BRANCH: `claude/issue-${data.issue.iid}`,
          };
        }
        break;

      case "Merge Request Hook":
      case "merge_request":
        // Handle MR description changes
        if (
          data.object_attributes?.action === "update" &&
          containsClaudeTrigger(data.object_attributes?.description)
        ) {
          shouldTrigger = true;
          triggerVariables = {
            TRIGGER_TYPE: "merge_request_update",
            CI_MERGE_REQUEST_IID: data.object_attributes.iid,
            CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:
              data.object_attributes.source_branch,
            CI_MERGE_REQUEST_TARGET_BRANCH_NAME:
              data.object_attributes.target_branch,
            GITLAB_USER_NAME: data.user?.name || "Unknown",
            MR_DESCRIPTION: data.object_attributes?.description || "",
          };
          targetRef = data.object_attributes.source_branch;
        }
        break;

      case "Issue Hook":
      case "issue":
        // Handle issue creation/updates with Claude mention
        if (
          (data.object_attributes?.action === "open" ||
            data.object_attributes?.action === "update") &&
          (containsClaudeTrigger(data.object_attributes?.title) ||
            containsClaudeTrigger(data.object_attributes?.description))
        ) {
          shouldTrigger = true;
          triggerVariables = {
            TRIGGER_TYPE: "issue_update",
            CI_ISSUE_IID: data.object_attributes.iid,
            GITLAB_USER_NAME: data.user?.name || "Unknown",
            ISSUE_TITLE: data.object_attributes?.title || "",
            ISSUE_DESCRIPTION: data.object_attributes?.description || "",
            CLAUDE_BRANCH: `claude/issue-${data.object_attributes.iid}`,
          };
        }
        break;
    }

    if (shouldTrigger) {
      try {
        const pipeline = await triggerGitLabPipeline(
          data.project.id,
          targetRef,
          triggerVariables,
        );

        res.json({
          success: true,
          message: "Pipeline triggered successfully",
          pipelineId: pipeline.id,
          triggerType: triggerVariables.TRIGGER_TYPE,
        });
      } catch (error) {
        logger.error("Pipeline trigger failed", { error: error.message });
        res.status(500).json({
          success: false,
          error: "Failed to trigger pipeline",
          details: error.message,
        });
      }
    } else {
      logger.info("Event does not require Claude action", {
        eventType,
        objectKind: data.object_kind,
      });
      res.json({
        success: true,
        message: "Event processed, no action required",
      });
    }
  } catch (error) {
    logger.error("Webhook processing error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error("Unhandled error", { error: error.message, stack: error.stack });
  res.status(500).json({ success: false, error: "Internal server error" });
});

// Start server only if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    logger.info(`Claude Code GitLab Webhook Service running on port ${PORT}`);
    logger.info("Health check available at /health");
    logger.info("Webhook endpoint: /webhook/gitlab");
  });
}

// Export helper functions for testing
app.__testHelpers = {
  containsClaudeTrigger: containsClaudeTrigger,
  verifyGitLabSignature: verifyGitLabSignature,
};

export default app;
