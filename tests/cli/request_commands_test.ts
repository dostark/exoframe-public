import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { RequestCommands } from "../../src/cli/request_commands.ts";
import { DatabaseService } from "../../src/services/db.ts";
import { createMockConfig } from "../helpers/config.ts";

describe("RequestCommands", () => {
  let tempDir: string;
  let db: DatabaseService;
  let requestCommands: RequestCommands;
  let inboxRequestsDir: string;
  let systemDir: string;

  beforeEach(async () => {
    // Create temp directory structure
    tempDir = await Deno.makeTempDir({ prefix: "request_commands_test_" });
    inboxRequestsDir = join(tempDir, "Inbox", "Requests");
    systemDir = join(tempDir, "System");

    await ensureDir(inboxRequestsDir);
    await ensureDir(systemDir); // Required for DatabaseService

    // Initialize database with config
    const config = createMockConfig(tempDir);
    db = new DatabaseService(config);

    // Initialize activity table
    db.instance.exec(`
      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        agent_id TEXT,
        action_type TEXT NOT NULL,
        target TEXT,
        payload TEXT NOT NULL,
        timestamp DATETIME DEFAULT (datetime('now'))
      );
    `);

    // Initialize RequestCommands
    requestCommands = new RequestCommands({ config, db }, tempDir);
  });

  afterEach(async () => {
    await db.close();
    await Deno.remove(tempDir, { recursive: true });
  });

  describe("create", () => {
    it("should create request with valid YAML frontmatter", async () => {
      const result = await requestCommands.create("Implement user authentication");

      // Verify result structure
      assertExists(result.trace_id);
      assertEquals(result.trace_id.length, 36); // UUID format
      assertEquals(result.status, "pending");
      assertEquals(result.priority, "normal");
      assertEquals(result.agent, "default");

      // Verify file exists
      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "---"); // YAML delimiters
      assertStringIncludes(content, `trace_id: "${result.trace_id}"`);
      assertStringIncludes(content, "status: pending");
      assertStringIncludes(content, "priority: normal");
      assertStringIncludes(content, "agent: default");
      assertStringIncludes(content, "Implement user authentication");
    });

    it("should accept custom priority", async () => {
      const result = await requestCommands.create("Fix critical bug", { priority: "critical" });
      assertEquals(result.priority, "critical");

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "priority: critical");
    });

    it("should accept custom agent", async () => {
      const result = await requestCommands.create("Write tests", { agent: "test_writer" });
      assertEquals(result.agent, "test_writer");

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "agent: test_writer");
    });

    it("should accept portal option", async () => {
      const result = await requestCommands.create("Add feature", { portal: "MyProject" });

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "portal: MyProject");
    });

    it("should generate unique trace_ids", async () => {
      const result1 = await requestCommands.create("Request 1");
      const result2 = await requestCommands.create("Request 2");

      assertNotEquals(result1.trace_id, result2.trace_id);
      assertNotEquals(result1.filename, result2.filename);
    });

    it("should reject invalid priority", async () => {
      await assertRejects(
        async () => await requestCommands.create("Test", { priority: "invalid" as "low" }),
        Error,
        "Invalid priority",
      );
    });

    it("should create file in correct directory", async () => {
      const result = await requestCommands.create("Test request");

      const expectedDir = join(tempDir, "Inbox", "Requests");
      assertStringIncludes(result.path, expectedDir);
    });

    it("should use filename pattern request-{short_trace_id}.md", async () => {
      const result = await requestCommands.create("Test request");

      const shortId = result.trace_id.slice(0, 8);
      assertEquals(result.filename, `request-${shortId}.md`);
    });

    it("should log activity to journal", async () => {
      const result = await requestCommands.create("Test request");

      // Wait for flush
      await db.waitForFlush();

      // Query activity journal
      const activities = db.getRecentActivity(10);
      const createActivity = activities.find((a) =>
        a.action_type === "request.created" &&
        a.trace_id === result.trace_id
      );

      assertExists(createActivity, "Activity should be logged");
      assertEquals(createActivity?.actor, "human");
      assertExists(createActivity?.payload?.description_length);
    });

    it("should include created_by from user identity", async () => {
      const result = await requestCommands.create("Test request");
      assertExists(result.created_by);

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, `created_by: ${result.created_by}`);
    });

    it("should include source field", async () => {
      const result = await requestCommands.create("Test");
      assertEquals(result.source, "cli");

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "source: cli");
    });

    it("should include created timestamp in ISO format", async () => {
      const before = new Date().toISOString();
      const result = await requestCommands.create("Test");
      const after = new Date().toISOString();

      assertExists(result.created);
      // Timestamp should be between before and after
      assertEquals(result.created >= before, true);
      assertEquals(result.created <= after, true);
    });

    it("should reject empty description", async () => {
      await assertRejects(
        async () => await requestCommands.create(""),
        Error,
        "Description cannot be empty",
      );

      await assertRejects(
        async () => await requestCommands.create("   "),
        Error,
        "Description cannot be empty",
      );
    });
  });

  describe("createFromFile", () => {
    it("should create request from file content", async () => {
      const inputFile = join(tempDir, "input.md");
      await Deno.writeTextFile(inputFile, "Implement feature from file");

      const result = await requestCommands.createFromFile(inputFile);

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "Implement feature from file");
      assertEquals(result.source, "file");
      assertStringIncludes(content, "source: file");
    });

    it("should reject non-existent file", async () => {
      await assertRejects(
        async () => await requestCommands.createFromFile("/nonexistent/file.md"),
        Error,
        "File not found",
      );
    });

    it("should reject empty file", async () => {
      const inputFile = join(tempDir, "empty.md");
      await Deno.writeTextFile(inputFile, "   \n  ");

      await assertRejects(
        async () => await requestCommands.createFromFile(inputFile),
        Error,
        "File is empty",
      );
    });

    it("should pass options to created request", async () => {
      const inputFile = join(tempDir, "input.md");
      await Deno.writeTextFile(inputFile, "Test content");

      const result = await requestCommands.createFromFile(inputFile, {
        agent: "custom_agent",
        priority: "high",
      });

      assertEquals(result.agent, "custom_agent");
      assertEquals(result.priority, "high");
    });

    it("should trim whitespace from file content", async () => {
      const inputFile = join(tempDir, "input.md");
      await Deno.writeTextFile(inputFile, "\n\n  Test content with whitespace  \n\n");

      const result = await requestCommands.createFromFile(inputFile);

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "Test content with whitespace");
    });
  });

  describe("list", () => {
    it("should return empty array when no requests", async () => {
      const requests = await requestCommands.list();
      assertEquals(requests, []);
    });

    it("should list all requests", async () => {
      await requestCommands.create("Request 1");
      await requestCommands.create("Request 2");

      const requests = await requestCommands.list();
      assertEquals(requests.length, 2);
    });

    it("should filter by status", async () => {
      await requestCommands.create("Request 1");
      // Create another request and manually modify its status
      const result2 = await requestCommands.create("Request 2");
      const content = await Deno.readTextFile(result2.path);
      const updated = content.replace("status: pending", "status: processing");
      await Deno.writeTextFile(result2.path, updated);

      const pending = await requestCommands.list("pending");
      assertEquals(pending.length, 1);

      const processing = await requestCommands.list("processing");
      assertEquals(processing.length, 1);
    });

    it("should sort by created date descending", async () => {
      const result1 = await requestCommands.create("Request 1");
      await new Promise((r) => setTimeout(r, 50)); // Small delay
      const result2 = await requestCommands.create("Request 2");

      const requests = await requestCommands.list();
      // Most recent first
      assertEquals(requests[0].trace_id, result2.trace_id);
      assertEquals(requests[1].trace_id, result1.trace_id);
    });

    it("should include metadata from frontmatter", async () => {
      await requestCommands.create("Test request", { priority: "high", agent: "architect" });

      const requests = await requestCommands.list();
      assertEquals(requests.length, 1);
      assertEquals(requests[0].priority, "high");
      assertEquals(requests[0].agent, "architect");
      assertEquals(requests[0].status, "pending");
    });
  });

  describe("show", () => {
    it("should show request by full trace_id", async () => {
      const created = await requestCommands.create("Test request");

      const { metadata, content } = await requestCommands.show(created.trace_id);
      assertEquals(metadata.trace_id, created.trace_id);
      assertStringIncludes(content, "Test request");
    });

    it("should show request by short trace_id", async () => {
      const created = await requestCommands.create("Test request");
      const shortId = created.trace_id.slice(0, 8);

      const { metadata } = await requestCommands.show(shortId);
      assertEquals(metadata.trace_id, created.trace_id);
    });

    it("should show request by filename", async () => {
      const created = await requestCommands.create("Test request");

      const { metadata } = await requestCommands.show(created.filename);
      assertEquals(metadata.trace_id, created.trace_id);
    });

    it("should reject non-existent request", async () => {
      await assertRejects(
        async () => await requestCommands.show("nonexistent"),
        Error,
        "Request not found",
      );
    });

    it("should return full content body", async () => {
      const description = "This is a detailed request\nwith multiple lines\nand formatting.";
      const created = await requestCommands.create(description);

      const { content } = await requestCommands.show(created.trace_id);
      assertStringIncludes(content, "This is a detailed request");
      assertStringIncludes(content, "with multiple lines");
    });

    it("should handle non-matching short ID", async () => {
      // Create two requests
      await requestCommands.create("Request 1");
      await requestCommands.create("Request 2");

      // A random non-matching ID should fail with "not found"
      await assertRejects(
        async () => await requestCommands.show("zzzzzzzzz"),
        Error,
        "Request not found",
      );
    });
  });

  describe("priority validation", () => {
    const validPriorities = ["low", "normal", "high", "critical"];

    for (const priority of validPriorities) {
      it(`should accept valid priority: ${priority}`, async () => {
        const result = await requestCommands.create("Test", {
          priority: priority as "low" | "normal" | "high" | "critical",
        });
        assertEquals(result.priority, priority);
      });
    }
  });

  describe("list edge cases", () => {
    it("should skip non-.md files in directory", async () => {
      // Create a valid request
      await requestCommands.create("Valid request");

      // Create non-.md files that should be ignored
      await Deno.writeTextFile(join(inboxRequestsDir, "readme.txt"), "Some text");
      await Deno.writeTextFile(join(inboxRequestsDir, "config.json"), "{}");
      await Deno.writeTextFile(join(inboxRequestsDir, ".hidden"), "hidden");

      const requests = await requestCommands.list();
      assertEquals(requests.length, 1); // Only the valid request
    });

    it("should skip directories in inbox", async () => {
      await requestCommands.create("Valid request");

      // Create a subdirectory that should be ignored
      await ensureDir(join(inboxRequestsDir, "subdir"));
      await Deno.writeTextFile(join(inboxRequestsDir, "subdir", "nested.md"), "nested");

      const requests = await requestCommands.list();
      assertEquals(requests.length, 1); // Only the valid request
    });

    it("should handle requests with minimal frontmatter", async () => {
      // Create a file with minimal frontmatter (missing some fields)
      const minimalContent = `---
trace_id: "minimal-trace-id-123"
---

Minimal request`;
      await Deno.writeTextFile(join(inboxRequestsDir, "request-minimal.md"), minimalContent);

      const requests = await requestCommands.list();
      assertEquals(requests.length, 1);
      assertEquals(requests[0].trace_id, "minimal-trace-id-123");
      assertEquals(requests[0].status, "unknown"); // Default when missing
      assertEquals(requests[0].priority, "normal"); // Default when missing
      assertEquals(requests[0].agent, "default"); // Default when missing
      assertEquals(requests[0].created_by, "unknown"); // Default when missing
      assertEquals(requests[0].source, "unknown"); // Default when missing
    });

    it("should return empty array when Inbox/Requests directory does not exist", async () => {
      // Create a fresh RequestCommands with non-existent directory
      const emptyDir = join(tempDir, "empty_workspace");
      const emptyCommands = new RequestCommands(
        { config: createMockConfig(tempDir), db },
        emptyDir,
      );

      const requests = await emptyCommands.list();
      assertEquals(requests, []);
    });
  });

  describe("show edge cases", () => {
    it("should throw error for ambiguous short ID", async () => {
      // Create two requests - we'll manually modify one to have a similar prefix
      const request1 = await requestCommands.create("Request 1");

      // Create another request and modify its trace_id to share prefix
      const request2 = await requestCommands.create("Request 2");
      const content2 = await Deno.readTextFile(request2.path);
      // Use same first 8 characters as request1
      const sharedPrefix = request1.trace_id.slice(0, 8);
      const fakeTraceId = `${sharedPrefix}-fake-uuid-different`;
      const updated2 = content2.replace(request2.trace_id, fakeTraceId);
      await Deno.writeTextFile(request2.path, updated2);

      // Now searching by the shared 8-char prefix should be ambiguous
      await assertRejects(
        async () => await requestCommands.show(sharedPrefix),
        Error,
        "Ambiguous request ID",
      );
    });

    it("should handle request with minimal frontmatter in show", async () => {
      // Create a file with minimal frontmatter
      const minimalContent = `---
trace_id: "show-minimal-123"
---

Minimal content for show`;
      await Deno.writeTextFile(join(inboxRequestsDir, "request-showmin.md"), minimalContent);

      const { metadata, content } = await requestCommands.show("show-minimal-123");
      assertEquals(metadata.trace_id, "show-minimal-123");
      assertEquals(metadata.status, "unknown");
      assertEquals(metadata.priority, "normal");
      assertEquals(metadata.agent, "default");
      assertEquals(metadata.created, "");
      assertEquals(metadata.created_by, "unknown");
      assertEquals(metadata.source, "unknown");
      assertStringIncludes(content, "Minimal content for show");
    });

    it("should throw error when directory does not exist", async () => {
      // Create a fresh RequestCommands with non-existent directory
      const emptyDir = join(tempDir, "nonexistent_workspace");
      const emptyCommands = new RequestCommands(
        { config: createMockConfig(tempDir), db },
        emptyDir,
      );

      await assertRejects(
        async () => await emptyCommands.show("any-id"),
        Error,
        "Request not found",
      );
    });

    it("should skip non-.md files when searching", async () => {
      await requestCommands.create("Valid request");

      // Create a .txt file with content that might match
      await Deno.writeTextFile(
        join(inboxRequestsDir, "not-a-request.txt"),
        'trace_id: "fake-trace-id"',
      );

      // Should not find the txt file
      await assertRejects(
        async () => await requestCommands.show("fake-trace-id"),
        Error,
        "Request not found",
      );
    });

    it("should skip directories when searching", async () => {
      await requestCommands.create("Valid request");

      // Create a subdirectory
      const subdir = join(inboxRequestsDir, "subdir");
      await ensureDir(subdir);

      // Should not throw when directory exists
      const requests = await requestCommands.list();
      assertEquals(requests.length, 1);
    });
  });

  describe("create edge cases", () => {
    it("should handle description with special TOML characters", async () => {
      const description = 'Test with "quotes" and \\backslashes\\ and\nnewlines';
      const result = await requestCommands.create(description);

      // File should be created and readable
      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "---");
      assertExists(result.trace_id);
    });

    it("should handle very long descriptions", async () => {
      const description = "A".repeat(10000); // 10KB description
      const result = await requestCommands.create(description);

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "A".repeat(100)); // Just check some content exists
      assertEquals(result.status, "pending");
    });

    it("should handle unicode in description", async () => {
      const description = "Implement 日本語 support with émojis 🚀";
      const result = await requestCommands.create(description);

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "日本語");
      assertStringIncludes(content, "🚀");
    });

    it("should create directory if Inbox/Requests does not exist", async () => {
      // Create a fresh workspace without the Requests dir
      const freshDir = join(tempDir, "fresh_workspace");
      await ensureDir(join(freshDir, "System")); // Need System for db
      const freshCommands = new RequestCommands(
        { config: createMockConfig(tempDir), db },
        freshDir,
      );

      // This should create the directory automatically
      const result = await freshCommands.create("Test auto-create dir");
      assertExists(result.trace_id);

      // Verify directory was created
      const dirExists = await Deno.stat(join(freshDir, "Inbox", "Requests")).catch(() => null);
      assertExists(dirExists);
    });

    it("should log activity with correct payload fields", async () => {
      const result = await requestCommands.create("Test activity payload", {
        priority: "high",
        agent: "special_agent",
        portal: "TestPortal",
      });

      await db.waitForFlush();

      const activities = db.getRecentActivity(10);
      const activity = activities.find((a) => a.trace_id === result.trace_id);

      assertExists(activity);
      assertEquals(activity.action_type, "request.created");
      assertEquals(activity.actor, "human");
      assertExists(activity.payload);
      assertEquals(activity.payload.priority, "high");
      assertEquals(activity.payload.agent, "special_agent");
      assertEquals(activity.payload.portal, "TestPortal");
      assertEquals(activity.payload.source, "cli");
      assertEquals(typeof activity.payload.description_length, "number");
    });

    it("should set portal to null in activity when not provided", async () => {
      const result = await requestCommands.create("Test without portal");

      await db.waitForFlush();

      const activities = db.getRecentActivity(10);
      const activity = activities.find((a) => a.trace_id === result.trace_id);

      assertExists(activity);
      assertEquals(activity.payload.portal, null);
    });
  });

  describe("createFromFile edge cases", () => {
    it("should handle file with only whitespace and newlines", async () => {
      const inputFile = join(tempDir, "whitespace.md");
      await Deno.writeTextFile(inputFile, "   \n\t\n   ");

      await assertRejects(
        async () => await requestCommands.createFromFile(inputFile),
        Error,
        "File is empty",
      );
    });

    it("should handle file with portal option", async () => {
      const inputFile = join(tempDir, "portal_test.md");
      await Deno.writeTextFile(inputFile, "Request with portal context");

      const result = await requestCommands.createFromFile(inputFile, {
        portal: "MyPortal",
      });

      assertEquals(result.portal, "MyPortal");
      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "portal: MyPortal");
    });
  });
});
