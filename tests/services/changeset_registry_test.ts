/**
 * Tests for ChangesetRegistry
 *
 * Covers registration, retrieval, listing, status updates, and Activity Journal logging.
 */

import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@^1.0.0";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { ChangesetRegistry } from "../../src/services/changeset_registry.ts";
import { EventLogger } from "../../src/services/event_logger.ts";
import { initTestDbService } from "../helpers/db.ts";
import type { RegisterChangesetInput } from "../../src/schemas/changeset.ts";

describe("ChangesetRegistry", () => {
  let registry: ChangesetRegistry;
  let logger: EventLogger;
  let cleanup: () => Promise<void>;
  let db: Awaited<ReturnType<typeof initTestDbService>>["db"];

  beforeEach(async () => {
    const testDb = await initTestDbService();
    db = testDb.db;
    cleanup = testDb.cleanup;

    // Run changesets migration
    const migration = await Deno.readTextFile("./migrations/002_changesets.sql");
    db.instance.exec(migration);

    logger = new EventLogger({ db });
    registry = new ChangesetRegistry(db, logger);
  });

  afterEach(async () => {
    await cleanup();
  });

  // ============================================================================
  // Registration Tests
  // ============================================================================

  it("should register a new changeset", async () => {
    const input: RegisterChangesetInput = {
      trace_id: crypto.randomUUID(),
      portal: "TestPortal",
      branch: "feat/test-feature-abc123",
      commit_sha: "abc1234567890abcdef1234567890abcdef12345",
      files_changed: 3,
      description: "Implemented test feature",
      created_by: "test-agent",
    };

    const id = await registry.register(input);

    assertExists(id);
    assertEquals(typeof id, "string");
    assertEquals(id.length, 36); // UUID length
  });

  it("should set default values for optional fields", async () => {
    const input: RegisterChangesetInput = {
      trace_id: crypto.randomUUID(),
      portal: "TestPortal",
      branch: "feat/minimal-test",
      description: "Minimal changeset",
      created_by: "test-agent",
      files_changed: 0,
    };

    const id = await registry.register(input);
    const changeset = await registry.get(id);

    assertExists(changeset);
    assertEquals(changeset.status, "pending");
    assertEquals(changeset.files_changed, 0);
    assertEquals(changeset.commit_sha, null); // SQLite returns null for NULL values
  });

  it("should log changeset.created to Activity Journal", async () => {
    const trace_id = crypto.randomUUID();
    const input: RegisterChangesetInput = {
      trace_id,
      portal: "TestPortal",
      branch: "feat/logging-test",
      description: "Test logging",
      created_by: "test-agent",
      files_changed: 1,
    };

    await registry.register(input);
    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(trace_id);
    const created = activities.find((a) => a.action_type === "changeset.created");

    assertExists(created);
    assertEquals(created.target, "feat/logging-test");
  });

  it("should reject invalid input", async () => {
    const input = {
      trace_id: "invalid-uuid",
      portal: "TestPortal",
      branch: "feat/test",
      description: "Test",
      created_by: "agent",
      files_changed: 0,
    };

    await assertRejects(
      async () => await registry.register(input as RegisterChangesetInput),
      Error,
    );
  });

  // ============================================================================
  // Retrieval Tests
  // ============================================================================

  it("should get changeset by ID", async () => {
    const input: RegisterChangesetInput = {
      trace_id: crypto.randomUUID(),
      portal: "TestPortal",
      branch: "feat/get-test",
      description: "Test retrieval",
      created_by: "test-agent",
      files_changed: 2,
    };

    const id = await registry.register(input);
    const changeset = await registry.get(id);

    assertExists(changeset);
    assertEquals(changeset.id, id);
    assertEquals(changeset.portal, "TestPortal");
    assertEquals(changeset.branch, "feat/get-test");
    assertEquals(changeset.description, "Test retrieval");
    assertEquals(changeset.created_by, "test-agent");
    assertEquals(changeset.files_changed, 2);
  });

  it("should return null for non-existent changeset", async () => {
    const changeset = await registry.get(crypto.randomUUID());
    assertEquals(changeset, null);
  });

  it("should get changeset by branch name", async () => {
    const input: RegisterChangesetInput = {
      trace_id: crypto.randomUUID(),
      portal: "TestPortal",
      branch: "feat/branch-lookup",
      description: "Test branch lookup",
      created_by: "test-agent",
      files_changed: 1,
    };

    await registry.register(input);
    const changeset = await registry.getByBranch("feat/branch-lookup");

    assertExists(changeset);
    assertEquals(changeset.branch, "feat/branch-lookup");
  });

  // ============================================================================
  // Listing Tests
  // ============================================================================

  it("should list all changesets", async () => {
    const trace_id = crypto.randomUUID();

    await registry.register({
      trace_id,
      portal: "Portal1",
      branch: "feat/test-1",
      description: "Test 1",
      created_by: "agent-1",
      files_changed: 1,
    });

    await registry.register({
      trace_id,
      portal: "Portal2",
      branch: "feat/test-2",
      description: "Test 2",
      created_by: "agent-2",
      files_changed: 2,
    });

    const changesets = await registry.list();

    assertEquals(changesets.length, 2);
  });

  it("should filter changesets by trace_id", async () => {
    const trace_id1 = crypto.randomUUID();
    const trace_id2 = crypto.randomUUID();

    await registry.register({
      trace_id: trace_id1,
      portal: "TestPortal",
      branch: "feat/trace-1",
      description: "Trace 1",
      created_by: "agent",
      files_changed: 1,
    });

    await registry.register({
      trace_id: trace_id2,
      portal: "TestPortal",
      branch: "feat/trace-2",
      description: "Trace 2",
      created_by: "agent",
      files_changed: 1,
    });

    const changesets = await registry.list({ trace_id: trace_id1 });

    assertEquals(changesets.length, 1);
    assertEquals(changesets[0].trace_id, trace_id1);
  });

  it("should filter changesets by portal", async () => {
    const trace_id = crypto.randomUUID();

    await registry.register({
      trace_id,
      portal: "Portal1",
      branch: "feat/portal-1",
      description: "Portal 1",
      created_by: "agent",
      files_changed: 1,
    });

    await registry.register({
      trace_id,
      portal: "Portal2",
      branch: "feat/portal-2",
      description: "Portal 2",
      created_by: "agent",
      files_changed: 1,
    });

    const changesets = await registry.list({ portal: "Portal1" });

    assertEquals(changesets.length, 1);
    assertEquals(changesets[0].portal, "Portal1");
  });

  it("should filter changesets by status", async () => {
    const trace_id = crypto.randomUUID();

    const id1 = await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/status-pending",
      description: "Pending",
      created_by: "agent",
      files_changed: 1,
    });

    const id2 = await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/status-approved",
      description: "Approved",
      created_by: "agent",
      files_changed: 1,
    });

    await registry.updateStatus(id2, "approved", "test-user");

    const pending = await registry.list({ status: "pending" });
    const approved = await registry.list({ status: "approved" });

    assertEquals(pending.length, 1);
    assertEquals(pending[0].id, id1);
    assertEquals(approved.length, 1);
    assertEquals(approved[0].id, id2);
  });

  it("should filter changesets by created_by", async () => {
    const trace_id = crypto.randomUUID();

    await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/agent-1",
      description: "Agent 1",
      created_by: "agent-1",
      files_changed: 1,
    });

    await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/agent-2",
      description: "Agent 2",
      created_by: "agent-2",
      files_changed: 1,
    });

    const changesets = await registry.list({ created_by: "agent-1" });

    assertEquals(changesets.length, 1);
    assertEquals(changesets[0].created_by, "agent-1");
  });

  // ============================================================================
  // Status Update Tests
  // ============================================================================

  it("should update changeset to approved status", async () => {
    const input: RegisterChangesetInput = {
      trace_id: crypto.randomUUID(),
      portal: "TestPortal",
      branch: "feat/approve-test",
      description: "Test approval",
      created_by: "test-agent",
      files_changed: 1,
    };

    const id = await registry.register(input);
    await registry.updateStatus(id, "approved", "test-user");

    const changeset = await registry.get(id);

    assertExists(changeset);
    assertEquals(changeset.status, "approved");
    assertEquals(changeset.approved_by, "test-user");
    assertExists(changeset.approved_at);
  });

  it("should update changeset to rejected status", async () => {
    const input: RegisterChangesetInput = {
      trace_id: crypto.randomUUID(),
      portal: "TestPortal",
      branch: "feat/reject-test",
      description: "Test rejection",
      created_by: "test-agent",
      files_changed: 1,
    };

    const id = await registry.register(input);
    await registry.updateStatus(id, "rejected", "test-user", "Not meeting requirements");

    const changeset = await registry.get(id);

    assertExists(changeset);
    assertEquals(changeset.status, "rejected");
    assertEquals(changeset.rejected_by, "test-user");
    assertEquals(changeset.rejection_reason, "Not meeting requirements");
    assertExists(changeset.rejected_at);
  });

  it("should log changeset.approved to Activity Journal", async () => {
    const trace_id = crypto.randomUUID();
    const input: RegisterChangesetInput = {
      trace_id,
      portal: "TestPortal",
      branch: "feat/approve-logging",
      description: "Test approval logging",
      created_by: "test-agent",
      files_changed: 1,
    };

    const id = await registry.register(input);
    await registry.updateStatus(id, "approved", "test-user");
    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(trace_id);
    const approved = activities.find((a) => a.action_type === "changeset.approved");

    assertExists(approved);
    assertEquals(approved.target, "feat/approve-logging");
  });

  it("should log changeset.rejected to Activity Journal", async () => {
    const trace_id = crypto.randomUUID();
    const input: RegisterChangesetInput = {
      trace_id,
      portal: "TestPortal",
      branch: "feat/reject-logging",
      description: "Test rejection logging",
      created_by: "test-agent",
      files_changed: 1,
    };

    const id = await registry.register(input);
    await registry.updateStatus(id, "rejected", "test-user", "Invalid approach");
    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(trace_id);
    const rejected = activities.find((a) => a.action_type === "changeset.rejected");

    assertExists(rejected);
    assertEquals(rejected.target, "feat/reject-logging");
  });

  it("should throw error when updating non-existent changeset", async () => {
    await assertRejects(
      async () => await registry.updateStatus(crypto.randomUUID(), "approved"),
      Error,
      "Changeset not found",
    );
  });

  // ============================================================================
  // Utility Method Tests
  // ============================================================================

  it("should get all changesets for a trace", async () => {
    const trace_id = crypto.randomUUID();

    await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/trace-1",
      description: "Test 1",
      created_by: "agent",
      files_changed: 1,
    });

    await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/trace-2",
      description: "Test 2",
      created_by: "agent",
      files_changed: 2,
    });

    const changesets = await registry.getByTrace(trace_id);

    assertEquals(changesets.length, 2);
  });

  it("should get pending changesets for a portal", async () => {
    const trace_id = crypto.randomUUID();

    const id1 = await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/pending-1",
      description: "Pending 1",
      created_by: "agent",
      files_changed: 1,
    });

    const id2 = await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/pending-2",
      description: "Pending 2",
      created_by: "agent",
      files_changed: 1,
    });

    await registry.updateStatus(id2, "approved", "user");

    const pending = await registry.getPendingForPortal("TestPortal");

    assertEquals(pending.length, 1);
    assertEquals(pending[0].id, id1);
  });

  it("should count changesets by status", async () => {
    const trace_id = crypto.randomUUID();

    const id1 = await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/count-1",
      description: "Count 1",
      created_by: "agent",
      files_changed: 1,
    });

    await registry.register({
      trace_id,
      portal: "TestPortal",
      branch: "feat/count-2",
      description: "Count 2",
      created_by: "agent",
      files_changed: 1,
    });

    await registry.updateStatus(id1, "approved", "user");

    const pendingCount = await registry.countByStatus("pending");
    const approvedCount = await registry.countByStatus("approved");

    assertEquals(pendingCount, 1);
    assertEquals(approvedCount, 1);
  });
});
