# Testing Patterns

**Analysis Date:** 2026-02-22

## Test Framework

**Runner:**
- Vitest 4.0.0
- Browser mode via `@vitest/browser-playwright` 1.52.0 (Playwright)
- Dual config setup: browser tests and plugin tests

**Config Files:**
- `vitest.config.ts` - Main browser test configuration
- `vitest.ssr-plugin.config.ts` - Plugin-specific unit tests (Node.js environment)

**Main vitest.config.ts:**
```typescript
{
	plugins: [testSSR(), qwikVite({...})],
	test: {
		testTimeout: 2000,
		browser: {
			enabled: true,
			provider: playwright({
				launchOptions: { headless: false }
			}),
			instances: [{ browser: "chromium" }]
		},
		exclude: ["node_modules", "test/ssr-plugin.test.ts"]
	}
}
```

**Assertion Library:**
- Vitest built-in expect API
- Browser assertions via `expect.element()`
- DOM query methods via Vitest browser API: `getByText()`, `getByRole()`, etc.

**Run Commands:**
```bash
pnpm test                                    # Run all browser tests
pnpm test:ssr-plugin                        # Run plugin unit tests (Node.js)
pnpm snapshot                               # Update snapshots
```

## Test File Organization

**Location:**
- Browser tests: `test/` directory (co-located with fixtures)
- Plugin unit tests: `test/ssr-plugin.test.ts`
- Test fixtures: `test/fixtures/` directory

**Naming:**
- Browser tests: `*.test.tsx` (e.g., `render.test.tsx`, `ssr.test.tsx`)
- Plugin tests: `*.test.ts` (Node.js, no JSX)
- Fixtures: Component exports named as `PascalCase` (e.g., `Counter`, `HelloWorld`)

**File Structure:**
```
test/
├── render.test.tsx           # Client-side rendering tests
├── render-hook.test.tsx      # Hook rendering tests
├── ssr.test.tsx              # Server-side rendering tests
├── ssr-dom.test.tsx          # SSR with DOM assertions
├── ssr-plugin.test.ts        # Plugin transformation unit tests
└── fixtures/
    ├── Counter.tsx           # Counter component fixture
    ├── HelloWorld.tsx        # Simple component fixture
    └── useCounter.ts         # Hook fixture
```

## Test Structure

**Suite Organization:**
```typescript
// Plugin test structure (describe/it pattern)
describe("SSR Transform Plugin", () => {
	describe("filter configuration", () => {
		it("should have correct file extension filter", async () => {
			// test implementation
		});
	});
});

// Browser test structure (test function)
test("renders simple component", async () => {
	const screen = await render(<HelloWorld />);
	await expect.element(page.getByText("Hello World")).toBeVisible();
	expect(screen.container).toMatchSnapshot();
});
```

**Patterns:**

1. **Client-side rendering tests** (`render.test.tsx`):
   - Use `await render()` to render components in browser
   - Chain browser API assertions: `expect.element().toBeVisible()`
   - Use Vitest browser queries: `getByText()`, `getByRole()`
   - Test interactivity with `.click()` and state verification

2. **Server-side rendering tests** (`ssr.test.tsx`):
   - Use `await renderSSR()` to render on server
   - Verify HTML output with `.innerHTML` checks
   - Mix browser queries with HTML string verification
   - Test external variable references and component props

3. **SSR DOM assertion tests** (`ssr-dom.test.tsx`):
   - Use `await renderSSR()` result with browser assertions
   - Apply `expect.element()` on SSR-rendered content
   - Test query methods work with server-rendered HTML
   - Use `.debug()` for DOM inspection

4. **Hook rendering tests** (`render-hook.test.tsx`):
   - Use `await renderHook()` to test hook logic
   - Access result via destructuring: `const { result } = await renderHook(...)`
   - Call hook methods and verify state changes
   - Test local and imported hooks

5. **Plugin unit tests** (`ssr-plugin.test.ts`):
   - Load plugin dynamically: `const { testSSR } = await import("../src/ssr-plugin")`
   - Extract transform handler and filter
   - Test with code strings and file paths
   - Verify AST transformation output
   - Test edge cases and error handling

## Mocking

**Framework:** Not used in standard tests; direct imports preferred

**Patterns:**
- No explicit mocking library used
- Components imported and used directly
- Local component definitions inline in test files for testing
- Fixtures provide pre-built components for reuse

**Example fixture usage (from `test/fixtures/Counter.tsx`):**
```typescript
export const Counter = component$<{ initialCount: number }>(
	({ initialCount = 0 }) => {
		const count = useSignal(initialCount);
		return (
			<>
				<div>Count is {count.value}</div>
				<button type="button" onClick$={() => count.value++}>
					Increment
				</button>
			</>
		);
	},
);
```

**What to Mock:**
- Not applicable; direct component imports used
- Temporary files created in SSR plugin tests are cleaned up in finally blocks

**What NOT to Mock:**
- Qwik framework components and hooks
- Browser APIs (handled by Vitest browser mode)
- File system operations (used where needed with cleanup)

## Fixtures and Factories

**Test Data:**
- Component fixtures in `test/fixtures/` directory
- Reusable components: `Counter`, `HelloWorld`, `TaskCounter`, `InteractiveCounter`
- Hook fixtures: `useCounter` hook for testing
- Local component definitions inline in tests for specific test cases

