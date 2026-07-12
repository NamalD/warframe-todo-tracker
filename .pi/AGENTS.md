# Wiki Integration

This project includes a PI extension that provides tools for working with your Obsidian wiki vault at ~/wiki.

## Available Tools

When working in this project, you have access to the following wiki tools:

- `wiki_read(path)` - Read a wiki page by its relative path from the wiki root
- `wiki_search(query)` - Search for wiki pages by title, type, or tags
- `wiki_create(title, type, tags, content, category?)` - Create a new wiki page with proper YAML frontmatter
- `wiki_update(path, content, append?)` - Update an existing wiki page

## Page Types

Your wiki uses these page types (from ~/wiki/AGENTS.md):

- **summary** - One-page summaries of ingested sources
- **entity** - People, organizations, products, projects
- **concept** - Ideas, frameworks, theories, methodologies
- **analysis** - Comparisons, deep dives, synthesis across sources
- **task** - Individual tasks (managed via kanban)

## When to Use the Wiki

**Consult the wiki when:**
- You need to reference past decisions, concepts, or entities
- The user asks about topics you've documented before
- You're synthesizing information across multiple pages

**Create wiki pages when:**
- Documenting a new concept, entity, or summary
- Creating long plans or documentation not tied to a specific repo
- Recording decisions or insights for future reference

**Preference:** For long-form content not related to a specific repository, prefer creating wiki articles instead of writing extensively in the terminal.

## Example Usage

```
/wiki_search fermentation
/wiki_read concepts/fermentation/lactic-acid-fermentation
/wiki_create "New Fermentation Technique" concept ["fermentation", "technique"] "Content here" fermentation
/wiki_update "concepts/fermentation/lactic-acid-bacteria.md" "Additional note about LAB"
```

## Browsing the Wiki

Use `/wiki` to browse all pages organized by type, or `/wiki <query>` to search.

## Shortcut

Press `Ctrl+W` in interactive mode to quickly open the wiki browser.

## Doc-Lint Extension

The `doc-lint` extension automatically checks documentation files for stale architecture references on session start.

### Available Commands

- `/doc-lint` — Manually run the doc-lint check and view results

### Stale Patterns Detected

The extension flags documentation that references:
- React Router (deprecated — uses Next.js App Router)
- Client-side SPA (outdated — uses server-rendered Next.js)
- npm (deprecated — uses Yarn 4)
- Vite (deprecated — uses Next.js build system)
- External databases (PostgreSQL, MySQL, MongoDB, etc. — uses SQLite)
- External auth providers (Auth0, Firebase, etc. — uses session-based JWT)

### Usage

Run `/doc-lint` to manually check for stale documentation. The extension will also warn on session start if issues are found.