/**
 * Skills Service
 *
 * Phase 17: Skills Architecture
 *
 * Manages skill storage, retrieval, and trigger matching.
 * Skills are procedural memory that encode domain expertise,
 * procedures, and best practices as reusable instruction modules.
 *
 * @module services/skills
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import {
  type Skill,
  type SkillIndex,
  type SkillIndexEntry,
  SkillIndexSchema,
  type SkillMatch,
  SkillSchema,
  type SkillTriggers,
} from "../schemas/memory_bank.ts";

/**
 * Skills Service Configuration
 */
export interface SkillsConfig {
  /** Enable automatic skill matching */
  autoMatch: boolean;
  /** Maximum skills to inject per request */
  maxSkillsPerRequest: number;
  /** Token budget for skill context */
  skillContextBudget: number;
  /** Confidence threshold for trigger matching */
  matchThreshold: number;
}

const DEFAULT_CONFIG: SkillsConfig = {
  autoMatch: true,
  maxSkillsPerRequest: 5,
  skillContextBudget: 2000,
  matchThreshold: 0.3,
};

/**
 * Request context for skill matching
 */
export interface SkillMatchRequest {
  /** Keywords from the request */
  keywords?: string[];
  /** Detected task type */
  taskType?: string;
  /** File paths involved */
  filePaths?: string[];
  /** Request tags */
  tags?: string[];
  /** Raw request text for keyword extraction */
  requestText?: string;
  /** Agent ID for compatibility filtering */
  agentId?: string;
}

/**
 * Skills Service
 *
 * Provides skill management and matching capabilities:
 * - CRUD operations for skills
 * - Trigger-based skill matching
 * - Skill context building for prompt injection
 * - Learning-to-skill derivation
 */
export class SkillsService {
  private skillsDir: string;
  private coreDir: string;
  private projectDir: string;
  private learnedDir: string;
  private indexPath: string;
  private skillsConfig: SkillsConfig;
  private indexCache: SkillIndex | null = null;

  constructor(
    private config: Config,
    private db: DatabaseService,
    skillsConfig?: Partial<SkillsConfig>,
  ) {
    this.skillsDir = join(config.system.root, "Memory", "Skills");
    this.coreDir = join(this.skillsDir, "core");
    this.projectDir = join(this.skillsDir, "project");
    this.learnedDir = join(this.skillsDir, "learned");
    this.indexPath = join(this.skillsDir, "index.json");
    this.skillsConfig = { ...DEFAULT_CONFIG, ...skillsConfig };
  }

  /**
   * Initialize skills directory structure
   */
  async initialize(): Promise<void> {
    await ensureDir(this.skillsDir);
    await ensureDir(this.coreDir);
    await ensureDir(this.projectDir);
    await ensureDir(this.learnedDir);

    // Initialize index if missing
    if (!(await exists(this.indexPath))) {
      const emptyIndex: SkillIndex = {
        version: "1.0.0",
        skills: [],
        updated_at: new Date().toISOString(),
      };
      await Deno.writeTextFile(this.indexPath, JSON.stringify(emptyIndex, null, 2));
    }
  }

  // ===== Skill CRUD Operations =====

  /**
   * Get a skill by ID
   */
  async getSkill(skillId: string): Promise<Skill | null> {
    const index = await this.loadIndex();
    const entry = index.skills.find((s) => s.skill_id === skillId);

    if (!entry) {
      return null;
    }

    return this.loadSkillFromFile(entry.path);
  }

  /**
   * List all skills with optional filtering
   */
  async listSkills(filter?: {
    status?: "active" | "draft" | "deprecated";
    scope?: "global" | "project";
    source?: "core" | "project" | "user" | "learned";
  }): Promise<Skill[]> {
    const index = await this.loadIndex();
    const skills: Skill[] = [];

    for (const entry of index.skills) {
      const skill = await this.loadSkillFromFile(entry.path);
      if (!skill) continue;

      // Apply filters
      if (filter?.status && skill.status !== filter.status) continue;
      if (filter?.scope && skill.scope !== filter.scope) continue;
      if (filter?.source && skill.source !== filter.source) continue;

      skills.push(skill);
    }

    return skills;
  }