**Fixture Pattern from `test/fixtures/Counter.tsx`:**
```typescript
export const Counter = component$<{ initialCount: number }>(
	({ initialCount = 0 }) => {
		const count = useSignal(initialCount);
		// ... implementation
	},
);
```

**Local Inline Components** (from `test/render.test.tsx`):
```typescript
const InteractiveCounter = component$<{ initialCount: number }>(
	({ initialCount = 0 }) => {
		const count = useSignal(initialCount);
		// ... inline definition for test
	},
);

test("renders local counter", async () => {
	const screen = await render(<InteractiveCounter initialCount={1} />);
	// ... assertions
});
```

**Location:**
- `test/fixtures/` - Shared reusable components
- Inline definitions - Test-specific components

## Coverage

**Requirements:** No coverage target enforced

**View Coverage:**
- Coverage not actively tracked
- Integration tests primary focus
- Plugin unit tests verify transformation logic

## Test Types

**Unit Tests:**
- Plugin transformation tests (`ssr-plugin.test.ts`)
- Filter configuration verification
- AST transformation output validation
- Edge case handling (malformed code, missing imports, etc.)
- Scope: ~700 lines of focused unit tests

**Integration Tests:**
- Browser rendering tests (`render.test.tsx`, `render-hook.test.tsx`)
- Server-side rendering tests (`ssr.test.tsx`)
- DOM assertion tests (`ssr-dom.test.tsx`)
- Real component rendering with Qwik framework
- Real browser interaction via Playwright

**E2E Tests:**
- Not separated as distinct; integration tests perform E2E validation
- Browser mode enables real browser testing via Playwright

## Common Patterns

**Async Testing:**
```typescript
// Pattern 1: Render and wait for visibility
test("renders counter", async () => {
	const screen = await render(<Counter initialCount={1} />);
	await expect.element(screen.getByText("Count is 1")).toBeVisible();
});

// Pattern 2: Hook rendering
test("should increment counter", async () => {
	const { result } = await renderHook(() =>
		useCounter({ countSignal: useSignal(0) }),
	);
	await result.increment$();
	expect(result.count.value).toBe(1);
});

// Pattern 3: SSR rendering
test("SSR renders Counter correctly", async () => {
	const screen = await renderSSR(<Counter initialCount={5} />);
	expect(screen.container.innerHTML).toContain("Count is");
});
```

**Error Testing:**
```typescript
// No explicit error testing pattern in codebase;
// Error scenarios handled in plugin unit tests
it("should handle missing component imports gracefully", async () => {
	const { handler } = await getTransform();
	const code = `
		test("example", () => {
			renderSSR(<SomeComponent />);
		});
	`;
	const result = await handler(code, "/test/missing-import.test.tsx");
	expect(result).toBeNull(); // Null return for no transformation needed
});
```

**DOM Queries:**
```typescript
// Query patterns from Vitest browser API
screen.getByText("Hello World")          // Text matching
screen.getByRole("button")               // ARIA role matching
screen.getByRole("button", { name: "Increment" })  // With attributes
screen.getByText(/Count is/)             // Regex matching
```

**Interaction Testing:**
```typescript
test("renders counter", async () => {
	const screen = await render(<Counter initialCount={1} />);
	await screen.getByRole("button", { name: "Increment" }).click();
	await expect.element(screen.getByText("Count is 2")).toBeVisible();
});
```

**Snapshot Testing:**
```typescript
test("renders simple component", async () => {
	const screen = await render(<HelloWorld />);
	expect(screen.container).toMatchSnapshot();
});
```

**Plugin Transformation Assertions:**
```typescript
const result = await handler(code, "/test/transform.test.tsx");
expect(result).not.toBeNull();
expect(result!.code).toContain("commands.renderSSR(");
expect(result!.code).toContain('"Counter"');
expect(result!.code).toContain('"initialCount": 5');
```

## Test Configuration Details

**Browser Configuration:**
- Provider: Playwright
- Browser: Chromium
- Headless: false (shows browser window during test)
- Test timeout: 2000ms

**Plugin Test Configuration:**
- Environment: Node.js (not browser)
- Include: `test/**/ssr-plugin.test.ts` only
- Exclude: Browser tests (`ssr.test.tsx`, `render.test.tsx`, `render-hook.test.tsx`)

**TypeScript in Tests:**
- Full TypeScript support (files compiled via tsconfig.json)
- Strict type checking enabled
- JSX support for component rendering

## Test Data Setup/Teardown

**Setup:**
- `beforeEach` hook in `src/index.ts` automatically calls `cleanup()` before each test
- Vitest browser mode initializes fresh context per test

**Teardown:**
- Automatic cleanup via `beforeEach` hook
- Manual cleanup available via `unmount()` on render results
- Plugin tests create/destroy temporary files in try/finally blocks

**Example cleanup pattern (from `src/ssr-plugin.ts`):**
```typescript
try {
	writeFileSync(tempFilePath, cleanedContent, "utf8");
	const componentModule = await viteServer.ssrLoadModule(tempFilePath);
	// ... use module
} finally {
	try {
		unlinkSync(tempFilePath);
	} catch (cleanupError) {
		console.warn("Failed to clean up temporary file:", cleanupError);
	}
}
```

---

*Testing analysis: 2026-02-22*
