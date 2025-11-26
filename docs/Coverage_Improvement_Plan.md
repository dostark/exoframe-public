# Coverage Improvement Plan

## Current Status (as of 2025-11-25)

**Overall Coverage**: 82.9% line, 67.2% branch  
**Target**: All modules ≥70% branch coverage, ≥80% line coverage

## Modules Below Target

| Module | Branch % | Line % | Priority | Est. Effort |
|--------|----------|--------|----------|-------------|
| services/watcher.ts | 28.6% | 65.7% | **HIGH** | 3-4 hours |
| services/path_resolver.ts | 37.5% | 69.1% | **HIGH** | 2-3 hours |
| services/db.ts | 43.8% | 79.5% | **MEDIUM** | 2 hours |
| services/context_loader.ts | 55.9% | 82.2% | **MEDIUM** | 2 hours |
| services/agent_runner.ts | 60.0% | 80.7% | **MEDIUM** | 1-2 hours |
| config/service.ts | 0.0% | 61.1% | **HIGH** | 1-2 hours |
| cli/changeset_commands.ts | 63.6% | 89.0% | LOW | 1 hour |
| services/git_service.ts | 64.0% | 80.0% | LOW | 1 hour |
| services/tool_registry.ts | 65.4% | 79.7% | LOW | 1 hour |
| cli/daemon_commands.ts | 66.7% | 79.4% | LOW | 1 hour |

**Total Estimated Effort**: 15-20 hours

---

## Detailed Analysis by Module

### 1. services/watcher.ts (28.6% branch, 65.7% line) - HIGH PRIORITY

**Current Test Coverage**: 189 lines in watcher_test.ts + watcher_integration_test.ts

**Missing Coverage**:
- **Error Handling Paths** (~20% missing)
  - File system errors (permission denied, disk full)
  - Invalid file content (malformed requests)
  - Watcher abort/cleanup edge cases
  
- **Stability Check Branches** (~15% missing)
  - Files that never stabilize (continuous writes)
  - Files that disappear during stability check
  - Concurrent file modifications
  
- **Event Processing Branches** (~10% missing)
  - Different file event types (create, modify, remove, rename)
  - Debounce timer edge cases
  - Signal handling (SIGTERM, SIGINT)

**Improvement Actions**:
1. Add tests for file system errors:
   ```typescript
   it("should handle permission denied errors gracefully")
   it("should handle disk full errors")
   it("should log errors to activity journal")
   ```

2. Add stability check edge cases:
   ```typescript
   it("should timeout files that never stabilize")
   it("should handle files deleted during stability check")
   it("should handle rapid successive modifications")
   ```

3. Add event type coverage:
   ```typescript
   it("should handle file rename events")
   it("should handle directory creation")
   it("should ignore non-markdown files")
   ```

4. Add concurrent modification tests:
   ```typescript
   it("should handle multiple files changing simultaneously")
   it("should debounce multiple events for same file")
   ```

**Target**: 75% branch, 85% line coverage  
**Estimated Time**: 3-4 hours

---

### 2. services/path_resolver.ts (37.5% branch, 69.1% line) - HIGH PRIORITY

**Current Test Coverage**: 130 lines in path_resolver_test.ts

**Missing Coverage**:
- **Security Validation Branches** (~30% missing)
  - Path traversal attempts (../, ..\, etc.)
  - Symbolic link traversal
  - Absolute path attempts
  - Invalid alias attempts
  
- **Error Handling** (~15% missing)
  - Non-existent paths
  - Permission errors
  - Invalid characters in paths
  
- **Activity Logging** (~15% missing)
  - Security violations not logged
  - Performance metrics not tracked
  - Different violation types

**Improvement Actions**:
1. Add comprehensive security tests:
   ```typescript
   it("should reject path traversal with ../")
   it("should reject path traversal with .\\")
   it("should reject symbolic link escapes")
   it("should reject absolute paths")
   it("should reject paths without @ alias")
   it("should log all security violations")
   ```

2. Add error handling tests:
   ```typescript
   it("should handle non-existent paths")
   it("should handle permission denied")
   it("should handle invalid path characters")
   it("should provide helpful error messages")
   ```

3. Add alias resolution tests:
   ```typescript
   it("should resolve all valid aliases")
   it("should reject invalid aliases")
   it("should handle case-sensitive aliases")
   it("should handle nested paths correctly")
   ```

4. Add performance/logging tests:
   ```typescript
   it("should log resolution time")
   it("should log successful resolutions")
   it("should include trace_id in logs when provided")
   ```

**Target**: 75% branch, 85% line coverage  
**Estimated Time**: 2-3 hours

---