  /**
   * Create a new skill
   */
  async createSkill(
    skill: Omit<Skill, "id" | "created_at" | "usage_count">,
    location: "core" | "project" | "learned" = "learned",
  ): Promise<Skill> {
    const fullSkill: Skill = {
      ...skill,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      usage_count: 0,
    };

    // Validate skill
    const result = SkillSchema.safeParse(fullSkill);
    if (!result.success) {
      throw new Error(`Invalid skill: ${result.error.message}`);
    }

    // Determine directory
    let dir: string;
    switch (location) {
      case "core":
        dir = this.coreDir;
        break;
      case "project":
        dir = this.projectDir;
        break;
      case "learned":
      default:
        dir = this.learnedDir;
        break;
    }

    // Write skill file
    const skillPath = join(dir, `${fullSkill.skill_id}.skill.md`);
    await this.writeSkillToFile(fullSkill, skillPath);

    // Update index
    await this.addToIndex(fullSkill, skillPath);

    this.logActivity({
      event_type: "skill.created",
      target: fullSkill.skill_id,
      metadata: {
        location,
        scope: fullSkill.scope,
        source: fullSkill.source,
      },
    });

    return fullSkill;
  }

  /**
   * Update an existing skill
   */
  async updateSkill(
    skillId: string,
    updates: Partial<Omit<Skill, "id" | "skill_id" | "created_at">>,
  ): Promise<Skill | null> {
    const index = await this.loadIndex();
    const entry = index.skills.find((s) => s.skill_id === skillId);

    if (!entry) {
      return null;
    }

    const skill = await this.loadSkillFromFile(entry.path);
    if (!skill) {
      return null;
    }

    const updatedSkill: Skill = {
      ...skill,
      ...updates,
    };

    // Validate
    const result = SkillSchema.safeParse(updatedSkill);
    if (!result.success) {
      throw new Error(`Invalid skill update: ${result.error.message}`);
    }

    // Write updated skill
    await this.writeSkillToFile(updatedSkill, entry.path);

    // Update index
    await this.updateIndexEntry(updatedSkill, entry.path);

    this.logActivity({
      event_type: "skill.updated",
      target: skillId,
      metadata: {
        updated_fields: Object.keys(updates),
      },
    });

    return updatedSkill;
  }

  /**
   * Activate a draft skill
   */
  async activateSkill(skillId: string): Promise<boolean> {
    const result = await this.updateSkill(skillId, { status: "active" });
    return result !== null;
  }

  /**
   * Deprecate an active skill
   */
  async deprecateSkill(skillId: string): Promise<boolean> {
    const result = await this.updateSkill(skillId, { status: "deprecated" });
    return result !== null;
  }

  // ===== Skill Matching =====

  /**
   * Match skills based on request context
   */
  async matchSkills(request: SkillMatchRequest): Promise<SkillMatch[]> {
    const skills = await this.listSkills({ status: "active" });
    const matches: SkillMatch[] = [];

    // Extract keywords from request text if provided
    let keywords = request.keywords || [];
    if (request.requestText) {
      keywords = [...keywords, ...this.extractKeywords(request.requestText)];
    }

    for (const skill of skills) {
      // Check agent compatibility
      if (request.agentId && skill.compatible_with?.agents) {
        if (!skill.compatible_with.agents.includes(request.agentId)) {
          continue;
        }
      }

      const { confidence, matchedTriggers } = this.calculateTriggerMatch(
        skill.triggers,
        { ...request, keywords },
      );

      if (confidence >= this.skillsConfig.matchThreshold) {
        matches.push({
          skillId: skill.skill_id,
          confidence,
          matchedTriggers,
        });
      }
    }

    // Sort by confidence and limit
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches.slice(0, this.skillsConfig.maxSkillsPerRequest);
  }

