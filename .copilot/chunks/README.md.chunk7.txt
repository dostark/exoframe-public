### 5. Build Embeddings (Optional but Recommended)

Generate embeddings for semantic search:

```bash
# Mock embeddings (deterministic, no API calls, fast)
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock --dir .copilot/embeddings

# Or OpenAI embeddings (requires authentication, higher quality)
deno run --allow-read --allow-write --allow-net --allow-env scripts/build_agents_embeddings.ts --mode openai --dir .copilot/embeddings
```

**Mock mode** is recommended for most cases (deterministic, fast, no API costs).

### 6. Validate

Run validation to check schema compliance and safety:

```bash
deno run --allow-read scripts/validate_agents_docs.ts
```