### 3. config/service.ts (0.0% branch, 61.1% line) - HIGH PRIORITY

**Current Test Coverage**: Only 87 lines in config_test.ts, mostly schema tests

**Missing Coverage**:
- **Error Handling** (~30% missing)
  - Invalid TOML syntax
  - Missing required fields
  - Invalid field types
  - Schema validation errors
  
- **Default Config Creation** (~20% missing)
  - File not found scenario
  - Default config generation
  - File write errors
  
- **Config Reloading** (~10% missing)
  - Checksum changes
  - Hot reload scenarios

**Improvement Actions**:
1. Add ConfigService-specific tests:
   ```typescript
   describe("ConfigService", () => {
     it("should handle missing config file")
     it("should create default config when missing")
     it("should validate config schema")
     it("should reject invalid TOML syntax")
     it("should reject invalid field types")
     it("should exit on validation errors")
     it("should compute checksums correctly")
     it("should handle file read errors")
     it("should handle file write errors")
   })
   ```

2. Add schema validation error tests:
   ```typescript
   it("should show clear error for missing system.version")
   it("should show clear error for invalid log_level")
   it("should show all validation errors at once")
   ```

3. Add edge case tests:
   ```typescript
   it("should handle empty config file")
   it("should handle config with extra fields")
   it("should handle config with comments")
   it("should handle unicode in paths")
   ```

**Target**: 70% branch, 85% line coverage  
**Estimated Time**: 1-2 hours

---

### 4. services/db.ts (43.8% branch, 79.5% line) - MEDIUM PRIORITY

**Current Test Coverage**: Indirect coverage through other tests, no dedicated db_test.ts

**Missing Coverage**:
- **Batched Write Error Handling** (~25% missing)
  - Transaction rollback scenarios
  - Database lock errors
  - Disk full during flush
  
- **Edge Cases** (~15% missing)
  - Writing during close
  - Multiple simultaneous flushes
  - Queue overflow scenarios
  
- **Activity Query Methods** (~10% missing)
  - Complex query filters
  - Empty result sets
  - Large result sets

**Improvement Actions**:
1. Create dedicated db_test.ts:
   ```typescript
   describe("DatabaseService", () => {
     it("should batch multiple log entries")
     it("should flush on max batch size")
     it("should flush on timer")
     it("should handle transaction errors")
     it("should rollback on error")
     it("should prevent logging during close")
   })
   ```

2. Add waitForFlush tests:
   ```typescript
   it("should wait for empty queue")
   it("should timeout if queue never empties")
   it("should handle concurrent flush calls")
   ```

3. Add query method tests:
   ```typescript
   it("should query by trace_id")
   it("should query by actor")
   it("should query by action_type")
   it("should handle empty results")
   it("should handle pagination")
   ```

**Target**: 70% branch, 85% line coverage  
**Estimated Time**: 2 hours

---

### 5. services/context_loader.ts (55.9% branch, 82.2% line) - MEDIUM PRIORITY

**Current Test Coverage**: Extensive tests in context_loader_test.ts

**Missing Coverage**:
- **Token Budget Edge Cases** (~20% missing)
  - Files exceeding remaining budget
  - Exact budget boundary cases
  - Priority-based file selection
  
- **File System Errors** (~15% missing)
  - Permission errors
  - Concurrent file modifications
  - Symbolic link handling
  
- **Cache Invalidation** (~10% missing)
  - Modified file detection
  - Cache miss scenarios
  - Stale cache entries

**Improvement Actions**:
1. Add token budget boundary tests:
   ```typescript
   it("should skip files when budget insufficient")
   it("should handle exact budget boundary")
   it("should prioritize files correctly")
   it("should warn about skipped files")
   ```

2. Add file system error tests:
   ```typescript
   it("should handle permission errors gracefully")
   it("should handle concurrent modifications")
   it("should follow symbolic links safely")
   it("should handle broken symbolic links")
   ```

3. Add cache tests:
   ```typescript
   it("should invalidate cache on file change")
   it("should use cache for unchanged files")
   it("should handle cache misses")
   it("should limit cache size")
   ```

**Target**: 70% branch, 88% line coverage  
**Estimated Time**: 2 hours

---

### 6. services/agent_runner.ts (60.0% branch, 80.7% line) - MEDIUM PRIORITY

**Current Test Coverage**: Tests in agent_runner_test.ts

**Missing Coverage**:
- **Error Recovery** (~20% missing)
  - API errors
  - Network timeouts
  - Malformed responses
  
- **Context Management** (~10% missing)
  - Context size limits
  - Context truncation
  - Context formatting
  
- **Stream Handling** (~10% missing)
  - Stream interruptions
  - Partial responses
  - Stream errors

