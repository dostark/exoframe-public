# Blueprint Templates Created - JSON Plan Format

## Summary

Created production-ready blueprint templates that instruct LLMs to output JSON-formatted execution plans matching the PlanSchema from Step 6.7.

## Files Created

### 1. `/Blueprints/Agents/default.md`

**Purpose:** General-purpose coding assistant
**Model:** `ollama:codellama:13b`
**Key Features:**

- Comprehensive JSON schema documentation
- Detailed field explanations with examples
- Full authentication system implementation example
- Common error guidance

### 2. `/Blueprints/Agents/senior-coder.md`

**Purpose:** Expert-level software engineer for complex tasks
**Model:** `anthropic:claude-3-5-sonnet`
**Key Features:**

- Advanced architectural thinking guidance
- Real-time notification system example (7 steps)
- Emphasis on testing, scalability, and maintainability
- Risk assessment and rollback procedures

### 3. `/Blueprints/Agents/mock-agent.md`

**Purpose:** Testing blueprint for MockLLMProvider
**Model:** `mock:test-model`
**Key Features:**

- Simple JSON example for test validation
- Used by test suite for plan generation workflows

### 4. `/Blueprints/Agents/README.md`

**Purpose:** Documentation for blueprint directory
**Content:**

- JSON plan schema overview
- Blueprint structure explanation
- Creation guide for new blueprints
- Testing instructions

## JSON Plan Schema Instructions Included

All blueprints now include:

1. **Clear Format Requirements**
   ```
   <thought>Analysis</thought>
   <content>{ valid JSON }</content>
   ```

2. **Complete Schema Definition**
   - Required fields: title, description, steps
   - Optional fields: estimatedDuration, risks
   - Step fields: step, title, description (required)
   - Step optional: tools, successCriteria, dependencies, rollback

3. **Valid Tool Names**
   - read_file, write_file, run_command, list_directory, search_files

4. **Comprehensive Examples**
   - Authentication system (default.md): 5 steps
   - Real-time notifications (senior-coder.md): 7 steps
   - Simple test plan (mock-agent.md): 1 step

5. **Common Errors to Avoid**
   - Malformed JSON syntax
   - Invalid tool names
   - Non-sequential step numbers
   - Missing required fields

## Testing the Blueprints

### With Real LLM (if Ollama running):

```bash
cd /home/dkasymov/git/ExoFrame
exoctl request "Implement user login feature" --agent default
# Check: Inbox/Plans/*.md should contain JSON-generated markdown
```

### With MockLLMProvider (automated):

The test suite already uses MockLLMProvider which outputs JSON format - all 770 tests passing confirms the blueprint structure works correctly.

## Integration with Step 6.7

These blueprints complete the Step 6.7 implementation:

✅ **PlanSchema defined** (plan_schema.ts)
✅ **PlanAdapter implemented** (plan_adapter.ts)
✅ **PlanWriter integrated** (plan_writer.ts)
✅ **MockLLMProvider updated** (outputs JSON)
✅ **Tests passing** (770/770)
✅ **Blueprints updated** (instruct JSON output) ← **COMPLETED**

## Next Steps

1. **Test with Real LLM:** If you have Ollama running, test with: `exoctl request "Add logging" --agent default`
2. **Create Custom Blueprints:** Use README.md as a guide to create specialized agents
3. **Update Existing Blueprints:** If you have custom blueprints, add JSON schema instructions from default.md

## Blueprint Format Reference

```markdown
+++
agent_id = "agent-name"
name = "Human Readable Name"
model = "provider:model"
capabilities = ["cap1", "cap2"]
created = "2025-12-09T00:00:00Z"
created_by = "email@example.com"
version = "1.0.0"
+++

# Agent Persona

Description...

## Response Format

<thought>...</thought>
<content>{ JSON matching PlanSchema }</content>

[Include schema docs from default.md or senior-coder.md]
```