  /**
   * Calculate trigger match score
   */
  private calculateTriggerMatch(
    triggers: SkillTriggers,
    request: SkillMatchRequest,
  ): { confidence: number; matchedTriggers: Partial<SkillTriggers> } {
    const matchedTriggers: Partial<SkillTriggers> = {};
    let totalScore = 0;
    let maxScore = 0;

    // Keyword matching (weight: 40%)
    if (triggers.keywords && triggers.keywords.length > 0) {
      maxScore += 40;
      const matchedKeywords = triggers.keywords.filter((kw) =>
        request.keywords?.some((rk) =>
          rk.toLowerCase().includes(kw.toLowerCase()) ||
          kw.toLowerCase().includes(rk.toLowerCase())
        )
      );
      if (matchedKeywords.length > 0) {
        const keywordScore = (matchedKeywords.length / triggers.keywords.length) * 40;
        totalScore += keywordScore;
        matchedTriggers.keywords = matchedKeywords;
      }
    }

    // Task type matching (weight: 30%)
    if (triggers.task_types && triggers.task_types.length > 0) {
      maxScore += 30;
      if (request.taskType && triggers.task_types.includes(request.taskType)) {
        totalScore += 30;
        matchedTriggers.task_types = [request.taskType];
      }
    }

    // File pattern matching (weight: 20%)
    if (triggers.file_patterns && triggers.file_patterns.length > 0) {
      maxScore += 20;
      const matchedPatterns = triggers.file_patterns.filter((pattern) =>
        request.filePaths?.some((fp) => this.matchGlob(fp, pattern))
      );
      if (matchedPatterns.length > 0) {
        const patternScore = (matchedPatterns.length / triggers.file_patterns.length) * 20;
        totalScore += patternScore;
        matchedTriggers.file_patterns = matchedPatterns;
      }
    }

    // Tag matching (weight: 10%)
    if (triggers.tags && triggers.tags.length > 0) {
      maxScore += 10;
      const matchedTags = triggers.tags.filter((tag) => request.tags?.includes(tag));
      if (matchedTags.length > 0) {
        const tagScore = (matchedTags.length / triggers.tags.length) * 10;
        totalScore += tagScore;
        matchedTriggers.tags = matchedTags;
      }
    }

    // Normalize score to 0-1
    const confidence = maxScore > 0 ? totalScore / maxScore : 0;

    return { confidence, matchedTriggers };
  }

