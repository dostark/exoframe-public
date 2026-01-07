
## Phase 8: Third-Party LLM Providers ✅ COMPLETED

### Target Integration Models

For the initial integration, the following models have been selected as the primary targets for each provider:

1. **Anthropic: `claude-opus-4.5`**
   - **Why:** Tops agentic coding and reasoning benchmarks. It achieves near 0% code edit errors and supports 30+ hour autonomy, making it superior for complex Plan-Execute loops.
2. **OpenAI: `gpt-5.2-pro`**
   - **Why:** Optimized for professional agentic tasks. It excels in multi-step workflows, complex tool-chaining, and managing long-running agents.
3. **Google: `gemini-3-pro`**
   - **Why:** Combines a massive context window (1M+) with high performance (78% on SWE-Bench). It rivals GPT-5.2 in speed and cost for large-scale codebase ingestion.

---

### Step 8.1: Anthropic Provider ✅ COMPLETED

- **Dependencies:** Step 3.1 (IModelProvider interface)
- **Rollback:** Fall back to Ollama/Mock
- **Action:** Implement `AnthropicProvider` class
- **Location:** `src/ai/providers/anthropic_provider.ts`

```typescript
export class AnthropicProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://api.anthropic.com/v1/messages";

  constructor(options: { apiKey: string; model?: string; id?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "claude-opus-4.5";
    this.id = options.id ?? `anthropic-${this.model}`;
  }

  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.max_tokens ?? 4096,
        messages: [{ role: "user", content: prompt }],
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop_sequences: options?.stop,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ProviderError(this.id, error.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return data.content[0].text;
  }
}
```

**TDD Test Cases:**

- [x] `AnthropicProvider - initialization`: Verify ID is set to `anthropic-claude-opus-4.5` by default and can be overridden.
- [x] `AnthropicProvider - generate success`: Mock `fetch` to return `{"content": [{"text": "Hello"}]}` and verify `generate` returns `"Hello"`.
- [x] `AnthropicProvider - generate headers`: Verify `fetch` is called with `x-api-key` and `anthropic-version: 2023-06-01`.
- [x] `AnthropicProvider - generate error handling`: Mock `fetch` with 401 status and verify it throws `ModelProviderError`.
- [x] `AnthropicProvider - options mapping`: Verify `ModelOptions` (temperature, max_tokens, etc.) are correctly mapped to Anthropic's API format in the request body.
- [x] `AnthropicProvider - token usage reporting`: Verify token usage is logged via `EventLogger`.
- [x] `AnthropicProvider - retry on 429`: Verify it retries on rate limit errors with exponential backoff.

**Success Criteria:**

- [x] Sends correct headers (`x-api-key`, `anthropic-version`)
- [x] Formats messages array correctly
- [x] Handles rate limit (429) with retry
- [x] Reports token usage from response

---

### Step 8.2: OpenAI Provider ✅ COMPLETED

- **Dependencies:** Step 3.1 (IModelProvider interface)
- **Rollback:** Fall back to Ollama/Mock
- **Action:** Implement `OpenAIProvider` class
- **Location:** `src/ai/providers/openai_provider.ts`

```typescript
export class OpenAIProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: {
    apiKey: string;
    model?: string;
    baseUrl?: string; // For Azure OpenAI or proxies
    id?: string;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.2-pro";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1/chat/completions";
    this.id = options.id ?? `openai-${this.model}`;
  }

  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: options?.max_tokens,
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop: options?.stop,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ProviderError(this.id, error.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}
```

**TDD Test Cases:**

- [x] `OpenAIProvider - initialization`: Verify ID is set to `openai-gpt-5.2-pro` by default and can be overridden.
- [x] `OpenAIProvider - generate success`: Mock `fetch` to return `{"choices": [{"message": {"content": "Hello"}}], "usage": {"prompt_tokens": 5, "completion_tokens": 5}}` and verify `generate` returns `"Hello"`.
- [x] `OpenAIProvider - generate headers`: Verify `fetch` is called with `Authorization: Bearer test-key`.
- [x] `OpenAIProvider - custom baseUrl`: Verify `fetch` uses the provided `baseUrl` (e.g., for Azure).
- [x] `OpenAIProvider - generate error handling`: Mock `fetch` with 401 status and verify it throws `ModelProviderError`.
- [x] `OpenAIProvider - options mapping`: Verify `ModelOptions` (temperature, max_tokens, etc.) are correctly mapped to OpenAI's API format.
- [x] `OpenAIProvider - token usage reporting`: Verify token usage is logged via `EventLogger`.
- [x] `OpenAIProvider - retry on 429`: Verify it retries on rate limit errors with exponential backoff.

**Success Criteria:**

- [x] Sends correct Authorization header
- [x] Supports custom baseUrl for Azure OpenAI
- [x] Handles rate limit (429) with retry
- [x] Reports token usage from response

---

### Step 8.3: Google Provider (Gemini) ✅ COMPLETED

- **Dependencies:** Step 3.1 (IModelProvider interface)
- **Rollback:** Fall back to Ollama/Mock
- **Action:** Implement `GoogleProvider` class
- **Location:** `src/ai/providers/google_provider.ts`

