# Doc-Lint Extension

Warns on stale architecture docs by checking for keywords that contradict the current project architecture.

## Features

- **Automatic linting on session start**: Checks documentation files for stale architecture references
- **Manual trigger**: Use `/doc-lint` command to run a check and view results
- **Programmatic access**: Use the `doc_lint` tool for programmatic checking

## How It Works

The extension only flags lines that describe the **current architecture** (e.g., lines containing `Type:`, `Framework:`, `Database:`, `Build:`, etc.). This prevents false positives in:

- Historical documentation (migration plans, historical audit files)
- Lines that are examples, discussions, or historical context
- Planning documents that mention old tech in a different context

## Stale Patterns Detected

The extension flags documentation that references:

- **React Router** (deprecated — uses Next.js App Router)
- **Client-side SPA** (outdated — uses server-rendered Next.js)
- **npm** (deprecated — uses Yarn 4)
- **Vite** (deprecated — uses Next.js build system)
- **Create React App/Webpack config** (outdated — uses Next.js)
- **Express/fastify/koa** (deprecated — uses Next.js API Routes)
- **External databases** (PostgreSQL, MySQL, MongoDB, etc. — uses SQLite)
- **External auth providers** (Auth0, Firebase, etc. — uses session-based JWT)

## Usage

### Command

```
/doc-lint
```

Runs the doc-lint check and displays a report of any stale references found.

### Tool

```
doc_lint(path: string?)
```

Programmatic access to check documentation files. Optionally specify a path to check a specific directory.

### Ignore Marker

Add `<!-- doc-lint: ignore -->` to any file to exclude it from linting:

```markdown
<!-- doc-lint: ignore -->
# This file will be skipped by doc-lint
```

## Installation

The extension is auto-discovered in `.pi/extensions/doc-lint/` and loaded automatically when the project is trusted.

## Configuration

No configuration required. The extension checks all `.md` files in the `docs/` directory on session start.

### Automatic Exclusions

The following are automatically excluded:
- `docs/migration-plan.md` (historical migration documentation)
- `docs/schema.md` (conceptual schema documentation)
- Files in `docs/historical/` or `docs/migrations/` directories
- Standard files: `README.md`, `LICENSE`, `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`