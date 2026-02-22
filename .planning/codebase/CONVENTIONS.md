# Coding Conventions

**Analysis Date:** 2026-02-22

## Naming Patterns

**Files:**
- Component files: PascalCase (e.g., `Counter.tsx`, `HelloWorld.tsx`)
- Utility/service files: camelCase with semantic naming (e.g., `ssr-plugin-utils.ts`, `ssr-plugin.ts`)
- Test files: `*.test.ts` or `*.test.tsx` suffix
- Files are hyphenated for multi-word names: `ssr-plugin.ts`, `ssr-plugin-utils.ts`

**Functions:**
- camelCase for all function names
- Async functions use async/await pattern
- Export functions explicitly: `export function name() {}`
- Type predicates use `is*` prefix (e.g., `isCallExpression`, `isJSXElement`)
- Callback functions use descriptive names (e.g., `walkForTransformation`, `cleanTestFile`)

**Variables:**
- camelCase for all variables and constants
- Module-level constants follow same naming: `const mountedContainers = new Set<HTMLElement>()`
- Avoid abbreviated names; use semantic naming
- Prefix boolean getters/checks with `has`, `is`, or `can`: `hasChanged()`, `isServer`, `canRender()`

**Types:**
- PascalCase for all type names: `RenderResult`, `RenderOptions`, `SSRRenderOptions`
- Type names suffixed with their kind where appropriate: `*Options`, `*Result`
- Interface names use descriptive purpose-based names: `RenderResult`, `BrowserCommand`
- Type aliases used for complex parameter tuples: `type ComponentFormat = BrowserCommand<[...]>`

## Code Style

**Formatting:**
- Tool: Biome 2.0.0
- Indentation: tabs (not spaces)
- Line endings: default (LF)
- Quote style: double quotes for JavaScript strings

**Configuration file:** `biome.json`
```json
{
	"formatter": {
		"enabled": true,
		"indentStyle": "tab"
	},
	"javascript": {
		"formatter": {
			"quoteStyle": "double"
		}
	}
}
```

**Linting:**
- Tool: Biome (recommended rules enabled)
- Assist enabled for auto-organization of imports
- Commands:
  - `pnpm lint` - check and fix with unsafe mode
  - `pnpm check.lint` - check only
  - `pnpm format` - format code

## Import Organization

**Order:**
1. Node.js built-in modules (`import { resolve } from "node:path"`)
2. Third-party packages (`import { component$ } from "@qwik.dev/core"`)
3. Type imports (`import type { JSXNode } from "@qwik.dev/core"`)
4. Local modules (`import { cleanup, render } from "./pure"`)
5. Type declarations merged with imports where applicable

**Example from codebase (`src/pure.tsx`):**
```typescript
import type { JSXOutput } from "@qwik.dev/core";
import { component$, render as qwikRender } from "@qwik.dev/core";
import { getQwikLoaderScript } from "@qwik.dev/core/server";
import type { Locator, LocatorSelectors } from "vitest/browser";
import { type PrettyDOMOptions, utils } from "vitest/browser";
```

**Path Aliases:**
- No path aliases configured; relative imports used throughout
- Relative imports follow `./` pattern for same directory and `../` for parent

## Error Handling

**Patterns:**
- Explicit error throwing with descriptive messages
- Error messages include context: `throw new Error('[vitest-browser-qwik]: ...')`
- Namespace errors with prefix for better debugging: `[vitest-browser-qwik]:`, `[oxc-resolver]:`
- Console.warn used for non-critical issues (fallback resolution, cleanup failures)
- No try-catch for unrecoverable errors; errors bubble up naturally

**Example from `src/ssr-plugin.ts`:**
```typescript
if (!Component) {
	throw new Error(
		`Component "${componentName}" not found in ${absoluteComponentPath}`,
	);
}
```

