# Codebase Concerns

**Analysis Date:** 2026-02-22

## Debug Logging Left in Production Code

**Issue:** Multiple console.log statements in core SSR utilities that were left for development/debugging

**Files:**
- `src/ssr-plugin-utils.ts` lines 243, 292, 306
- Inline debug script at line 294

**Impact:**
- Performance degradation due to unnecessary console output
- Security/information leakage: mapping structure and HTML output logged to browser console in production
- Noise in logs making actual issues harder to spot

**Fix approach:**
- Remove all development `console.log()` calls from `renderComponentToSSR()` function
- Keep `console.warn()` for legitimate error cases (e.g., failed cleanup)
- Use proper logging framework if telemetry needed
- Remove debug `_import()` wrapper script that logs every import

## Type Safety Issues

**Issue:** Use of `any` type in type casting

**Files:** `src/pure.tsx` line 107

**Impact:**
- Loses type safety at critical point where DOM attributes are being copied
- Potential for incorrect attribute handling without TypeScript catching errors

**Fix approach:**
- Replace `as any as Attr[]` with proper type guard: `Array.from(oldScript.attributes)` which is correctly typed
- Or cast properly to `NamedNodeMap` then iterate

## Unhandled Error Cases in Client Module Resolution

**Issue:** `getClientModule()` function makes strong assumptions about module resolution that may fail

**Files:** `src/ssr-plugin-utils.ts` lines 231-248

**Impact:**
- Function fails silently or throws with unclear error if client environment not configured
- No fallback for production builds where client environment might not exist
- Blocks SSR rendering completely if module graph resolution fails

**Fix approach:**
- Add try-catch wrapper for graceful degradation
- Return null/empty mapping if client environment unavailable (e.g., in non-Vite environments)
- Add explicit check: `if (!viteServer.environments?.client)`

## Temporary File Cleanup Failure Suppression

**Issue:** Silent failure when temp file cleanup fails in `renderSSRLocalCommand()`

**Files:** `src/ssr-plugin.ts` lines 150-155

**Impact:**
- Temp files may accumulate if deletion fails (permission issues, file locks)
- Disk space leak over time during test runs
- Pattern only warns to console - doesn't retry or escalate

**Fix approach:**
- Implement retry logic with exponential backoff for cleanup
- Store list of failed cleanups and retry in beforeEach/afterEach hooks
- Consider using temp directory with automatic OS cleanup instead of manual file creation

## Missing Error Handling for Missing Components

**Issue:** Component resolution failures provide minimal context

**Files:** `src/ssr-plugin.ts` lines 63-66, `src/ssr-plugin-utils.ts` lines 143-147

**Impact:**
- Error message doesn't show available exports when component not found
- Developer must manually inspect module to understand why component failed
- Particularly problematic with local components where exports are dynamically generated

**Fix approach:**
- Enhance error message to list available exports from module
- Cache available exports to avoid repeated module inspection
- Add validation in AST walk phase to fail fast with better diagnostics

## Race Condition in Script Execution

**Issue:** Direct script element replacement in `setHTMLWithScripts()` may not execute scripts in order

**Files:** `src/pure.tsx` lines 98-117

**Impact:**
- Multiple scripts with dependencies may execute out of order
- Scripts relying on previously loaded scripts may fail silently
- No mechanism to wait for script completion before tests proceed

**Fix approach:**
- Implement sequential script execution with completion tracking
- Wait for each script to load/execute before moving to next
- Use `script.onload`/`script.onerror` callbacks to sequence execution

## Unsafe HTML String Manipulation

**Issue:** Manual string concatenation for HTML building in SSR response

**Files:** `src/ssr-plugin-utils.ts` lines 294, 306-307

**Impact:**
- Escape sequence handling unclear for complex HTML
- Template literal substitution with regex replace is fragile
- Manual HTML construction bypasses DOM API safety

**Fix approach:**
- Use template engine or DOM API for HTML construction
- Validate escaping of import paths in generated script
- Extract HTML building to separate function with unit tests

## Manifest Mapping Generation Incomplete

**Issue:** Manifest mapping at lines 266-289 may not capture all necessary segments

**Files:** `src/ssr-plugin-utils.ts` lines 249-307

**Impact:**
- Only maps test file imports and hardcoded handlers
- May miss indirect imports through transitive dependencies
- Handler segment IDs hardcoded (`_chk`, `_run`, `_task`, `_val`) - may change in Qwik versions

**Fix approach:**
- Walk entire module graph to collect all segments
- Make handler segment mapping configurable or dynamic
- Add validation that required segments exist before rendering

## Unused Hook Result Pattern

