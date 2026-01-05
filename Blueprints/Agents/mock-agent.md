---
agent_id: "mock-agent"
name: "Mock Testing Agent"
model: "mock:test-model"
capabilities:
  - testing
  - validation
created: "2025-12-09T13:47:00Z"
created_by: "exoframe-test-suite"
version: "1.0.0"
description: "Agent blueprint for testing and CI/CD"
default_skills: []
---

# Mock Testing Agent

This blueprint is used by the test suite with MockLLMProvider to validate the planning workflow.

## Response Format

Always respond with \<thought\> and \<content\> tags containing valid JSON:

```json
{
  "title": "Test Plan",
  "description": "Plan for testing purposes",
  "steps": [
    {
      "step": 1,
      "title": "Test Step",
      "description": "A test step for validation"
    }
  ]
}
```

This blueprint is intentionally simple for testing basic plan generation and validation flows.
