# Technology Stack

**Analysis Date:** 2026-02-22

## Languages

**Primary:**
- TypeScript 5.8.3 - All source code and configuration
- JSX/TSX - Component definitions (`src/pure.tsx`)

**Secondary:**
- YAML - GitHub Actions workflow configuration
- Nix - Development environment configuration (`flake.nix`)

## Runtime

**Environment:**
- Node.js 22 (via `flake.nix`)
- Browser environment via Playwright (for browser-based tests)

**Package Manager:**
- pnpm 10.13.1
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Qwik v2 (`@qwik.dev/core`) - Component framework and rendering
  - JSX handling via `@qwik.dev/core` with server utilities via `@qwik.dev/core/server`
- Vitest 4.0.0+ - Browser-based component testing framework
  - `@vitest/browser-playwright` - Playwright integration for browser tests

**Build/Dev:**
- tsdown 0.15.9 - TypeScript bundler (builds ESM modules)
- Vite 6.3.5+ - Build and dev server (peer dependency)
- TypeScript 5.8.3 - Type checking and compilation

**Code Quality:**
- Biomejs 2.0.0 - Linting and formatting (unified tool)

## Key Dependencies

**Critical:**
- `oxc-parser` ^0.95.0 - Fast AST parser for JavaScript/TypeScript
- `oxc-resolver` ^11.11.1 - Path resolution library
- `magic-string` ^0.30.17 - String manipulation with source map support
- `@oxc-project/types` ^0.95.0 - Type definitions for OXC project

**Testing:**
- `@vitest/browser-playwright` ^4.0.0 - Browser test provider
- `vitest` ^4.0.0 - Test runner (dev)
- `@playwright/test` 1.52.0 - Playwright testing framework (locked via pnpm overrides)

**Utilities:**
- `magic-regexp` ^0.10.0 - Type-safe regular expressions
- `ignore` ^7.0.5 - .gitignore parser
- `bumpp` ^10.1.0 - Version bumping tool

## Configuration

**Environment:**
- `.envrc` - Direnv configuration for Nix flake integration
- Node.js configuration: `flake.nix` specifies Node.js 22 with corepack
- No `.env` files required for runtime configuration

**Build:**
- `tsconfig.json` - TypeScript compiler configuration
  - Target: ESNext
  - Module: preserve (allows ES modules)
  - Strict mode enabled
  - JSX: react-jsx with `@qwik.dev/core` as import source
- `tsdown.config.ts` - Build configuration with two entry points:
  - Browser entry: `src/index.ts`, `src/pure.tsx`
  - Server entry: `src/ssr-plugin.ts` (Node.js)
- `biome.json` - Code formatter and linter configuration
  - Formatter: Tab indentation, double quotes for JavaScript
  - Linter: Recommended rules enabled
  - Organizes imports automatically
- `vitest.config.ts` - Browser test configuration
  - Playwright provider with Chromium
  - Test timeout: 2000ms
- `vitest.ssr-plugin.config.ts` - Node.js environment for plugin unit tests

## Platform Requirements

**Development:**
- Node.js 22 (via Nix flake)
- pnpm 10.13.1
- Git (for version management)
- Playwright browsers installed via `pnpm exec playwright install`

**Production:**
- Peer dependencies: Qwik, Vite 6.3.5+, Vitest 4.0.0+
- Distributed as npm package with ESM exports
- Exports three main entry points: `./` (main), `./pure` (pure utilities), `./ssr-plugin` (plugin)

## External Tools & Services

**Package Publishing:**
- npm registry (via standard pnpm publish)
- CI/CD: GitHub Actions

---

*Stack analysis: 2026-02-22*
