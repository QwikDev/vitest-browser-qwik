# Architecture

**Analysis Date:** 2026-02-22

## Pattern Overview

**Overall:** Plugin-based component testing framework with dual rendering modes

**Key Characteristics:**
- Two parallel rendering pipelines: Client-Side Rendering (CSR) and Server-Side Rendering (SSR)
- Vite plugin that transforms SSR calls at build time via AST manipulation
- Browser-based testing using Vitest 4+ with Playwright provider
- Pure functional rendering utilities that wrap Qwik's rendering system
- Hook testing support via component wrapper pattern

## Layers

**Plugin Layer (Build-time):**
- Purpose: Transform `renderSSR()` calls into browser commands during test file compilation
- Location: `src/ssr-plugin.ts`
- Contains: Vite plugin definition, AST traversal logic, code transformation
- Depends on: oxc-parser, magic-string, Vitest config system
- Used by: Test files (transformed during compilation)

**Rendering Core Layer:**
- Purpose: Execute rendering operations using Qwik's render function
- Location: `src/pure.tsx`
- Contains: `render()`, `renderSSR()`, `renderHook()`, `renderServerHTML()` functions
- Depends on: Qwik core renderer, Vitest browser utilities
- Used by: Test files directly or via transformed plugin output

**Command/RPC Layer:**
- Purpose: Execute SSR rendering in Node.js context via browser commands
- Location: `src/ssr-plugin.ts` (renderSSRCommand, renderSSRLocalCommand functions)
- Contains: Browser command implementations that execute on test server
- Depends on: Vite SSR module loading, component resolution
- Used by: Transformed test code via `commands.renderSSR()` calls

**Utilities Layer:**
- Purpose: AST analysis and component resolution helpers
- Location: `src/ssr-plugin-utils.ts`
- Contains: AST node type guards, prop extraction, path resolution, component rendering
- Depends on: oxc-parser types, oxc-resolver, oxc-types
- Used by: Plugin layer for code transformation logic

**Public API Layer:**
- Purpose: Export user-facing functions and type definitions
- Location: `src/index.ts`
- Contains: Re-exports from pure.tsx, page extension setup, beforeEach cleanup hook
- Depends on: pure.tsx, Vitest browser module
- Used by: End-user test files

## Data Flow

**CSR (Client-Side Rendering) Flow:**

1. Test calls `render(<Component />)` in browser context
2. `render()` in `src/pure.tsx` receives JSXOutput
3. Injects Qwik loader script via `getQwikLoaderScript()` (one-time)
4. Calls `qwikRender()` from Qwik core to render into container
5. Returns `RenderResult` with DOM queries and utilities
6. Test can interact with rendered component via browser APIs
7. `cleanup()` hook runs automatically via `beforeEach` in `src/index.ts`

**SSR (Server-Side Rendering) Flow:**

1. Test calls `renderSSR(<Component />)` in test file
2. Plugin (`src/ssr-plugin.ts`) detects call via code transform filter
3. Transforms call to `commands.renderSSR()` or `commands.renderSSRLocal()` with metadata
4. Browser sends command to server with component path and props
5. Server command handler (`renderSSRCommand`) loads component via Vite SSR loader
6. `renderComponentToSSR()` in `src/ssr-plugin-utils.ts` executes:
   - Creates manifest mapping from Qwik build outputs
   - Calls `renderToStream()` from Qwik server
   - Captures HTML output
7. Returns HTML to browser wrapped in `renderServerHTML()`
8. `renderServerHTML()` inserts HTML into DOM and executes scripts
9. Test can query rendered DOM or inspect innerHTML

**Hook Testing Flow:**

1. Test calls `renderHook(() => useCounter({ countSignal: useSignal(0) }))`
2. `renderHook()` wraps hook in component via `component$()`
3. Creates promise and ref container for hook result
4. Renders component via `render()` (CSR path)
5. Component executes hook and captures result in `resultContainer.value`
6. Resolves render promise when component executes
7. Returns result with unmount function
8. Test can call hook's QRL functions and access state

**State Management:**

- Container tracking: `mountedContainers` Set in `src/pure.tsx` tracks all rendered containers for cleanup
- Loader injection: `qwikLoaderInjected` flag prevents duplicate Qwik loader script injection
- Component module caching: Vite's SSR module loader caches transformed modules
- Local component handling: Temporary files generated with vitest imports stripped for SSR execution

## Key Abstractions

