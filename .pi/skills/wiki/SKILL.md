---
name: wiki
description: Tools for reading and writing to your Obsidian wiki vault. Use when you need to consult existing knowledge, document new ideas, or create long-form content that should persist beyond the current conversation.
---

# Wiki Integration

This skill provides tools for working with your personal knowledge base at ~/wiki.

## When to Use

**Consult the wiki when:**
- You need to reference past decisions, concepts, or entities
- The user asks about topics you've documented before
- You're synthesizing information across multiple pages

**Create wiki pages when:**
- Documenting a new concept, entity, or summary
- Creating long plans or documentation not tied to a specific repo
- Recording decisions or insights for future reference

## Available Tools

- `wiki_read(path)` - Read a wiki page by its relative path
- `wiki_search(query)` - Search for pages by title, type, or tags
- `wiki_create(title, type, tags, content, category?)` - Create a new page with proper frontmatter
- `wiki_update(path, content, append?)` - Update an existing page

## Page Types

- **summary** - One-page summaries of ingested sources
- **entity** - People, organizations, products, projects
- **concept** - Ideas, frameworks, theories, methodologies
- **analysis** - Comparisons, deep dives, synthesis across sources
- **task** - Individual tasks (managed via kanban)

## Workflow

1. Use `wiki_search(query)` to find relevant pages
2. Use `wiki_read(path)` to read full page content
3. Use `wiki_create()` to create new documentation
4. Use `wiki_update()` to add new information to existing pages

## Example

```
/wiki_search fermentation
/wiki_read concepts/fermentation/lactic-acid-fermentation
/wiki_create "New Fermentation Technique" concept ["fermentation", "technique"] "Content here" fermentation
```