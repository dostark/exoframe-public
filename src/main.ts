import { ConfigService } from "./config/service.ts";

if (import.meta.main) {
  console.log("🚀 Starting ExoFrame Daemon...");

  try {
    const configService = new ConfigService();
    const config = configService.get();
    const checksum = configService.getChecksum();

    console.log(`✅ Configuration loaded (Checksum: ${checksum.slice(0, 8)})`);
    console.log(`   Root: ${config.system.root}`);
    console.log(`   Log Level: ${config.system.log_level}`);

    console.log("ExoFrame Daemon Active");
  } catch (error) {
    console.error("❌ Fatal Error:", error);
    Deno.exit(1);
  }
}
