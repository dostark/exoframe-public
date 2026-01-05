Every agent doc MUST start with YAML frontmatter:

```yaml
---
agent: claude  # or: copilot, openai, google, general
scope: dev     # or: ci, docs, test
title: "Your Title Here"
short_summary: "One-liner description (1-3 sentences max, <200 chars)"
version: "0.1"
topics: ["keyword1", "keyword2", "keyword3"]
---
```

**Field descriptions:**
- **`agent`**: Target agent type (`claude`, `copilot`, `openai`, `google`, `general`)
- **`scope`**: Context scope (`dev`, `ci`, `docs`, `test`)
- **`title`**: Human-readable title
- **`short_summary`**: Concise summary for quick injection (≤200 characters recommended)
- **`version`**: Semantic version (start with `"0.1"`)
- **`topics`**: Array of searchable keywords (helps with semantic retrieval)

### 3. Include Required Sections