**Improvement Actions**:
1. Add error handling tests:
   ```typescript
   it("should handle API errors gracefully")
   it("should retry on network timeouts")
   it("should handle malformed JSON responses")
   it("should log errors to activity journal")
   ```

2. Add context management tests:
   ```typescript
   it("should truncate oversized context")
   it("should preserve critical context")
   it("should format context correctly")
   it("should handle empty context")
   ```

3. Add streaming tests:
   ```typescript
   it("should handle stream interruptions")
   it("should process partial responses")
   it("should recover from stream errors")
   it("should buffer stream data correctly")
   ```

**Target**: 70% branch, 85% line coverage  
**Estimated Time**: 1-2 hours

---

## Implementation Phases

### Phase 1: Critical Infrastructure (Week 1)
**Focus**: High-priority modules affecting security and reliability

1. **config/service.ts** (1-2 hours)
   - Add ConfigService-specific test suite
   - Cover error handling and validation

2. **services/path_resolver.ts** (2-3 hours)
   - Add comprehensive security tests
   - Cover all path traversal scenarios

3. **services/db.ts** (2 hours)
   - Create dedicated test suite
   - Cover batched write edge cases

**Expected Improvement**: +8-10% overall coverage

### Phase 2: Core Services (Week 2)
**Focus**: Medium-priority services critical for operation

4. **services/watcher.ts** (3-4 hours)
   - Add error handling tests
   - Cover stability check edge cases

5. **services/context_loader.ts** (2 hours)
   - Add token budget boundary tests
   - Cover cache invalidation

6. **services/agent_runner.ts** (1-2 hours)
   - Add error recovery tests
   - Cover streaming edge cases

**Expected Improvement**: +6-8% overall coverage

### Phase 3: CLI Commands (Week 3)
**Focus**: Lower-priority CLI modules

7. **cli/changeset_commands.ts** (1 hour)
   - Add error handling for missing branches
   - Cover merge conflict scenarios

8. **cli/daemon_commands.ts** (1 hour)
   - Add signal handling tests
   - Cover edge cases in process management

9. **services/git_service.ts** (1 hour)
   - Add error handling for git operations
   - Cover merge conflict scenarios

10. **services/tool_registry.ts** (1 hour)
    - Add tool validation tests
    - Cover execution error scenarios

**Expected Improvement**: +4-5% overall coverage

---

## Success Criteria

### Minimum Targets (Required)
- ✅ All modules: ≥70% branch coverage
- ✅ All modules: ≥80% line coverage
- ✅ Overall: ≥75% branch, ≥85% line

### Stretch Goals (Optional)
- 🎯 Critical modules (security, data): ≥85% branch coverage
- 🎯 Overall: ≥80% branch, ≥90% line
- 🎯 Zero modules below 75% branch coverage

---

## Testing Best Practices

### 1. Focus on Branch Coverage
Branch coverage is more valuable than line coverage as it ensures all decision paths are tested.

### 2. Test Error Paths
Most missing coverage is in error handling. Explicitly test:
- Invalid inputs
- File system errors
- Network errors
- Edge cases

### 3. Use Descriptive Test Names
```typescript
// ❌ Bad
it("should work")

// ✅ Good
it("should reject path traversal attempts with ../")
```

### 4. Test One Behavior Per Test
```typescript
// ❌ Bad - tests multiple things
it("should handle errors", async () => {
  await testFileError();
  await testNetworkError();
  await testValidationError();
})

// ✅ Good - focused tests
it("should handle file not found errors")
it("should handle network timeout errors")
it("should handle validation errors")
```

### 5. Mock External Dependencies
```typescript
// Mock file system, network, database for isolated tests
const mockFs = {
  readFile: () => Promise.reject(new Error("Permission denied"))
};
```

---

## Tracking Progress

### Coverage Reports
Run coverage after each module improvement:
```bash
deno task test:coverage
deno task coverage
```

### HTML Report for Analysis
Use HTML report to identify exact uncovered lines:
```bash
deno task coverage:html
# Open coverage/html/index.html
```

### CI/CD Integration
Add coverage threshold enforcement:
```yaml
- name: Check coverage thresholds
  run: |
    deno task coverage:lcov
    # Fail if below 75% branch or 85% line
```

---

## Next Steps

1. **Prioritize** based on module criticality and effort
2. **Implement** Phase 1 (high-priority security/data modules)
3. **Review** coverage improvements after each phase
4. **Iterate** until all modules meet minimum targets
5. **Document** any intentionally untested code paths

**Estimated Total Time**: 15-20 hours across 3 weeks  
**Expected Final Coverage**: 75-80% branch, 88-92% line
