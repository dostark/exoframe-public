#### Examples (Required)
2-3 example prompts with expected responses:
```markdown
Examples
- Example prompt: "Write tests that verify PlanWriter handles missing files and empty JSON. Use `initTestDbService()` and ensure cleanup is called."
- Example prompt: "Propose 3 failing unit tests showing how ConfigLoader handles malformed TOML."
```

#### Do / Don't (Recommended)
Guidance on safe/unsafe patterns:
```markdown
Do / Don't
- ✅ Do follow TDD and verify Success Criteria
- ✅ Do add module-level documentation
- ❌ Don't proceed without Implementation Plan step
```

### 4. Regenerate Manifest

After creating or updating a doc:

```bash
deno run --allow-read --allow-write scripts/build_agents_index.ts
```

This updates `.copilot/manifest.json` and regenerates `.copilot/chunks/*.txt` files.