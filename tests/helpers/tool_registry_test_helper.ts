import { join } from "@std/path";
import { ToolRegistry } from "../../src/services/tool_registry.ts";
import type { DatabaseService } from "../../src/services/db.ts";
import { createMockConfig } from "./config.ts";
import { initTestDbService } from "./db.ts";

/**
 * Test helper for ToolRegistry tests
 * Provides utilities for setting up temp directories, tool registry, and common test patterns
 */
export class ToolRegistryTestHelper {
  public tempDir: string;
  public registry: ToolRegistry;
  public db: DatabaseService;
  private dbCleanup: () => Promise<void>;

  private constructor(
    tempDir: string,
    registry: ToolRegistry,
    db: DatabaseService,
    dbCleanup: () => Promise<void>,
  ) {
    this.tempDir = tempDir;
    this.registry = registry;
    this.db = db;
    this.dbCleanup = dbCleanup;
  }

  /**
   * Creates a complete ToolRegistry test context
   */
  static async create(prefix: string): Promise<ToolRegistryTestHelper> {
    const tempDir = await Deno.makeTempDir({ prefix });
    const { db, cleanup } = await initTestDbService();
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    return new ToolRegistryTestHelper(tempDir, registry, db, cleanup);
  }

  /**
   * Creates the Knowledge directory within the temp directory
   */
  async createKnowledgeDir(): Promise<string> {
    const knowledgeDir = join(this.tempDir, "Knowledge");
    await Deno.mkdir(knowledgeDir, { recursive: true });
    return knowledgeDir;
  }

  /**
   * Creates a file in the Knowledge directory
   */
  async createKnowledgeFile(
    filename: string,
    content: string,
  ): Promise<string> {
    const knowledgeDir = await this.createKnowledgeDir();
    const filePath = join(knowledgeDir, filename);
    await Deno.writeTextFile(filePath, content);
    return filePath;
  }

  /**
   * Creates a file in the temp directory
   */
  async createFile(filename: string, content: string): Promise<string> {
    const filePath = join(this.tempDir, filename);
    await Deno.writeTextFile(filePath, content);
    return filePath;
  }

  /**
   * Creates a directory
   */
  async createDir(dirname: string): Promise<string> {
    const dirPath = join(this.tempDir, dirname);
    await Deno.mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  /**
   * Executes a tool and returns the result
   */
  async execute(toolName: string, params: Record<string, unknown>) {
    return await this.registry.execute(toolName, params);
  }

  /**
   * Waits for batched logging to complete
   */
  async waitForLogging(ms: number = 150): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gets activity logs for a specific action type
   */
  getActivityLogs(actionType: string) {
    return this.db.instance
      .prepare("SELECT * FROM activity WHERE action_type = ?")
      .all(actionType);
  }

  /**
   * Cleanup temp directory and database
   */
  async cleanup(): Promise<void> {
    await this.dbCleanup();
    await Deno.remove(this.tempDir, { recursive: true }).catch(() => {});
  }
}

/**
 * Creates a complete test context for tool registry tests
 */
export async function createToolRegistryTestContext(
  prefix: string,
): Promise<{
  helper: ToolRegistryTestHelper;
  tempDir: string;
  registry: ToolRegistry;
  db: DatabaseService;
  cleanup: () => Promise<void>;
}> {
  const helper = await ToolRegistryTestHelper.create(prefix);

  return {
    helper,
    tempDir: helper.tempDir,
    registry: helper.registry,
    db: helper.db,
    cleanup: () => helper.cleanup(),
  };
}