```typescript
export class GoogleProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  constructor(options: { apiKey: string; model?: string; id?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gemini-3-pro";
    this.id = options.id ?? `google-${this.model}`;
  }

  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options?.max_tokens,
          temperature: options?.temperature,
          topP: options?.top_p,
          stopSequences: options?.stop,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ProviderError(this.id, error.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }
}
```

**TDD Test Cases:**

- [x] `GoogleProvider - initialization`: Verify ID is set to `google-gemini-3-pro` by default and can be overridden.
- [x] `GoogleProvider - generate success`: Mock `fetch` to return `{"candidates": [{"content": {"parts": [{"text": "Hello"}]}}], "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 5}}` and verify `generate` returns `"Hello"`.
- [x] `GoogleProvider - generate URL`: Verify `fetch` is called with the correct URL including the API key as a query parameter.
- [x] `GoogleProvider - generate error handling`: Mock `fetch` with 400 status and verify it throws `ModelProviderError`.
- [x] `GoogleProvider - options mapping`: Verify `ModelOptions` (temperature, max_tokens, etc.) are correctly mapped to Gemini's `generationConfig`.
- [x] `GoogleProvider - token usage reporting`: Verify token usage is logged via `EventLogger`.
- [x] `GoogleProvider - retry on 429`: Verify it retries on rate limit errors with exponential backoff.

**Success Criteria:**

- [x] Sends API key in URL query parameter
- [x] Formats contents/parts structure correctly
- [x] Handles rate limit (429) with retry
- [x] Reports token usage from response

---

### Step 8.4: Common Infrastructure ✅ COMPLETED

- **Dependencies:** Step 7.9 (Example Flows)
- **Rollback:** N/A
- **Action:** Implement shared error handling, retry logic, and token tracking
- **Location:** `src/ai/providers/common.ts`

#### Error Types

| Error Type            | Cause                 | Retry?                |
| --------------------- | --------------------- | --------------------- |
| `AuthenticationError` | Invalid API key       | No                    |
| `RateLimitError`      | Too many requests     | Yes (with backoff)    |
| `QuotaExceededError`  | Billing limit reached | No                    |
| `ModelNotFoundError`  | Invalid model name    | No                    |
| `ContextLengthError`  | Prompt too long       | No (truncate context) |
| `ConnectionError`     | Network failure       | Yes                   |
| `TimeoutError`        | Request timeout       | Yes                   |

#### Retry Logic

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number },
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < options.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      lastError = error;
      await sleep(options.baseDelayMs * Math.pow(2, i));
    }
  }
  throw lastError!;
}
```

#### Token Usage Tracking

```typescript
export interface GenerateResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}
```

**Success Criteria:**

- [x] Retry logic uses exponential backoff
- [x] Rate limit errors trigger retry
- [x] Auth/quota errors do not retry
- [x] Token usage logged to Activity Journal

---

### Step 8.5: Configuration & Factory Updates ✅ COMPLETED

- **Dependencies:** Steps 8.1–8.4
- **Rollback:** Revert config schema changes
- **Action:** Update config schema and ModelFactory
- **Location:** `src/config/schema.ts`, `src/ai/providers.ts`

#### Configuration Schema

```toml
[models.default]
provider = "anthropic"           # "anthropic" | "openai" | "google" | "ollama"
model = "claude-opus-4.5"

[models.fast]
provider = "openai"
model = "gpt-5.2-pro-mini"

[models.local]
provider = "ollama"
model = "llama3.2"

# API keys loaded from environment variables:
# ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY
```

#### Updated ModelFactory

```typescript
export class ModelFactory {
  static create(config: ModelConfig): IModelProvider {
    switch (config.provider) {
      case "mock":
        return new MockProvider(config.response ?? "Mock response");
      case "ollama":
        return new OllamaProvider({ model: config.model, baseUrl: config.baseUrl });
      case "anthropic":
        return new AnthropicProvider({
          apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? config.apiKey,
          model: config.model,
        });
      case "openai":
        return new OpenAIProvider({
          apiKey: Deno.env.get("OPENAI_API_KEY") ?? config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
        });
      case "google":
        return new GoogleProvider({
          apiKey: Deno.env.get("GOOGLE_API_KEY") ?? config.apiKey,
          model: config.model,
        });
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
}
```

**Success Criteria:**

- [x] Config schema validates provider/model combinations
- [x] ModelFactory creates correct provider from config
- [x] Missing API key throws `AuthenticationError`
- [x] Environment variables take precedence over config file

---

### Phase 8 Exit Criteria

- [x] `AnthropicProvider` implemented with `claude-opus-4.5` support
- [x] `OpenAIProvider` implemented with `gpt-5.2-pro` support (+ Azure support)
- [x] `GoogleProvider` implemented with `gemini-3-pro` and `gemini-3-flash`
- [x] Retry logic with exponential backoff for rate limits (429)
- [x] Token usage tracking logged to Activity Journal for all providers
- [x] Config schema supports multi-provider selection and API key environment variables
- [x] Integration tests for each provider (using mocked HTTP responses)
- [x] Documentation updated with provider setup and cost comparison instructions

---
