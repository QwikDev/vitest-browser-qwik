# Codebase Structure

**Analysis Date:** 2026-02-22

## Directory Layout

```
vitest-browser-qwik/
├── src/                    # Main library source code
│   ├── index.ts            # Public API entry point with page extensions
│   ├── pure.tsx            # Core rendering functions (render, renderSSR, renderHook)
│   ├── ssr-plugin.ts       # Vite plugin for transforming renderSSR calls
│   └── ssr-plugin-utils.ts # AST utilities and component rendering helpers
├── test/                   # Test suite demonstrating library usage
│   ├── fixtures/           # Test component fixtures
│   │   ├── Counter.tsx     # Component with state and effects
│   │   ├── HelloWorld.tsx  # Simple component fixture
│   │   └── useCounter.ts   # Custom hook fixture
│   ├── __snapshots__/      # Vitest snapshot files (generated)
│   ├── render.test.tsx     # CSR (Client-Side Rendering) tests
│   ├── ssr.test.tsx        # SSR (Server-Side Rendering) tests
│   ├── ssr-dom.test.tsx    # SSR DOM-specific tests
│   ├── ssr-plugin.test.ts  # SSR plugin unit tests
│   └── render-hook.test.tsx # Hook testing tests
├── dist/                   # Compiled output (generated)
├── .planning/              # GSD planning documents
│   └── codebase/           # Analysis documents
├── .github/                # GitHub workflows
├── .vscode/                # VS Code settings
├── vitest.config.ts        # Main Vitest configuration (browser mode)
├── vitest.ssr-plugin.config.ts # Separate config for plugin unit tests
├── tsconfig.json           # TypeScript configuration
├── tsdown.config.ts        # Build tool configuration
├── biome.json              # Code formatter/linter configuration
├── package.json            # Package metadata and dependencies
└── README.md               # Usage documentation
```

## Directory Purposes

**src/:**
- Purpose: Library source code, exported as published package
- Contains: TypeScript/TSX implementation files
- Key files: `index.ts` (entry point), `ssr-plugin.ts` (Vite plugin)
- Published: Yes - files in `dist/` generated from src via tsdown build

