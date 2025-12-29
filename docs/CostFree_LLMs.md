# Cost-free / Low-cost LLM Providers (Step 10.1)

This document explains how ExoFrame supports low-cost or cost-friendly LLM options (e.g. `gpt-4.1`, `gpt-4o`, `gpt-5-mini`) and how to safely run manual integration tests.

## Overview

- `ModelFactory` provides convenience aliases for cost-friendly models (`gpt-4.1`, `gpt-4o`, `gpt-5-mini`) via a small `OpenAIShim` adapter.
- In CI (when `CI` environment variable is present), the factory returns `MockProvider` for these aliases unless you explicitly opt-in.
- To avoid accidental paid calls, the integration test is manual and opt-in.

## Configuration Example (exo.config)

```toml
[models.ci_safe]
provider = "mock"
model = "mock"

[models.local_cheaper]
provider = "openai"
model = "gpt-5-mini"
```

You can override selection with environment variables or by passing options directly to `ModelFactory`.

## Environment Variables

- `EXO_ENABLE_PAID_LLM=1` — **explicit opt-in** to allow contacting real, potentially paid LLM endpoints. Only set this when you intentionally want to run live calls (e.g., local manual test).
- `EXO_OPENAI_API_KEY` — API key used by the `OpenAIShim` when contacting OpenAI-compatible endpoints.

**Retry & Test-model configuration**

- `EXO_OPENAI_RETRY_MAX` — _(optional)_ Maximum retry attempts used by `OpenAIShim` when encountering retryable errors (e.g., HTTP 429, 503, or transient network errors). **Default:** `6`.
- `EXO_OPENAI_RETRY_BACKOFF_MS` — _(optional)_ Base backoff delay in milliseconds used by `OpenAIShim` for exponential backoff between retries. **Default:** `2000` (ms). Subsequent retries multiply this delay.
- `EXO_TEST_LLM_MODEL` — _(optional)_ Default model used when running live LLM tests. **Default:** `gpt-5-mini`. You can also set this to any OpenAI-style model id that your key can access (e.g., `gpt-3.5-turbo`, `gpt-4o`, or `gpt-4.1`).

Notes:

- CI systems should _not_ set `EXO_ENABLE_PAID_LLM`. When `CI` is set and `EXO_ENABLE_PAID_LLM !== '1'`, the `ModelFactory` will return a `MockProvider` for cost-friendly aliases.
- The retry env vars above are respected by `OpenAIShim`. Other providers (Anthropic, Google, Ollama) use their internal retry defaults (typically 5 retries and 2000ms base delay) and are not currently configurable via these OpenAI-specific env vars.

**Example: run manual tests with overrides**

```bash
export EXO_ENABLE_PAID_LLM=1
export EXO_OPENAI_API_KEY="sk-..."
export EXO_TEST_LLM_MODEL="gpt-5-mini"
export EXO_OPENAI_RETRY_MAX=6
export EXO_OPENAI_RETRY_BACKOFF_MS=2000

den o test tests/integration/19_llm_free_provider_test.ts --allow-env --allow-net --allow-read
```

Be cautious when setting `EXO_ENABLE_PAID_LLM` in CI: only enable it for trusted, protected runs and ensure secrets are stored safely.

## Running the Manual Integration Test

The integration test is intentionally ignored by default and performs safety checks before running:

1. Export the env vars locally (only when you intend to run live):

```bash
export EXO_ENABLE_PAID_LLM=1
export EXO_OPENAI_API_KEY="sk-..."
```

2. Run the single test directly (it will still be ignored by default; you can remove `ignore: true` or run specific file):

```bash
deno test tests/integration/llm_free_provider_test.ts --allow-env --allow-net --allow-read
```

3. If `EXO_ENABLE_PAID_LLM` is not set to `1`, or the API key is missing, the test will log a message and skip.

## Backwards Compatibility

- No changes were made to the existing fully-featured providers; the `OpenAIShim` is a convenience adapter only and does not replace `OpenAIProvider`.
- Existing code that consumes `IModelProvider` continues to work unchanged.

## Safety & CI

- CI systems should not set `EXO_ENABLE_PAID_LLM` (default behavior keeps tests mock-based and cost-free).
- If you need to run paid-model tests in CI intentionally, ensure you store encryption secrets and set `EXO_ENABLE_PAID_LLM=1` and the appropriate keys **only on a trusted branch or protected job**.

## Contact

If you need help configuring provider options or adding support for additional low-cost aliases, open an issue or reach out in the repository thread.
