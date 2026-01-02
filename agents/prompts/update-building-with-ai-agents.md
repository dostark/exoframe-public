---
agent: claude
scope: docs
title: "Update Building with AI Agents Documentation"
short_summary: "Prompt template for adding new patterns and stories to Building_with_AI_Agents.md"
version: "0.1"
topics: ["documentation", "meta", "patterns", "field-guide"]
---

# Update Building with AI Agents Documentation

## Prompt Template

```
Add new content to docs/Building_with_AI_Agents.md documenting recent work.

Requirements:
1. Follow proper Part numbering (next available: Part [X])
2. Maintain entertaining, narrative style (personal stories, "wake-up calls", irony)
3. Review ALL chat history since last doc update for patterns
4. Read ALL detailed commit messages since last update
5. Follow instructions in agents/docs/documentation.md

Content structure:
- Part title with thematic name (e.g., "The Self-Documenting Agent System")
- Personal narrative opening (the problem, the wake-up call)
- Technical details with code examples
- Before/After comparisons
- Pattern recognition
- Meta-insights and philosophical wins

Update context:
- Last updated: [git log --oneline --all -- docs/Building_with_AI_Agents.md | head -1]
- Commits since then: [git log LAST_HASH..HEAD --oneline]
- Focus areas: [agents/ enhancements / CI/CD / testing / etc.]

After writing:
1. Rebuild agents infrastructure (build_agents_index.ts, build_agents_embeddings.ts, validate)
2. Update Essential Patterns table with new commands
3. Update Question Templates with new prompt examples
```

## Example Usage

**User:**
```
Add new content to docs/Building_with_AI_Agents.md documenting recent work.

Requirements:
1. Follow proper Part numbering (next available: Part XVII)
2. Maintain entertaining, narrative style (personal stories, "wake-up calls", irony)
3. Review ALL chat history since last doc update for patterns
4. Read ALL detailed commit messages since last update
5. Follow instructions in agents/docs/documentation.md

Content structure:
- Part title: "The Self-Documenting Agent System (January 2026)"
- Opening: The bootstrap problem (not using agents/ to enhance agents/)
- Technical details: Step 10.5 enhancements (claude.md, claude-rag.md, prompts/, cross-reference.md)
- Before/After: No templates → 8 copy-paste ready prompts
- Patterns: Documentation as a product, dual-interface system
- Meta-insight: Using agents/ to improve agents/ (the irony)

Update context:
- Last updated: b849adf (feat(ci): implement unified CI pipeline...)
- Commits since: 8cea321..HEAD (9 commits covering agents/ enhancements and CI/CD)
- Focus areas: agents/ prompts, RAG workflow, git hooks, multi-platform builds

After writing:
1. Rebuild agents infrastructure
2. Add new patterns to Essential Patterns table:
   - RAG Context Injection
   - Inspect Embeddings
   - Agent Prompts Library
   - Git Hooks Setup
   - Local CI Gate
3. Update Question Templates:
   - For Agent Documentation Updates
   - For RAG Context Injection
   - For CI/CD and Quality Gates
   - For Commit Messages
```

**Expected Response:**

Claude should:

1. **Research phase**:
   ```bash
   # Find last update
   git log --oneline --all -- docs/Building_with_AI_Agents.md | head -1

   # Get commits since then
   git log b849adf..HEAD --oneline

   # Read detailed commit messages
   git log b849adf..HEAD --format="%H" | while read hash; do git show --stat $hash; done
   ```

2. **Content analysis**:
   - Review chat history for user's prompts and agent's responses
   - Identify patterns (e.g., "not following agents/ folder instructions")
   - Extract "wake-up call" moments (e.g., being called out for inconsistency)
   - Note technical implementations (prompt templates, RAG guide, git hooks)

3. **Write new Part(s)**:
   ```markdown
   ## Part XVII: The Self-Documenting Agent System (January 2026)

   ### The Bootstrap Problem Revisited

   Remember Part IX where we created the `agents/` directory? We had documentation
   _for_ agents, but we were still treating it like regular docs—write it, forget it,
   hope the AI reads it someday.

   **The Wake-Up Call**:

   \```
   Me: [implements Step 10.5 enhancements to agents/ folder]
   Me: [finishes implementation]
   Me: [about to commit]
   You: "You did not follow instructions in agents/ folder. Why?"
   Me: ... 😳
   \```

   I had just enhanced the agents/ system to make it MORE useful... without using
   the agents/ system to guide that enhancement. Peak irony.

   [... continues with technical details, examples, before/after, patterns ...]
   ```

4. **Update reference sections**:
   - Add rows to Essential Patterns table
   - Add new question templates
   - Maintain formatting consistency

