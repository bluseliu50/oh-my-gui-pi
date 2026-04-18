# Repository Guidelines

## Project Overview
oh-my-gui-pi (Oh My Pi) is an agent-first workspace and CLI tool that uses LLMs (like Claude) to inspect, edit, and explain a codebase. The project primarily consists of an Electron-based desktop application with a React renderer, powered by a headless Bun agent backend (kernel) that manages LLM streaming, tool execution, and session state.

## Architecture & Data Flow
- **Renderer (Frontend)**: React + Tailwind CSS application running in Electron (`packages/coding-agent/src/desktop/renderer`).
- **Backend (Agent Kernel)**: A headless Bun process running the core agent loop, tool choice queues, and streaming event emitters (`packages/coding-agent/src/modes/rpc/rpc-mode.ts`).
- **Data Flow**: The React frontend sends commands (e.g., `prompt`) via an Electron IPC bridge (`window.ompDesktop.request`) to the Bun backend's `stdin`. The backend streams state updates and tool execution events as JSON lines via `stdout` back to the frontend, updating the `useDesktopSession` state store.
- **Pending Mutations**: Destructive file operations (e.g., `write`, `edit`, `ast_edit`, `notebook`) do not apply immediately. They stage a `PendingActionSummary` via `queueResolveHandler` and are sent to the UI. The user reviews the live diff and uses the hidden `resolve` tool to either `apply` or `discard` the changes.

## Key Directories
- `packages/coding-agent/src`: Main CLI application and Desktop Electron shell.
  - `desktop/`: Electron main process, preload script, backend launcher, and React renderer.
  - `modes/rpc/`: Bun backend RPC implementation.
  - `tools/`: Built-in agent tools (e.g., `ast_edit`, `write`, `resolve`).
- `packages/agent/src`: Core agent runtime, tool execution logic, and LLM context handling.
- `packages/ai/src`: Multi-provider LLM client with streaming support.
- `packages/tui/src`: Terminal UI library with differential rendering.
- `packages/natives/`: N-API native bindings.
- `crates/pi-natives/`: Rust crate providing performance-critical text and grep operations.

## Important Files
- `package.json`: Workspace root, defining package scripts and catalog dependencies.
- `packages/coding-agent/src/desktop/build.ts`: Bundles the React renderer, Tailwind CSS, and Electron main/preload using `Bun.build()`.
- `packages/coding-agent/src/session/agent-session.ts`: Central `AgentSession` state managing LLM history, checkpoints, and pending actions.
- `packages/coding-agent/src/desktop/renderer/state/store.ts`: React reducer processing incoming JSON-RPC `DesktopBackendFrame` events.

## Development Commands
- **Run Desktop App**: `bun --cwd=packages/coding-agent run desktop:dev`
- **Build Desktop App**: `bun --cwd=packages/coding-agent run desktop:build`
- **Build Workspace**: `bun run build`
- **Type Checking**: `bun run check:types` (Uses `tsgo` for no-emit validation)
- **Testing**: `bun run test` (Uses `bun:test`)
- **Lint & Format**: `bun run lint` / `bun run fmt` / `bun run fix` (Uses Biome)
- **Native Build**: `bun --cwd=packages/natives run build`

## Runtime/Tooling Preferences
- **Runtime**: Bun (`bun >= 1.3.7`). Do NOT use Node.js APIs where Bun alternatives exist.
- **Package Manager**: Bun Workspaces with catalog target ES2024.
- **Desktop Framework**: Electron (`^41.2.0`). No Node integration in the renderer (use IPC `contextBridge`).
- **Formatting & Linting**: Biome.

## Testing & QA
- **Framework**: `bun:test`. Tests are co-located in `test/` folders within packages.
- **Commands**: `bun test` (TS) and `bun run test:rs` (Rust).
- **Conventions**: 
  - Test the external contract, not internal implementations. 
  - Use per-test fakes/spies (`vi.spyOn(...)`) and restore them (`vi.restoreAllMocks()`). 
  - NEVER use `mock.module()` due to cross-test leakage. Tests must be full-suite safe.
  - Do not add tests for tiny, low-risk changes unless the change affects a real contract.

## Code Conventions & Common Patterns

### Code Quality
- No `any` types unless absolutely necessary.
- Prefer `export * from "./module"` over named re-exports in barrel files.
- **Class privacy**: Use ES native `#` private fields for encapsulation. NO `private`/`protected`/`public` keywords except on constructor parameter properties.
  ```typescript
  // GOOD: ES native # for private, bare for accessible
  class Foo {
      #bar: string;
      greet(): void { ... }
  }
  // OK: constructor parameter properties keep the keyword
  class Service {
      constructor(private readonly session: ToolSession) {}
  }
  ```
- **Types**: NEVER use `ReturnType<>` — use the actual type name instead. Check `node_modules` for external API type definitions.
- **Imports**: NEVER use inline imports (e.g., `await import("./foo.js")`). Always use standard top-level imports. Use namespace imports for `node:fs` and `node:path` (e.g., `import * as fs from "node:fs/promises"`).
- **Async**: Use `Promise.withResolvers()` instead of `new Promise((resolve, reject) => ...)`.
- **Prompts**: NEVER build prompts in code — no inline strings or template literals. Prompts live in static `.md` files; use Handlebars for dynamic content. Import via `import content from "./prompt.md" with { type: "text" }`.

### Bun Over Node
- **Process Execution**: Prefer Bun Shell (`$` template literals) for simple commands. Use `Bun.spawn`/`Bun.spawnSync` only for long-running processes or streaming I/O.
- **Sleep**: Prefer `await Bun.sleep(ms)` over `setTimeout` promises.
- **File I/O**: Prefer Bun APIs (`Bun.file().text()`, `Bun.write()`). Use `node:fs/promises` for directory operations since Bun lacks native directory APIs.
- **Anti-Patterns**: NEVER check `.exists()` before reading — use try-catch with error codes. NEVER create multiple handles to the same path.
  ```typescript
  // GOOD: One syscall, atomic, type-safe error handling
  import { isEnoent } from "@oh-my-pi/pi-utils";
  try {
      return await Bun.file(path).json();
  } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
  }
  ```
- **Streams**: Use centralized helpers like `readStream` and `readLines` from `utils/stream`.
- **JSON**: Use `Bun.JSON5` and `Bun.JSONL` instead of external dependencies or manual parsing.

### Logging
- **NEVER use `console.log`, `console.error`, or `console.warn`** in the coding-agent package. Console output corrupts the TUI rendering.
- Use the centralized logger: `import { logger } from "@oh-my-pi/pi-utils";`.
- Logs go to `~/.omp/logs/omp.YYYY-MM-DD.log` with automatic rotation.

### TUI Rendering Sanitization
- All text displayed in tool renderers must be sanitized before output.
- **Tabs → spaces**: Always pass displayed text through `replaceTabs()` before rendering.
- **Line truncation**: Truncate displayed lines with `truncateToWidth()`.
- **Path shortening**: Use `shortenPath()` for file paths shown to users.
- **Content preview limits**: Use `PREVIEW_LIMITS` constants.

### Changelog & Releasing
- Append to `## [Unreleased]` in `packages/*/CHANGELOG.md`. Format: `### Added`, `### Changed`, `### Fixed`, `### Removed`.
- Releasing: Run `bun run release` to bump versions, tag, and publish.