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
    await ensureDir(systemDir);  // Required for DatabaseService

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
    it("should create request with valid TOML frontmatter", async () => {
      const result = await requestCommands.create("Implement user authentication");

      // Verify result structure
      assertExists(result.trace_id);
      assertEquals(result.trace_id.length, 36); // UUID format
      assertEquals(result.status, "pending");
      assertEquals(result.priority, "normal");
      assertEquals(result.agent, "default");

      // Verify file exists
      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "+++"); // TOML delimiters
      assertStringIncludes(content, `trace_id = "${result.trace_id}"`);
      assertStringIncludes(content, 'status = "pending"');
      assertStringIncludes(content, 'priority = "normal"');
      assertStringIncludes(content, 'agent = "default"');
      assertStringIncludes(content, "Implement user authentication");
    });

    it("should accept custom priority", async () => {
      const result = await requestCommands.create("Fix critical bug", { priority: "critical" });
      assertEquals(result.priority, "critical");

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, 'priority = "critical"');
    });

    it("should accept custom agent", async () => {
      const result = await requestCommands.create("Write tests", { agent: "test_writer" });
      assertEquals(result.agent, "test_writer");

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, 'agent = "test_writer"');
    });

    it("should accept portal option", async () => {
      const result = await requestCommands.create("Add feature", { portal: "MyProject" });

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, 'portal = "MyProject"');
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
      assertStringIncludes(content, `created_by = "${result.created_by}"`);
    });

    it("should include source field", async () => {
      const result = await requestCommands.create("Test");
      assertEquals(result.source, "cli");

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, 'source = "cli"');
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
      assertStringIncludes(content, 'source = "file"');
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
      const updated = content.replace('status = "pending"', 'status = "processing"');
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
        const result = await requestCommands.create("Test", { priority: priority as "low" | "normal" | "high" | "critical" });
        assertEquals(result.priority, priority);
      });
    }
  });
});