5. **Rebuild infrastructure**:
   ```bash
   deno run --allow-read --allow-write scripts/build_agents_index.ts
   deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
   deno run --allow-read scripts/validate_agents_docs.ts
   ```

## Style Guidelines

### ✅ Do

**Personal and Entertaining**:
```markdown
**The Wake-Up Call**:
I had just enhanced the agents/ system to make it MORE useful... without using
the agents/ system to guide that enhancement. Peak irony.
```

**Before/After with Concrete Examples**:
```markdown
**Before Step 10.5**:
- Agent docs existed but were hard to discover
- No clear workflow for using RAG
- Inconsistent prompting patterns

**After Step 10.5**:
- 19 agent docs (up from 11)
- 8 copy-paste prompt templates
- Cross-reference map for navigation
```

**Technical Details with Code**:
```markdown
**The Rebuild Workflow**:
\```bash
# After any agents/ changes:
deno run --allow-read --allow-write scripts/build_agents_index.ts
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
deno run --allow-read scripts/validate_agents_docs.ts
\```
```

**Meta-Insights**:
```markdown
### The Meta-Learning: Documentation Is a Product

Treating documentation like code revolutionized quality:
- Schema validation (YAML frontmatter with Zod)
- Automated testing (12 tests for content structure)
- CI gates (can't merge broken docs)
```

### ❌ Don't

**Dry, Technical Documentation Style**:
```markdown
## agents/ Folder Enhancements

The agents/ folder was updated with the following improvements:
- Added claude.md version 0.2
- Created claude-rag.md with RAG workflow
- Added 8 prompt templates
```

**Missing Context or "Why"**:
```markdown
We added prompt templates to agents/prompts/. These include TDD workflow,
refactoring, and debugging templates.
```
(Missing: Why were these needed? What problem did they solve? What was the wake-up call?)

**No Before/After Comparison**:
```markdown
The agents/ system now has cross-reference navigation.
```
(Missing: What was the pain before? How much better is it after? Concrete metrics?)

**Generic Advice**:
```markdown
Good documentation is important for project success.
```
(Missing: ExoFrame-specific examples, personal stories, actual impact)

## Key Patterns to Capture

When updating Building_with_AI_Agents.md, look for these patterns in recent work:

1. **Ironic Moments**: System designed to solve X fails at X (e.g., not using agents/ to improve agents/)
2. **Wake-Up Calls**: Specific prompts or errors that triggered insights
3. **Before/After**: Quantifiable improvements (11→19 docs, 229→131 chars, 0→8 templates)
4. **The Human Element**: What you (the human) forgot, learned, or discovered
5. **Tooling Evolution**: New scripts, commands, or workflows that emerged
6. **Meta-Patterns**: Patterns about patterns (e.g., "Documentation Is a Product")
7. **Philosophical Wins**: Broader insights about AI-human collaboration
8. **Concrete Examples**: Actual commands, code snippets, file paths, test counts
9. **Validation Stories**: How testing/CI caught problems before they shipped
10. **Playbook Updates**: New question templates, essential patterns, quick reference items

## Integration with Other Prompts

This prompt often follows:
- **implementation-plan-driven.md** — After completing a major Implementation Plan step
- **commit-message.md** — After creating detailed commits with rich context
- **refactoring-with-thinking.md** — After complex multi-step refactoring work

This prompt often precedes:
- **commit-message.md** — Commit the documentation update itself
- **rag-context-injection.md** — Use updated docs for future context injection

## Success Criteria

A good Building_with_AI_Agents.md update includes:

- ✅ Proper Part numbering (sequential, no gaps)
- ✅ Entertaining narrative style (personal, humorous, insightful)
- ✅ Technical accuracy (correct commands, file paths, test counts)
- ✅ Before/After comparisons (with metrics)
- ✅ Code examples (bash commands, file snippets, prompts)
- ✅ Pattern recognition (what's reusable beyond this specific case)
- ✅ Meta-insights (philosophical wins about AI-human collaboration)
- ✅ Updated reference sections (Essential Patterns, Question Templates)
- ✅ Rebuilt agents infrastructure (manifest, chunks, embeddings validated)
- ✅ Links to actual files (using relative paths like `../agents/prompts/`)

## See Also

- [agents/docs/documentation.md](../docs/documentation.md) — Documentation guidelines
- [implementation-plan-driven.md](implementation-plan-driven.md) — Working from Implementation Plan
- [commit-message.md](commit-message.md) — Creating detailed commits
- [Building_with_AI_Agents.md](../../docs/Building_with_AI_Agents.md) — The actual document
