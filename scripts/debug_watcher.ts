import { createWatcherTestContext } from "../tests/helpers/watcher_test_helper.ts";
import process from "node:process";

async function main() {
  const { helper, cleanup } = await createWatcherTestContext("dbg-watcher-");
  await helper.createWorkspaceStructure();

  const watcher = helper.createWatcher((event) => {
    console.log("EVENT:", event.path, "content:", event.content?.slice(0, 80));
  });

  helper.startWatcher(watcher);

  const p1 = await helper.writeFile("valid.md", "Valid file", 300);
  console.log("WROTE", p1);

  await new Promise((r) => setTimeout(r, 500));

  await helper.stopWatcher(watcher);
  await cleanup();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
