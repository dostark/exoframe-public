import { withEnv } from "./env.ts";
import { assertEquals } from "https://deno.land/std@0.201.0/testing/asserts.ts";

Deno.test("withEnv sets and restores env vars (sync)", () => {
  const key = "EXO_TEST_WITHENV_SYNC";
  Deno.env.delete(key);
  withEnv({ [key]: "1" }, () => {
    assertEquals(Deno.env.get(key), "1");
  });
  assertEquals(Deno.env.get(key), undefined);
});

Deno.test("withEnv sets and restores env vars (async)", async () => {
  const key = "EXO_TEST_WITHENV_ASYNC";
  Deno.env.delete(key);
  await withEnv({ [key]: "2" }, async () => {
    assertEquals(Deno.env.get(key), "2");
    await Promise.resolve();
  });
  assertEquals(Deno.env.get(key), undefined);
});
