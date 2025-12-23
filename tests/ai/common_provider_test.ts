import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import { spy, stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { AuthenticationError, isRetryable, RateLimitError, withRetry } from "../../src/ai/providers/common.ts";

Deno.test("isRetryable - identifies retryable errors", () => {
  assertEquals(isRetryable(new RateLimitError("openai", "Too many requests")), true);
  assertEquals(isRetryable(new AuthenticationError("openai", "Invalid key")), false);
  assertEquals(isRetryable(new Error("Network error")), true);
});

Deno.test("withRetry - retries on retryable errors", async () => {
  let callCount = 0;
  const fn = async () => {
    callCount++;
    if (callCount < 3) {
      throw new RateLimitError("test", "Rate limit");
    }
    return "success";
  };

  const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
  assertEquals(result, "success");
  assertEquals(callCount, 3);
});

Deno.test("withRetry - fails after max retries", async () => {
  let callCount = 0;
  const fn = async () => {
    callCount++;
    throw new RateLimitError("test", "Rate limit");
  };

  await assertRejects(
    () => withRetry(fn, { maxRetries: 3, baseDelayMs: 1 }),
    RateLimitError,
    "Rate limit",
  );
  assertEquals(callCount, 3);
});

Deno.test("withRetry - does not retry on non-retryable errors", async () => {
  let callCount = 0;
  const fn = async () => {
    callCount++;
    throw new AuthenticationError("test", "Invalid key");
  };

  await assertRejects(
    () => withRetry(fn, { maxRetries: 3, baseDelayMs: 1 }),
    AuthenticationError,
    "Invalid key",
  );
  assertEquals(callCount, 1);
});
