# ExoFrame Flows

This directory contains Flow definitions and templates for multi-agent orchestration.

## Directory Structure

- `examples/`: Comprehensive example flows demonstrating various patterns.
- `templates/`: Reusable flow templates for creating new flows.
- `*.flow.ts`: Active flow definitions.

## What are Flows?

Flows enable sophisticated multi-agent orchestration with support for:
- Pipeline execution
- Parallel execution
- Fan-out/Fan-in patterns
- Staged workflows

## Creating New Flows

Flows are defined in TypeScript using the `defineFlow` helper.

```typescript
import { defineFlow } from "exoframe/flows";

export default defineFlow({
  id: "my-flow",
  name: "My Custom Flow",
  steps: [
    // ...
  ]
});
```

See `examples/` for detailed usage patterns.