**RenderResult:**
- Purpose: Unified interface for both CSR and SSR rendered components
- Examples: `src/pure.tsx` lines 9-19
- Pattern: Extends `LocatorSelectors` from Vitest browser to provide DOM query methods (`getByText`, `getByRole`, etc.)
- Contains: `container`, `baseElement`, `debug()`, `unmount()`, `asFragment()` plus query methods

**RenderOptions/SSRRenderOptions:**
- Purpose: Configuration for render container setup
- Examples: `src/pure.tsx` lines 21-29
- Pattern: Optional properties for custom container or base element
- Usage: Passed to `render()` and `renderServerHTML()`

**ComponentFormat/LocalComponentFormat:**
- Purpose: Type definitions for browser commands
- Examples: `src/ssr-plugin.ts` lines 26-41
- Pattern: BrowserCommand generics with tuples defining command parameters
- Usage: Define renderSSR and renderSSRLocal browser command signatures

**JSXNode/JSXOutput:**
- Purpose: Qwik's JSX type system
- Source: `@qwik.dev/core` package
- Pattern: Represents compiled JSX element ready for rendering
- Usage: Input to all render functions

## Entry Points

**Main Export:**
- Location: `src/index.ts`
- Triggers: Direct import in test files: `import { render, renderSSR, renderHook } from 'vitest-browser-qwik'`
- Responsibilities: Re-exports render functions, extends Vitest page object, sets up automatic cleanup

**SSR Plugin Entry:**
- Location: `src/ssr-plugin.ts` → `testSSR()` function
- Triggers: Added to Vitest config `plugins: [testSSR()]`
- Responsibilities: Transforms renderSSR calls, registers browser commands, handles Vite configuration

**Render Functions (CSR):**
- Location: `src/pure.tsx` → `render()`, `renderHook()`
- Triggers: Called directly in test code
- Responsibilities: Setup container, invoke Qwik renderer, return result

**Render Functions (SSR):**
- Location: `src/ssr-plugin.ts` (after transformation) → `renderSSRCommand`, `renderSSRLocalCommand`
- Triggers: Executed via browser commands from transformed code
- Responsibilities: Load component, resolve props, render to HTML, return HTML string

**Server HTML Rendering:**
- Location: `src/pure.tsx` → `renderServerHTML()`
- Triggers: Called with HTML string from renderSSRCommand
- Responsibilities: Insert HTML into DOM, execute scripts, return RenderResult

## Error Handling

**Strategy:** Throw descriptive errors with context information

**Patterns:**

- **Missing Plugin:** `src/index.ts` line 9-14 throws error if `renderSSR()` called without plugin transformation
  - Message includes: Function name, JSX node type, plugin requirement
  - Helps developers identify configuration issue

- **Component Not Found:** `src/ssr-plugin.ts` lines 63-66 throws error if component export missing
  - Includes: Component name, file path, context of failure

- **Local Component Not Found:** `src/ssr-plugin.ts` lines 143-146 includes available exports in error
  - Helps debugging by showing what exports were found

- **Module Resolution Failure:** `src/ssr-plugin-utils.ts` lines 201-206 falls back to basic resolution
  - Logs warning with oxc-resolver error details
  - Continues with fallback to avoid blocking

- **Temporary File Cleanup:** `src/ssr-plugin.ts` lines 151-155 catches and warns on cleanup failures
  - Prevents test failure from cleanup error

## Cross-Cutting Concerns

**Logging:**

- `console.log()` statements in `src/ssr-plugin-utils.ts` lines 243, 292, 306 for:
  - Module resolution debugging
  - Manifest mapping generation
  - Final HTML output
- In production, these should be conditional on debug flag
- Test fixtures log component execution context (server/client)

**Validation:**

- AST validation before transformation: `hasRenderSSRCallInAST()` checks for renderSSR usage
- Path validation: `isJSorTS` regex ensures only JS/TS files are transformed
- Component validation: Type checks via TypeScript for RenderResult and component props
- Attribute validation: `extractPropsFromJSX()` safely extracts props from JSX attributes

**Authentication:**

- Not applicable - purely local testing framework
- Environment variables passed through Vite config via `viteServer.config.env`
- Manifests and module loading secured by Vite's module resolution system

**Resource Management:**

- Container cleanup: `cleanup()` function removes all mounted containers from DOM
- Module cleanup: Temporary SSR test files deleted after use
- Loader injection: One-time Qwik loader script prevents redundant injections
- Container tracking: Set-based tracking enables comprehensive cleanup

---

*Architecture analysis: 2026-02-22*
