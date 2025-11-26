import { parse } from "@std/toml";
import { isAbsolute, join } from "@std/path";
import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding/hex";
import { Config, ConfigSchema } from "./schema.ts";

export class ConfigService {
  private config: Config;
  private configPath: string;
  private checksum: string = "";

  constructor(configPath: string = "exo.config.toml") {
    // Use absolute path if provided, otherwise join with cwd
    this.configPath = isAbsolute(configPath) ? configPath : join(Deno.cwd(), configPath);
    this.config = this.load();
  }

  private load(): Config {
    try {
      const content = Deno.readTextFileSync(this.configPath);
      this.checksum = this.computeChecksum(content);

      const rawConfig = parse(content);
      const result = ConfigSchema.safeParse(rawConfig);

      if (!result.success) {
        console.error("❌ Invalid configuration in exo.config.toml:");
        for (const issue of result.error.issues) {
          console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
        }
        Deno.exit(1);
      }

      return result.data;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.warn("⚠️  Configuration file not found. Using defaults.");
        // Create default config file
        this.createDefaultConfig();
        // Reload the newly created file
        const content = Deno.readTextFileSync(this.configPath);
        this.checksum = this.computeChecksum(content);
        const rawConfig = parse(content);
        return ConfigSchema.parse(rawConfig);
      }
      throw error;
    }
  }

  private createDefaultConfig() {
    const defaultConfig = `
[system]
version = "1.0.0"
log_level = "info"

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"

[watcher]
debounce_ms = 200
stability_check = true
`;
    Deno.writeTextFileSync(this.configPath, defaultConfig.trim());
    console.log(`✅ Created default configuration at ${this.configPath}`);
  }

  private computeChecksum(content: string): string {
    const data = new TextEncoder().encode(content);
    const hash = crypto.subtle.digestSync("SHA-256", data);
    return encodeHex(hash);
  }

  public get(): Config {
    return this.config;
  }

  public getChecksum(): string {
    return this.checksum;
  }

  public async addPortal(alias: string, targetPath: string): Promise<void> {
    const created = new Date().toISOString();

    // Read current config
    const content = await Deno.readTextFile(this.configPath);

    // Add portal entry
    const portalEntry = `\n[[portals]]\nalias = "${alias}"\ntarget_path = "${targetPath}"\ncreated = "${created}"\n`;

    // Append to config
    await Deno.writeTextFile(this.configPath, content + portalEntry);

    // Reload config
    this.config = this.load();
  }

  public async removePortal(alias: string): Promise<void> {
    // Read current config
    let content = await Deno.readTextFile(this.configPath);

    // Remove portal section using regex
    const portalRegex = new RegExp(
      `\\[\\[portals\\]\\][\\s\\S]*?alias\\s*=\\s*["']${alias}["'][\\s\\S]*?(?=\\[\\[portals\\]\\]|\\[\\w+\\]|$)`,
      "g",
    );

    content = content.replace(portalRegex, "");

    // Clean up extra blank lines
    content = content.replace(/\n{3,}/g, "\n\n");

    await Deno.writeTextFile(this.configPath, content);

    // Reload config
    this.config = this.load();
  }

  public getPortals(): Array<{ alias: string; target_path: string; created?: string }> {
    return this.config.portals || [];
  }

  public getPortal(alias: string): { alias: string; target_path: string; created?: string } | undefined {
    return this.config.portals?.find((p) => p.alias === alias);
  }

  public async updatePortalVerification(alias: string): Promise<void> {
    // This would update last_verified timestamp if we add it to schema
    // For now, this is a placeholder for future enhancement
  }
}