**src/** subdirectories:
- No subdirectories - all source files at root level
- Promotes easy navigation for small API surface
- Clear separation between core logic (`pure.tsx`) and infrastructure (`ssr-plugin.ts`)

**test/:**
- Purpose: Test suite using Vitest browser mode
- Contains: Integration tests for CSR, SSR, hooks, and plugin
- Key files: `*.test.tsx` files are entry points for test runner
- Run command: `pnpm test` executes vitest.config.ts tests

**test/fixtures/:**
- Purpose: Sample Qwik components used across tests
- Contains: Components and hooks for testing (shared across multiple test files)
- Committed: Yes - permanent test utilities
- Usage: Imported by multiple test files to test library functionality

**test/__snapshots__/:**
- Purpose: Vitest snapshot storage for visual regression testing
- Contains: `.snap` files (auto-generated, human-readable diffs)
- Generated: Yes - created by Vitest with `-u` flag
- Committed: Yes - snapshots checked into git for diff tracking

**dist/:**
- Purpose: Compiled output ready for npm distribution
- Contains: `.js` (CommonJS), `.d.ts` (TypeScript types), `.mjs` files
- Generated: Yes - via `pnpm build` using tsdown
- Committed: No - generated during publish workflow

**.planning/codebase/:**
- Purpose: Analysis documents for code navigation and future planning
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md
- Generated: Via `/gsd:map-codebase` command
- Committed: Yes - guides future development phases

## Key File Locations

**Entry Points:**

- `src/index.ts`: Main library export
  - Re-exports from `src/pure.tsx` (render, renderSSR, renderHook, cleanup)
  - Extends Vitest page object with render functions
  - Sets up automatic beforeEach cleanup

- `vitest.config.ts`: Test execution entry point
  - Enables browser mode with Playwright
  - Includes testSSR() plugin
  - Excludes ssr-plugin unit tests

- `vitest.ssr-plugin.config.ts`: Plugin unit test entry point
  - Runs in Node.js environment (not browser)
  - Only includes `test/ssr-plugin.test.ts`

**Configuration:**

- `tsconfig.json`: TypeScript compiler options
  - Strict mode enabled
  - JSX preset: react-jsx
  - ES2020 module target

- `tsdown.config.ts`: Build configuration
  - Entry points: src/index.ts, src/pure.tsx, src/ssr-plugin.ts
  - Output: dist/ directory with .js, .d.ts, .mjs files
  - Rollup-based bundler

- `biome.json`: Code formatting and linting
  - Enforces consistent style
  - Line width: 80 characters
  - Indentation: 2 spaces

- `package.json`: Package metadata
  - Name: `vitest-browser-qwik`
  - Main exports: dist/index.js, dist/pure.js, dist/ssr-plugin.js
  - Type: module (ESM)

**Core Logic:**

- `src/pure.tsx`: CSR rendering functions
  - `render()` - renders Qwik component in browser
  - `renderHook()` - renders hook in isolated component
  - `renderServerHTML()` - renders pre-generated HTML
  - `cleanup()` - removes all mounted containers
  - Helper: `csrQwikLoader()` injects Qwik loader script
  - Helper: `setupContainer()` creates or validates container element
  - Helper: `createRenderResult()` builds RenderResult object

- `src/ssr-plugin.ts`: SSR transformation and commands
  - `testSSR()` - Vite plugin factory function
  - `renderSSRCommand` - Browser command for external components
  - `renderSSRLocalCommand` - Browser command for local components
  - Plugin hooks: `transform` (code transformation), `configResolved` (register commands)

- `src/ssr-plugin-utils.ts`: AST and rendering utilities
  - Node type guards: `isImportDeclaration()`, `isJSXElement()`, etc.
  - Traversal: `traverseChildren()` recursive walker
  - Detection: `hasRenderSSRCallInAST()` scans for renderSSR usage
  - Extraction: `extractPropsFromJSX()` parses JSX props
  - Resolution: `resolveComponentPath()` and `fallbackResolveComponentPath()`
  - Rendering: `renderComponentToSSR()` executes Qwik SSR with manifest

**Testing:**

- `test/render.test.tsx`: CSR rendering tests
  - Simple component render
  - Interactive component with state updates
  - Local component definitions inline

- `test/ssr.test.tsx`: SSR rendering tests
  - External component import and render
  - Local component definitions and render
  - External variable references
  - Task hooks execution

- `test/render-hook.test.tsx`: Hook testing
  - External hook from fixtures
  - Local hook definitions
  - Hook state and QRL function calls

- `test/ssr-plugin.test.ts`: Plugin unit tests
  - AST transformation logic
  - Component resolution
  - Prop extraction
  - Runs in Node.js, not browser

- `test/ssr-dom.test.tsx`: DOM-specific SSR tests
  - Additional DOM rendering scenarios

**Fixtures:**

- `test/fixtures/Counter.tsx`: Stateful component with side effects
  - Exported variants: Counter, InteractiveCounter, TaskCounter
  - Demonstrates useSignal, useTask$ patterns

- `test/fixtures/HelloWorld.tsx`: Minimal component
  - Simple rendering without state

- `test/fixtures/useCounter.ts`: Custom hook
  - Demonstrates $ function and QRL type
  - Returns Signal and QRL wrapped function

## Naming Conventions

**Files:**

- `.ts` - TypeScript implementation files
- `.tsx` - TypeScript with JSX (Qwik components)
- `.test.ts` - Unit tests (Node.js environment)
- `.test.tsx` - Integration tests (Browser environment)
- `*.config.ts` - Configuration files for tools (tsdown, vitest)
- `.snap` - Snapshot files (auto-generated in __snapshots__/)

**Directories:**

- `src/` - Source code (follows npm convention)
- `test/` - Test code (follows npm convention)
- `dist/` - Distribution output (follows npm convention)
- `fixtures/` - Reusable test utilities (test subdirectory)
- `__snapshots__/` - Snapshot files (Vitest convention)
- `.planning/` - GSD documentation (custom)

**Functions:**

- camelCase for all functions: `render()`, `renderSSR()`, `renderHook()`, `cleanup()`
- `$` suffix for QRL-wrapped functions: `increment$()`, `onClick$()`
- Descriptive names: `renderComponentToSSR()`, `extractPropsFromJSX()`, `resolveComponentPath()`
- Helper functions prefixed with action: `createRenderResult()`, `setupContainer()`, `csrQwikLoader()`

**Variables:**

- camelCase: `mountedContainers`, `qwikLoaderInjected`, `componentImports`, `renderSSRIdentifiers`
- Uppercase for constants: `isJSorTS` (regex pattern), `renderSSRCommand` (const)
- Single letter for iterators: `node`, `child`, `item` (in loops and callbacks)

**Types:**

- PascalCase: `RenderResult`, `RenderOptions`, `ComponentFormat`, `LocalComponentFormat`
- Suffix with Result: `RenderResult`, `RenderHookResult`
- Suffix with Options: `RenderOptions`, `SSRRenderOptions`
- Suffix with Format: `ComponentFormat`, `LocalComponentFormat`
- Prefix is with boolean type: `isFunction`, `isJSXElement`, `hasRenderSSRCall`, `hasCommandsImport`

## Where to Add New Code

**New Feature:**

- Primary code: `src/pure.tsx` for rendering logic, or `src/ssr-plugin-utils.ts` for utility helpers
- Tests: `test/[feature].test.tsx` for integration tests or `test/ssr-plugin.test.ts` for unit tests
- Fixtures: `test/fixtures/[ComponentName].tsx` for test components
- Example: To add new render variant, create function in `src/pure.tsx` and export from `src/index.ts`

**New Component/Module:**

- Implementation: Keep in `src/` root (no subdirectories)
- Rationale: Small API surface (4 main source files) keeps navigation simple
- Export: Re-export in `src/index.ts` main module or subset export (`./pure`, `./ssr-plugin`)

**Utilities:**

- Shared helpers: `src/ssr-plugin-utils.ts` for AST and component utilities
- Pure rendering helpers: `src/pure.tsx` for DOM and Qwik-specific utilities
- Type definitions: Inline in relevant file or co-located with usage

**New Test:**

- Location: `test/[feature].test.tsx` for browser tests
- Location: `test/ssr-plugin.test.ts` for Node.js plugin tests
- Config: Use existing `vitest.config.ts` or create `vitest.[scope].config.ts`
- Fixtures: Add components to `test/fixtures/[Name].tsx`

## Special Directories

**dist/:**
- Purpose: Published package output
- Generated: Yes - via `pnpm build` (tsdown)
- Committed: No - regenerated on each release
- Includes: .js (ESM), .d.ts (types), .mjs files
- Consumed by: npm consumers after package publication

**node_modules/:**
- Purpose: Project dependencies
- Generated: Yes - via `pnpm install`
- Committed: No - managed by pnpm-lock.yaml
- Key packages: @qwik.dev/core, vitest, @vitest/browser-playwright

**.git/:**
- Purpose: Version control metadata
- Generated: Yes - via git init
- Committed: N/A (git metadata)
- Branch: `v2` (current development branch)

**.vscode/:**
- Purpose: VS Code editor settings
- Generated: No - manually configured
- Committed: Yes - shared editor configuration
- Contains: workspace settings, extensions, launch configs

**.github/:**
- Purpose: GitHub Actions workflows
- Generated: No - manually configured
- Committed: Yes - CI/CD pipeline definitions
- Contains: workflow files for testing and publishing

---

*Structure analysis: 2026-02-22*
