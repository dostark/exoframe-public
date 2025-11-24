import { parse } from "@std/toml";
import { join } from "@std/path";
import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding/hex";
import { Config, ConfigSchema } from "./schema.ts";

export class ConfigService {
  private config: Config;
  private configPath: string;
  private checksum: string = "";

  constructor(configPath: string = "exo.config.toml") {
    this.configPath = join(Deno.cwd(), configPath);
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
        return ConfigSchema.parse({});
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
}
