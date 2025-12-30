```bash
# Rebuild manifest.json and chunks/
deno run --allow-read --allow-write scripts/build_agents_index.ts
```

To verify the manifest is fresh (useful for CI):

```bash
# Verifies the generated manifest is consistent with current agent docs
deno run --allow-read scripts/verify_manifest_fresh.ts
```

Building embeddings
-------------------
Precompute and import embeddings with `scripts/build_agents_embeddings.ts`. For precomputed embeddings, drop JSON files that follow the example template into `agents/embeddings/` and then run:

```bash
# Build embeddings from a directory of precomputed JSON files
deno run --allow-read --allow-write --unstable scripts/build_agents_embeddings.ts --mode precomputed --dir agents/embeddings
```