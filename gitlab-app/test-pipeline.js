#!/usr/bin/env node

// Test script to verify pipeline triggering works
const { Gitlab } = require("@gitbeaker/rest");

const gitlab = new Gitlab({
  host: process.env.GITLAB_URL || "https://gitlab.com",
  token: process.env.GITLAB_TOKEN,
});

async function testPipelineTrigger() {
  const projectId = 116; // Your test project ID
  const ref = "main";

  // Test variables
  const variables = [
    { key: "CLAUDE_TRIGGER", value: "true" },
    { key: "TEST_VAR", value: "test_value" },
  ];

  try {
    console.log("Testing pipeline trigger...");
    console.log("Project ID:", projectId);
    console.log("Branch:", ref);
    console.log("Variables:", JSON.stringify(variables, null, 2));

    const pipeline = await gitlab.Pipelines.create(projectId, ref, {
      variables,
    });

    console.log("\n✅ Pipeline created successfully!");
    console.log("Pipeline ID:", pipeline.id);
    console.log("Pipeline URL:", pipeline.web_url);
    console.log("Status:", pipeline.status);
  } catch (error) {
    console.error("\n❌ Failed to create pipeline:");
    console.error("Error:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error(
        "Response body:",
        JSON.stringify(error.response.body, null, 2),
      );
    }
  }
}

// Run test if called directly
if (require.main === module) {
  if (!process.env.GITLAB_TOKEN) {
    console.error("Error: GITLAB_TOKEN environment variable is required");
    process.exit(1);
  }

  testPipelineTrigger();
}
