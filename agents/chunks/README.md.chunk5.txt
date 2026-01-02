Structure your document with these sections:

#### Key Points (Required)
Bullet list of 3-5 critical takeaways:
```markdown
Key points
- Use `initTestDbService()` for database tests
- Follow TDD workflow: tests first, implementation second
- Clean up resources in finally blocks
```

#### Canonical Prompt (Required)
Example system prompt showing ideal usage:
```markdown
Canonical prompt (short):
"You are a test-writing assistant for ExoFrame. List failing test names and assertions first, using `initTestDbService()` or `createCliTestContext()` where appropriate."
```