**Issue:** `renderHook()` uses unsafe optional chaining without proper error context

**Files:** `src/pure.tsx` lines 135-167

**Impact:**
- Throws generic "Hook result not available" without context on why hook failed
- No information about component mount failures or hook timing issues
- `renderPromise` may never resolve if component never renders

**Fix approach:**
- Add timeout mechanism for hook execution with better error message
- Return component render result alongside hook result for debugging
- Add hooks for tracking component lifecycle (mounted, rendered, error)

## Missing Prop Type Extraction Validation

**Issue:** Props extraction from JSX doesn't validate that complex expressions are valid JSON/serializable

**Files:** `src/ssr-plugin-utils.ts` lines 142-170

**Impact:**
- Arrow functions, object methods, or circular references extracted but won't serialize properly
- Error only occurs at runtime during command execution
- No feedback at transformation time about problematic props

**Fix approach:**
- Validate props during extraction phase (AST transformation time)
- Warn/error on function expressions, symbols, circular refs
- Pre-compute static props to catch issues earlier

## Fragile AST Traversal Pattern

**Issue:** Generic recursive traversal through all object properties is inefficient and risky

**Files:** `src/ssr-plugin-utils.ts` lines 65-82

**Impact:**
- May accidentally traverse unrelated object structures
- Performance impact on large ASTs due to exhaustive traversal
- No type safety - could access undefined properties

**Fix approach:**
- Use proper AST visitor pattern with explicit node type handling
- Cache visited nodes to avoid re-traversal
- Add early termination when target found

## Environment Variable Replacement Fragile

**Issue:** Manual env var injection into Vite config without checking if define already exists

**Files:** `src/ssr-plugin.ts` lines 53-58, `src/ssr-plugin.ts` lines 81-86

**Impact:**
- Overwrites existing define entries if env var name conflicts
- Only replaces in SSR context, not mirrored in client context
- Comment says "it does not replace env vars" but code tries to anyway - confusing intent

**Fix approach:**
- Check if key already exists before overwriting
- Merge with existing define rather than overwriting
- Document why this manual approach is needed vs Vite's normal env var handling

## Test Coverage Gaps

**Issue:** Limited test coverage for error paths and edge cases

**Files:**
- `src/pure.tsx`: No tests for error handling in render, unmount failures, or cleanup race conditions
- `src/ssr-plugin-utils.ts`: No tests for module resolution failures, manifest generation edge cases
- No tests for concurrent renderSSR calls or memory leaks

**Risk:**
- Cleanup failures, race conditions, and memory leaks in test infrastructure won't be caught
- Error handling untested, meaning production errors may occur in user test suites

**Priority:** High

## Dependency Version Constraints

**Issue:** Peer dependencies use wildcard versions that may break compatibility

**Files:** `package.json` lines 64-67

**Impact:**
- `@qwik.dev/core: "*"` accepts any version including breaking changes
- `vite: ">=6.3.5"` extremely permissive, any future version could break
- No lock on Vitest version differences

**Fix approach:**
- Specify minimum and maximum versions: `"@qwik.dev/core": ">=2.0.0 <3.0.0"`
- Add upper bound to Vite: `"vite": ">=6.3.5 <8.0.0"`
- Test against multiple peer dependency versions in CI

## Early Return on Missing Config

**Issue:** Commands return early if vite config.define is missing without error

**Files:** `src/ssr-plugin.ts` lines 54, 82

**Impact:**
- Silent failure: command appears to succeed but environment variables not injected
- No error thrown to user, test may pass but with incomplete environment

**Fix approach:**
- Throw explicit error if config.define is missing
- Initialize config.define if missing: `config.define = config.define || {}`
- Add validation in plugin setup phase

## Component Resolution Edge Cases

**Issue:** `resolveComponentPath()` falls back to naive path joining when oxc-resolver fails

**Files:** `src/ssr-plugin-utils.ts` lines 172-212

**Impact:**
- Fallback resolution may find wrong file if naming conflicts exist
- No distinction between "file not found" vs other resolution errors
- Warning logged but doesn't help user diagnose the issue

**Fix approach:**
- Create detailed error diagnostics showing what was searched for
- Include search paths in warning message
- Cache resolution results to catch systematic failures faster

## Inconsistent Error Messages

**Issue:** Error messages use different formats and context levels

**Files:** Various files

**Impact:**
- User confusion about which component failed and why
- Hard to grep/search for specific errors in large test suites
- Different error details in different code paths make diagnosis harder

**Fix approach:**
- Create standardized error wrapper with consistent format
- Include component name, file path, and available context in all errors
- Use error codes for machine-readable categorization