**Example from `src/ssr-plugin-utils.ts`:**
```typescript
if (result.error || !result.path) {
	console.warn(
		`[oxc-resolver] Could not resolve "${importPath}" from "${testFileId}": ${result.error || "No path resolved"}. Using fallback resolution.`,
	);
	return fallbackResolveComponentPath(importPath, testFileId);
}
```

## Logging

**Framework:** console methods (console.log, console.warn)

**Patterns:**
- Debug logging for development/troubleshooting: `console.log('message')`
- Warning logging for issues that are handled/mitigated: `console.warn('message')`
- Prefix logs with context for clarity: `console.log('Resolved client module', moduleId, resolved, module)`
- Component fixtures use console.log for SSR inspection: `console.log("Counter component rendering on server side")`

**Example from `src/ssr-plugin-utils.ts`:**
```typescript
console.log('Resolved client module', moduleId, resolved, module);
console.log(mapping);
console.log('FINAL HTML', html);
```

## Comments

**When to Comment:**
- Inline comments explain "why", not "what"
- Comments mark important logic boundaries or non-obvious decisions
- Comments clarify complex AST transformations
- Code is self-documenting; minimal comments used

**Example from `src/ssr-plugin-utils.ts`:**
```typescript
// temp file in the same folder to support relative imports
const tempFilePath = join(testFileDir, tempFileName);
```

**JSDoc/TSDoc:**
- Not extensively used
- Type annotations preferred over JSDoc
- Comments on interfaces describe purpose (optional)

**Example interface documentation:**
```typescript
export interface RenderResult extends LocatorSelectors {
	container: HTMLElement;
	baseElement: HTMLElement;
	// ... properties documented through types
}
```

## Function Design

**Size:**
- Functions kept focused on single responsibility
- Range from 10-50 lines for utility functions
- Helper functions like `setupContainer`, `csrQwikLoader` are 5-15 lines
- Transform handlers are 20-40 lines

**Parameters:**
- Destructuring used for option objects: `{ container, baseElement }: RenderOptions = {}`
- Defaults provided for optional parameters
- Type annotations required for all parameters

**Return Values:**
- Explicit return types declared
- Async functions return Promises: `Promise<RenderResult>`
- Functions either throw or return success values; no null returns for errors
- Destructuring used on return objects when extracting values

**Example from `src/pure.tsx`:**
```typescript
export async function render(
	ui: JSXOutput,
	{ container, baseElement }: RenderOptions = {},
): Promise<RenderResult> {
	csrQwikLoader();
	const setup = setupContainer(baseElement, container);
	await qwikRender(setup.container, ui);
	return createRenderResult(setup.container, setup.baseElement);
}
```

## Module Design

**Exports:**
- Explicit named exports preferred: `export function name() {}`
- Type exports use `export type { Type }`
- Re-exports from index files for public API: `export { cleanup, render, renderHook } from "./pure"`
- Module declares augmentations at end: `declare module "vitest/browser" {}`

**Example from `src/index.ts`:**
```typescript
export type { RenderResult, SSRRenderOptions } from "./pure";
export {
	cleanup,
	render,
	renderHook,
	renderServerHTML,
} from "./pure";
```

**Barrel Files:**
- `src/index.ts` serves as main entry point
- Exports public API functions: `render`, `renderHook`, `cleanup`, `renderServerHTML`
- Exports `renderSSR` as error-throwing placeholder (transformed by plugin)
- Re-exports types from `pure.tsx`

## TypeScript

**Configuration:**
- Target: `esnext`
- Module mode: `preserve`
- Module resolution: `bundler`
- JSX: `react-jsx` with `@qwik.dev/core` as import source
- Strict mode: enabled
- No unused locals allowed
- Inline type annotations only; declaration files generated separately

**Key TypeScript Features Used:**
- Generic types for flexible components: `component$<{ initialCount: number }>`
- Union types for variant handling: `node: JSXNode | undefined`
- Discriminated unions through type guards (is* functions)
- Type predicates for AST node checking: `export function isCallExpression(node: Node): node is CallExpression`
- Module augmentation for browser API extension

---

*Convention analysis: 2026-02-22*