  /**
   * Simple glob pattern matching
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regex = pattern
      .replace(/\*\*/g, "GLOBSTAR")
      .replace(/\*/g, "[^/]*")
      .replace(/GLOBSTAR/g, ".*")
      .replace(/\?/g, ".");

    try {
      return new RegExp(`^${regex}$`).test(path);
    } catch {
      return false;
    }
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/[^a-z0-9]+/);
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",

      "a",

      "by",
      "from",
      "is",

      "be",

      "an",

      "do",

      "and",

      "or",

      "it",

      "but",
      "in",
      "on",
      "at",
      "to",

      "a",

      "by",
      "from",
      "is",

      "be",

      "an",

      "do",

      "a",

      "an",

      "it",

      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",

      "and",
      "by",
      "from",
      "is",

      "be",

      "or",

      "do",

      "but",

      "in",

      "it",

      "on",
      "at",
      "to",

      "and",
      "by",
      "from",
      "is",

      "be",

      "or",

      "do",

      "but",

      "in",

      "it",

      "on",
      "at",
      "to",

      "or",

      "by",
      "from",
      "is",

      "be",

      "but",

      "do",

      "in",

      "on",

      "it",

      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "shall",
      "can",
      "need",
      "this",
      "that",
      "these",
      "those",
      "it",
      "its",
    ]);

    return [...new Set(words.filter((w) => w.length >= 3 && !stopWords.has(w)))];
  }

  // ===== Skill Context Building =====

  /**
   * Build skill context for prompt injection
   */
  async buildSkillContext(skillIds: string[]): Promise<string> {
    const skills: Skill[] = [];

    for (const skillId of skillIds) {
      const skill = await this.getSkill(skillId);
      if (skill) {
        skills.push(skill);
      }
    }

    if (skills.length === 0) {
      return "";
    }

    return this.formatSkillsForPrompt(skills);
  }

  /**
   * Format skills as markdown for prompt injection
   */
  private formatSkillsForPrompt(skills: Skill[]): string {
    const parts: string[] = [];

    parts.push("## Applied Skills");
    parts.push("");
    parts.push("The following skills have been automatically matched for this task:");
    parts.push("");

    for (const skill of skills) {
      parts.push(`### ${skill.name} (v${skill.version})`);
      parts.push("");
      parts.push(`> ${skill.description}`);
      parts.push("");
      parts.push("**Instructions:**");
      parts.push("");
      parts.push(skill.instructions);
      parts.push("");

      if (skill.constraints && skill.constraints.length > 0) {
        parts.push("**Constraints:**");
        for (const constraint of skill.constraints) {
          parts.push(`- ${constraint}`);
        }
        parts.push("");
      }

      if (skill.quality_criteria && skill.quality_criteria.length > 0) {
        parts.push("**Quality Criteria:**");
        for (const criterion of skill.quality_criteria) {
          parts.push(`- ${criterion.name}: ${criterion.description || ""}`);
        }
        parts.push("");
      }

      parts.push("---");
      parts.push("");
    }

    return parts.join("\n");
  }

  /**
   * Track skill usage
   */
  async recordSkillUsage(skillId: string): Promise<void> {
    const skill = await this.getSkill(skillId);
    if (skill) {
      await this.updateSkill(skillId, {
        usage_count: skill.usage_count + 1,
      });
    }
  }

  // ===== Learning-to-Skill Pipeline =====

  /**
   * Derive a skill from learnings
   */
  async deriveSkillFromLearnings(
    learningIds: string[],
    skillDraft: Omit<Skill, "id" | "created_at" | "usage_count" | "source" | "derived_from">,
  ): Promise<Skill> {
    const skill = await this.createSkill(
      {
        ...skillDraft,
        source: "learned",
        derived_from: learningIds,
        status: "draft", // Always starts as draft
      },
      "learned",
    );

    this.logActivity({
      event_type: "skill.derived",
      target: skill.skill_id,
      metadata: {
        learning_ids: learningIds,
      },
    });

    return skill;
  }

  // ===== Index Management =====

  /**
   * Load the skill index
   */
  private async loadIndex(): Promise<SkillIndex> {
    if (this.indexCache) {
      return this.indexCache;
    }

    try {
      const content = await Deno.readTextFile(this.indexPath);
      const parsed = JSON.parse(content);
      const result = SkillIndexSchema.safeParse(parsed);

      if (!result.success) {
        console.warn("[SkillsService] Invalid index, creating new one");
        return this.createEmptyIndex();
      }

      this.indexCache = result.data;
      return result.data;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return this.createEmptyIndex();
      }
      throw error;
    }
  }

  /**
   * Create empty index
   */
  private createEmptyIndex(): SkillIndex {
    return {
      version: "1.0.0",
      skills: [],
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Save the skill index
   */
  private async saveIndex(index: SkillIndex): Promise<void> {
    index.updated_at = new Date().toISOString();
    await Deno.writeTextFile(this.indexPath, JSON.stringify(index, null, 2));
    this.indexCache = index;
  }

  /**
   * Add skill to index
   */
  private async addToIndex(skill: Skill, path: string): Promise<void> {
    const index = await this.loadIndex();

    const entry: SkillIndexEntry = {
      skill_id: skill.skill_id,
      name: skill.name,
      version: skill.version,
      status: skill.status,
      scope: skill.scope,
      project: skill.project,
      path: path,
      triggers: skill.triggers,
    };

    // Remove existing entry if present
    index.skills = index.skills.filter((s) => s.skill_id !== skill.skill_id);
    index.skills.push(entry);

    await this.saveIndex(index);
  }

  /**
   * Update index entry
   */
  private async updateIndexEntry(skill: Skill, path: string): Promise<void> {
    await this.addToIndex(skill, path);
  }

  /**
   * Rebuild the entire index by scanning directories
   */
  async rebuildIndex(): Promise<void> {
    const index: SkillIndex = this.createEmptyIndex();
    const dirs = [this.coreDir, this.projectDir, this.learnedDir];

    for (const dir of dirs) {
      if (!(await exists(dir))) continue;

      for await (const entry of Deno.readDir(dir)) {
        if (entry.isFile && entry.name.endsWith(".skill.md")) {
          const skillPath = join(dir, entry.name);
          const skill = await this.loadSkillFromFile(skillPath);

          if (skill) {
            const indexEntry: SkillIndexEntry = {
              skill_id: skill.skill_id,
              name: skill.name,
              version: skill.version,
              status: skill.status,
              scope: skill.scope,
              project: skill.project,
              path: skillPath,
              triggers: skill.triggers,
            };
            index.skills.push(indexEntry);
          }
        }
      }
    }

    await this.saveIndex(index);

    this.logActivity({
      event_type: "skill.index_rebuilt",
      target: "index.json",
      metadata: {
        skill_count: index.skills.length,
      },
    });
  }

  // ===== File Operations =====

  /**
   * Load skill from markdown file with YAML frontmatter
   */
  private async loadSkillFromFile(path: string): Promise<Skill | null> {
    try {
      const content = await Deno.readTextFile(path);
      return this.parseSkillFile(content);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      console.error(`[SkillsService] Error loading skill from ${path}:`, error);
      return null;
    }
  }

  /**
   * Parse skill file content (YAML frontmatter + markdown body)
   */
  private parseSkillFile(content: string): Skill | null {
    // Extract YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      return null;
    }

    try {
      const frontmatter = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
      const body = frontmatterMatch[2].trim();

      // Map source values (core/project maps to user for schema compatibility)
      let source = frontmatter.source as string;
      if (source === "core" || source === "project") {
        source = "user";
      }

      // Build skill object
      const skill: Skill = {
        id: frontmatter.id as string,
        skill_id: frontmatter.skill_id as string,
        name: frontmatter.name as string,
        version: frontmatter.version as string,
        description: frontmatter.description as string,
        scope: frontmatter.scope as "global" | "project",
        project: frontmatter.project as string | undefined,
        status: frontmatter.status as "active" | "draft" | "deprecated",
        source: source as "user" | "agent" | "learned",
        source_id: frontmatter.source_id as string | undefined,
        triggers: frontmatter.triggers as SkillTriggers,
        instructions: body,
        constraints: frontmatter.constraints as string[] | undefined,
        output_requirements: frontmatter.output_requirements as string[] | undefined,
        quality_criteria: frontmatter.quality_criteria as Skill["quality_criteria"],
        compatible_with: frontmatter.compatible_with as Skill["compatible_with"],
        created_at: frontmatter.created_at as string,
        derived_from: frontmatter.derived_from as string[] | undefined,
        effectiveness_score: frontmatter.effectiveness_score as number | undefined,
        usage_count: (frontmatter.usage_count as number) ?? 0,
      };

      // Validate
      const result = SkillSchema.safeParse(skill);
      if (!result.success) {
        console.warn(`[SkillsService] Invalid skill in file: ${result.error.message}`);
        return null;
      }

      return result.data;
    } catch (error) {
      console.error("[SkillsService] Error parsing skill file:", error);
      return null;
    }
  }

  /**
   * Write skill to markdown file with YAML frontmatter
   */
  private async writeSkillToFile(skill: Skill, path: string): Promise<void> {
    const { instructions, ...frontmatterData } = skill;

    const frontmatter = stringifyYaml(frontmatterData);
    const content = `---\n${frontmatter}---\n\n${instructions}`;

    await Deno.writeTextFile(path, content);
  }

  // ===== Activity Logging =====

  /**
   * Log activity to database
   */
  private logActivity(event: {
    event_type: string;
    target: string;
    metadata?: Record<string, unknown>;
  }): void {
    try {
      this.db.instance.exec(
        `INSERT INTO activity_journal (id, trace_id, event_type, actor, target, metadata, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          crypto.randomUUID(),
          event.event_type,
          "skills_service",
          event.target,
          JSON.stringify(event.metadata || {}),
          new Date().toISOString(),
        ],
      );
    } catch {
      // Silently ignore logging errors - non-critical
    }
  }
}

// Re-export types for consumers
export type { SkillMatch };
