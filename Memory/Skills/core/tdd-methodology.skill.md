---
id: "550e8400-e29b-41d4-a716-446655440001"
created_at: "2026-01-05T00:00:00.000Z"
source: "user"
scope: "global"
status: "active"
skill_id: "tdd-methodology"
name: "Test-Driven Development Methodology"
version: "1.0.0"
description: "Enforces the Red-Green-Refactor cycle for reliable, well-tested code"

triggers:
  keywords:
    - implement
    - feature
    - add
    - create
    - build
    - fix
    - bugfix
    - develop
  task_types:
    - feature
    - bugfix
    - refactor
    - implementation
  file_patterns:
    - "*.ts"
    - "*.js"
    - "*.py"
    - "*.go"
    - "*.rs"
  tags:
    - development
    - testing
    - tdd

constraints:
  - "Never write implementation code before tests"
  - "Run tests after each change"
  - "Keep tests focused on behavior, not implementation"
  - "One logical assertion per test"

output_requirements:
  - "Test file must exist before implementation"
  - "All tests must pass before completion"
  - "Test names describe expected behavior"

quality_criteria:
  - name: "Test Coverage"
    description: "New code has corresponding test coverage"
    weight: 40
  - name: "Test-First Evidence"
    description: "Tests were written before implementation"
    weight: 30
  - name: "Refactor Quality"
    description: "Code is clean and well-structured"
    weight: 30

compatible_with:
  agents:
    - "*"

usage_count: 0
---

# Test-Driven Development Methodology

You MUST follow the Red-Green-Refactor cycle for all code changes:

## Phase 1: Red (Write Failing Test)

1. **Understand the requirement** - What behavior needs to be implemented?
2. **Write a test** that describes the expected behavior
3. **Run the test** to confirm it fails (for the right reason)
4. **Name tests descriptively** - Test names should read like specifications

```typescript
// ✅ Good test name
Deno.test("calculateTotal returns sum of items when cart has products");

// ❌ Bad test name
Deno.test("test1");
```

## Phase 2: Green (Make It Pass)

1. **Write ONLY enough code** to make the test pass
2. **No additional features** or optimizations
3. **Focus on correctness**, not elegance
4. **Run tests frequently** - After every small change

```typescript
// ✅ Minimal implementation to pass
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ❌ Over-engineering before tests pass
function calculateTotal(items: Item[]): number {
  // Don't add caching, discounts, etc. until needed
}
```

## Phase 3: Refactor (Clean Up)

1. **Improve code structure** while tests stay green
2. **Extract helpers**, reduce duplication
3. **Improve naming** and organization
4. **Run tests after EVERY change**

## Key Rules

- **Never write production code without a failing test**
- **Keep tests fast** - Unit tests should run in milliseconds
- **Test behavior, not implementation** - Tests shouldn't break when refactoring
- **One logical assertion per test** - Makes failures clear
- **Test edge cases** - Empty inputs, nulls, boundaries

## Example Workflow

```
1. Write test: "should return empty array when no items match"
2. Run test → RED (function doesn't exist)
3. Create function with basic implementation
4. Run test → GREEN
5. Refactor: extract helper, improve naming
6. Run tests → Still GREEN
7. Move to next requirement
```
