# External Integrations

**Analysis Date:** 2026-02-22

## APIs & External Services

**None required for core functionality**
- This is a library package that does not depend on external APIs
- Integrations are determined by peer dependencies and user implementation

## Data Storage

**Databases:**
- Not used - This is a testing library, not an application with persistent storage

**File Storage:**
- Local filesystem only - Build output to `dist/` directory

**Caching:**
- None - Tests run fresh each time via Vitest

## Authentication & Identity

**Auth Provider:**
- Not applicable - No user authentication

**Implementation:**
- Library handles Qwik component testing; authentication is user responsibility in their applications

## Monitoring & Observability

**Error Tracking:**
- None configured

**Logs:**
- Console logging via Vitest and Playwright
- Test output to stdout/stderr during CI/CD pipeline

**Debug Support:**
- Qwik Dev Tools integration via `devTools: {clickToSource: false, imageDevTools: false}` in `vitest.config.ts`
- Playwright debugging via browser provider configuration

## CI/CD & Deployment

**Hosting:**
- npm registry for package distribution
- GitHub repository: `kunai-consulting/vitest-browser-qwik`

**CI Pipeline:**
- GitHub Actions via `.github/workflows/`
  - **unit-test.yml**: Integration Tests
    - Triggers: push to main branch, pull requests to main
    - Runs on: ubuntu-latest
    - Steps: Node/pnpm setup, Playwright install, build, lint, typecheck, test, SSR plugin tests
  - **release.yml**: Release automation (details in repository settings)
  - **pkg-pr-new.yaml**: Package preview workflow

**Build Process:**
- `pnpm run build` - TypeScript bundling via tsdown to `dist/`
- `pnpm run typecheck` - Type validation
- `pnpm run lint` - Code quality via Biome
- `pnpm run test` - Browser tests via Vitest + Playwright
- `pnpm run test:ssr-plugin` - SSR plugin unit tests in Node.js environment

## Environment Configuration

**Required env vars:**
- None required for core package operation
- Playwright browser configuration handled via `flake.nix`:
  - `PLAYWRIGHT_BROWSERS_PATH` - Set to Nix package path
  - `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS` - Set to true

**Secrets location:**
- GitHub Actions secrets not exposed in config files
- Release automation likely uses npm tokens (configured in GitHub)

**Build-Time Configuration:**
- Vite configuration merged from `vitest.config.ts`
- Environment variables from Vite build replaced at build time

## Webhooks & Callbacks

**Incoming:**
- None - Library package with no server

**Outgoing:**
- GitHub Actions publish to npm registry on release
- Possible PR automation via `pkg-pr-new.yaml` workflow

## Browser Integration

**Testing Environment:**
- **Playwright** (`@playwright/test` 1.52.0)
  - Provider for Vitest browser mode
  - Runs Chromium instances headless in CI, headful in development
  - Version locked via pnpm override to prevent conflicts with Nix version

**Component Testing:**
- Renders Qwik components via `@qwik.dev/core/optimizer` plugin
- Injects Qwik loader script from `@qwik.dev/core/server`
- Server-side rendering via Vite's ssrLoadModule API

## Code Parsing & Transformation

**AST Parsing:**
- **OXC Parser** (`oxc-parser` ^0.95.0) - Parse test files and components
- **OXC Resolver** (`oxc-resolver` ^11.11.1) - Resolve import paths
- **Magic String** (`magic-string` ^0.30.17) - Transform source code with source map preservation

**Plugin Architecture:**
- Vitest plugin via `src/ssr-plugin.ts`
  - Transforms `renderSSR()` calls to execute in Node.js SSR context
  - Browser commands for component rendering on server
  - Integration with Vite's server infrastructure

---

*Integration audit: 2026-02-22*
