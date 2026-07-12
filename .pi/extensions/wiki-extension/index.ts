/**
 * Wiki Extension - Tools for reading and writing to an Obsidian wiki vault
 *
 * Provides tools for:
 * - wiki_read(path) - Read a wiki page by its relative path
 * - wiki_search(query) - Search for wiki pages by title
 * - wiki_create(title, type, tags, content, category?) - Create a new page
 * - wiki_update(path, content, append?) - Update an existing page
 *
 * Follows the LLM wiki pattern conventions from ~/wiki/AGENTS.md
 */

import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// Wiki configuration
const WIKI_ROOT = "~/wiki";

// Page type categories
const PAGE_TYPES = ["summary", "entity", "concept", "analysis", "task"] as const;
type PageType = (typeof PAGE_TYPES)[number];

// Categories for each page type
const PAGE_CATEGORIES: Record<PageType, string[]> = {
  summary: ["fermentation", "greek-mythology", "literature", "architecture", "self-hosted", "philosophy", "finance", "ebooks", "aesthetics", "hermes", "storytelling"],
  entity: ["greek-mythology", "self-hosted", "people", "literature", "projects"],
  concept: ["fermentation", "philosophy", "finance", "architecture", "ebooks", "aesthetics", "hermes", "literature", "storytelling"],
  analysis: ["agents", "greek-mythology", "devops", "hermes", "kanban"],
  task: [],
};

interface WikiPage {
  path: string;
  title: string;
  type: PageType;
  tags: string[];
  created: string;
  updated: string;
  sources?: string[];
  content: string;
}

interface WikiSearchResult {
  path: string;
  title: string;
  type: PageType;
  tags: string[];
  excerpt: string;
}

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return path.replace(/^~/, process.env.HOME || "/home/namal");
  }
  return path;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function todayDate(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

/**
 * Generate YAML frontmatter
 */
function generateFrontmatter(params: {
  title: string;
  type: PageType;
  tags: string[];
  created?: string;
  updated?: string;
  sources?: string[];
}): string {
  const lines: string[] = ["---"];
  lines.push(`title: "${params.title}"`);
  lines.push(`type: ${params.type}`);
  lines.push(`tags: [${params.tags.map(t => `"${t}"`).join(", ")}]`);
  lines.push(`created: ${params.created || todayDate()}`);
  lines.push(`updated: ${params.updated || todayDate()}`);
  if (params.sources && params.sources.length > 0) {
    lines.push(`sources: [${params.sources.map(s => `"${s}"`).join(", ")}]`);
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Execute shell command using the provided pi API
 */
async function piExec(pi: ExtensionAPI, command: string, options?: { signal?: AbortSignal; timeout?: number }): Promise<{ stdout: string; stderr: string; code: number }> {
  const result = await pi.exec("sh", ["-c", command], {
    signal: options?.signal,
    timeout: options?.timeout,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    code: result.code || 0,
  };
}

/**
 * Read a file using bash
 */
async function readFile(pi: ExtensionAPI, path: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const result = await piExec(pi, `cat "${path.replace(/"/g, '\\"')}"`, { signal });
    if (result.code === 0) {
      return result.stdout;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write a file using bash
 */
async function writeFile(pi: ExtensionAPI, path: string, content: string, signal?: AbortSignal): Promise<boolean> {
  try {
    // Create directory if needed
    const dir = dirname(path);
    await pi.exec("mkdir", ["-p", dir], { signal });
    
    // Write file using heredoc
    const escapedContent = content.replace(/\x1a/g, '\\x1a'); // Escape escape sequences
    const result = await pi.exec("sh", ["-c", `cat > "${path.replace(/"/g, '\\"')}" << 'WIKIEOF'\n${content}\nWIKIEOF`], { signal });
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Get all wiki pages by scanning the directory
 */
async function getWikiPages(pi: ExtensionAPI, ctx: ExtensionContext): Promise<WikiPage[]> {
  const pages: WikiPage[] = [];
  const wikiPath = expandPath(WIKI_ROOT);
  
  // Find markdown files
  const findResult = await piExec(pi, `find "${wikiPath}" -name "*.md" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null`);
  
  if (findResult.stdout.trim() === "") {
    return pages;
  }
  
  const files = findResult.stdout.trim().split("\n").filter(f => f.trim());
  
  for (const file of files) {
    const relativePath = relative(wikiPath, file);
    // Skip root-level files
    if (relativePath === "AGENTS.md" || relativePath === "README.md" || 
        relativePath === "index.md" || relativePath === "log.md") {
      continue;
    }
    
    // Skip hidden directories
    if (relativePath.includes("/.") || relativePath.includes("/._")) {
      continue;
    }
    
    const content = await readFile(pi, file, ctx.signal);
    if (!content) continue;
    
    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatterMatch) continue;
    
    const frontmatter = frontmatterMatch[1];
    const body = content.slice(frontmatterMatch[0].length);
    
    // Extract metadata
    const titleMatch = frontmatter.match(/^title:\s*"([^"]*)"/m);
    const typeMatch = frontmatter.match(/^type:\s*(\w+)/m);
    const tagsMatch = frontmatter.match(/^tags:\s*\[([^\]]*)\]/m);
    const createdMatch = frontmatter.match(/^created:\s*(\d{4}-\d{2}-\d{2})/m);
    const updatedMatch = frontmatter.match(/^updated:\s*(\d{4}-\d{2}-\d{2})/m);
    const sourcesMatch = frontmatter.match(/^sources:\s*\[([^\]]*)\]/m);
    
    const page: WikiPage = {
      path: file,
      title: titleMatch?.[1] || relativePath.replace(/\.md$/, ""),
      type: (typeMatch?.[1] as PageType) || "concept",
      tags: tagsMatch ? tagsMatch[1].match(/"([^"]*)"/g)?.map(t => t.slice(1, -1)) || [] : [],
      created: createdMatch?.[1] || todayDate(),
      updated: updatedMatch?.[1] || todayDate(),
      content: body.trim(),
    };
    
    if (sourcesMatch) {
      page.sources = sourcesMatch[1].match(/"([^"]*)"/g)?.map(s => s.slice(1, -1)) || [];
    }
    
    pages.push(page);
  }
  
  return pages;
}

export default function (pi: ExtensionAPI) {
  /**
   * Helper to get relative wiki path
   */
  function getWikiPath(relativePath: string): string {
    return expandPath(join(WIKI_ROOT, relativePath));
  }

  // Register the wiki_read tool
  pi.registerTool({
    name: "wiki_read",
    label: "Read Wiki Page",
    description: "Read a wiki page by its relative path from the wiki root. Returns the full page content including frontmatter.",
    parameters: Type.Object({
      path: Type.String({
        description: "Relative path to the wiki page (e.g., 'concepts/fermentation/lactic-acid-bacteria.md')",
      }),
    }),

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const fullPath = getWikiPath(params.path);
      const content = await readFile(pi, fullPath, signal);
      
      if (!content) {
        return {
          content: [{ type: "text", text: `Error: Page not found at ${params.path}` }],
          details: { success: false, error: "not_found" },
        };
      }
      
      return {
        content: [{ type: "text", text: content }],
        details: { success: true, path: params.path },
      };
    },

    renderCall(args, theme, _context) {
      return new Text(
        theme.fg("toolTitle", theme.bold("wiki_read ")) +
        theme.fg("muted", `from ${WIKI_ROOT}/${args.path}`),
        0, 0
      );
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as { success?: boolean; path?: string } | undefined;
      if (!details?.success) {
        return new Text(theme.fg("error", "Page not found"), 0, 0);
      }
      
      const text = result.content[0] as { type: string; text: string };
      const lines = text.text.split("\n");
      const firstLines = lines.slice(0, 5).join("\n");
      return new Text(
        theme.fg("success", "✓ ") + theme.fg("muted", `Read ${details.path}\n${firstLines}...`),
        0, 0
      );
    },
  });

  // Register the wiki_search tool
  pi.registerTool({
    name: "wiki_search",
    label: "Search Wiki",
    description: "Search for wiki pages by title. Returns matching pages with their types and tags.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query to match against page titles and paths",
      }),
      limit: Type.Optional(Type.Number({
        description: "Maximum number of results (default: 10)",
        default: 10,
      })),
    }),

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const pages = await getWikiPages(pi, ctx);
      const query = params.query.toLowerCase();
      const limit = params.limit || 10;
      
      // Search by title, type, or path
      const results = pages.filter(page => {
        const path = page.title.toLowerCase();
        const type = page.type.toLowerCase();
        const tags = page.tags.map(t => t.toLowerCase()).join(" ");
        return path.includes(query) || type.includes(query) || tags.includes(query);
      }).slice(0, limit);
      
      const searchResults = results.map(page => ({
        path: page.type === "task" 
          ? "kanban/home" 
          : `${page.type}s/${page.type === "task" ? "" : ""}${page.title.toLowerCase().replace(/\s+/g, "-")}.md`,
        title: page.title,
        type: page.type,
        tags: page.tags.slice(0, 5),
        excerpt: page.content.split("\n")[0]?.slice(0, 100) || "",
      }));
      
      const output = searchResults.map(r => 
        `- [[${r.title}]] (${r.type}) - ${r.tags.slice(0, 3).join(", ")}\n  ${r.excerpt || ""}${r.excerpt ? "..." : ""}`
      ).join("\n\n") || "No results found";
      
      return {
        content: [{ type: "text", text: output }],
        details: { success: true, results: searchResults },
      };
    },

    renderCall(args, theme, _context) {
      return new Text(
        theme.fg("toolTitle", theme.bold("wiki_search ")) +
        theme.fg("muted", `"${args.query}"`),
        0, 0
      );
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as { success?: boolean; results?: WikiSearchResult[] } | undefined;
      if (!details?.success || !details.results?.length) {
        return new Text(theme.fg("dim", "No wiki pages found"), 0, 0);
      }
      
      const count = details.results.length;
      return new Text(
        theme.fg("success", `✓ Found ${count} page(s)`),
        0, 0
      );
    },
  });

  // Register the wiki_create tool
  pi.registerTool({
    name: "wiki_create",
    label: "Create Wiki Page",
    description: "Create a new wiki page with proper YAML frontmatter. Use this for documenting ideas, concepts, entities, or summaries.",
    parameters: Type.Object({
      title: Type.String({
        description: "Title for the new page",
      }),
      type: Type.String({
        description: "Type of page: summary, entity, concept, analysis, or task",
        enum: PAGE_TYPES,
      }),
      tags: Type.Array(Type.String(), {
        description: "Tags for the page (e.g., ['fermentation', 'microbiology'])",
      }),
      content: Type.String({
        description: "Markdown content for the page body (without frontmatter)",
      }),
      category: Type.Optional(Type.String({
        description: "Category/subdirectory (e.g., 'fermentation' for summaries/fermentation/)",
      })),
      sources: Type.Optional(Type.Array(Type.String(), {
        description: "Source file paths (e.g., ['raw/source.md'])",
      })),
    }),

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      // Determine category based on type if not provided
      let category = params.category;
      if (!category && PAGE_CATEGORIES[params.type].length > 0) {
        // Default to first category for the type
        category = PAGE_CATEGORIES[params.type][0];
      }
      
      // Build the path
      const safeTitle = params.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const dir = category ? `${params.type}s/${category}` : `${params.type}s`;
      const path = getWikiPath(`${dir}/${safeTitle}.md`);
      
      // Check if file exists
      const existingContent = await readFile(pi, path, signal);
      
      if (existingContent) {
        return {
          content: [{ type: "text", text: `Error: Page already exists at ${dir}/${safeTitle}.md. Use wiki_update to modify it.` }],
          details: { success: false, error: "already_exists", path: dir },
        };
      }
      
      // Generate frontmatter
      const frontmatter = generateFrontmatter({
        title: params.title,
        type: params.type,
        tags: params.tags,
        sources: params.sources,
      });
      
      // Combine frontmatter and content
      const fullContent = [frontmatter, params.content].join("\n");
      
      // Create the file
      const success = await writeFile(pi, path, fullContent, signal);
      
      if (!success) {
        return {
          content: [{ type: "text", text: `Error: Failed to create page at ${dir}/${safeTitle}.md` }],
          details: { success: false, error: "write_failed" },
        };
      }
      
      // Update index.md
      const indexPath = getWikiPath("index.md");
      const indexContent = await readFile(pi, indexPath, signal);
      
      // Add entry to index
      const entryLine = `- [[${params.type === "task" ? "kanban/home" : `${params.type}s/${safeTitle}`}]] — ${params.content.split("\n")[0]?.slice(0, 80) || ""} (tags: ${params.tags.slice(0, 3).join(", ")})\n`;
      
      let newIndexContent = indexContent || "";
      if (newIndexContent) {
        // Find the category section or append to the right section
        const sectionRegex = new RegExp(`## ${params.type.charAt(0).toUpperCase() + params.type.slice(1)}`);
        if (sectionRegex.test(newIndexContent)) {
          newIndexContent = newIndexContent.replace(
            sectionRegex,
            `$&\n${entryLine}`
          );
        } else {
          newIndexContent += `\n## ${params.type.charAt(0).toUpperCase() + params.type.slice(1)}\n${entryLine}`;
        }
      } else {
        newIndexContent = `# Wiki Index\n\n## ${params.type.charAt(0).toUpperCase() + params.type.slice(1)}\n${entryLine}`;
      }
      
      await writeFile(pi, indexPath, newIndexContent, signal);
      
      // Log to log.md
      const logPath = getWikiPath("log.md");
      const logContent = await readFile(pi, logPath, signal);
      
      const logEntry = `\n## [${todayDate()}] create | ${params.title}\n- Created page: [[${params.type}s/${safeTitle}]]\n`;
      
      await writeFile(pi, logPath, (logContent || "") + logEntry, signal);
      
      return {
        content: [{ type: "text", text: `Created page at ${dir}/${safeTitle}.md` }],
        details: { success: true, path: dir, title: params.title },
      };
    },

    renderCall(args, theme, _context) {
      return new Text(
        theme.fg("toolTitle", theme.bold("wiki_create ")) +
        theme.fg("muted", `${args.title} (${args.type})`),
        0, 0
      );
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as { success?: boolean; path?: string; title?: string } | undefined;
      if (!details?.success) {
        const error = result.content[0] as { type: string; text: string };
        return new Text(theme.fg("error", error.text), 0, 0);
      }
      
      return new Text(
        theme.fg("success", "✓ Created ") + theme.fg("accent", details.title),
        0, 0
      );
    },
  });

  // Register the wiki_update tool
  pi.registerTool({
    name: "wiki_update",
    label: "Update Wiki Page",
    description: "Update an existing wiki page. Appends to content or replaces if content starts with '---'.",
    parameters: Type.Object({
      path: Type.String({
        description: "Relative path to the wiki page (e.g., 'concepts/fermentation/lactic-acid-bacteria.md')",
      }),
      content: Type.String({
        description: "New content to append or replace (if starting with '---', replaces entire content)",
      }),
      append: Type.Optional(Type.Boolean({
        description: "Append to existing content instead of replacing (default: true)",
        default: true,
      })),
    }),

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const fullPath = getWikiPath(params.path);
      const existingContent = await readFile(pi, fullPath, signal);
      
      if (!existingContent) {
        return {
          content: [{ type: "text", text: `Error: Page not found at ${params.path}. Use wiki_create to create it.` }],
          details: { success: false, error: "not_found" },
        };
      }
      
      let newContent: string;
      
      if (params.append === false || params.content.startsWith("---")) {
        // Replace entire content
        newContent = params.content;
      } else {
        // Append to existing content
        // Update the updated date in frontmatter
        const updatedDateMatch = existingContent.match(/(updated:\s*\d{4}-\d{2}-\d{2})/);
        const contentWithoutUpdated = updatedDateMatch
          ? existingContent.replace(updatedDateMatch[1], `updated: ${todayDate()}`)
          : existingContent;
        
        newContent = contentWithoutUpdated.trimEnd() + "\n\n" + params.content;
      }
      
      await writeFile(pi, fullPath, newContent, signal);
      
      return {
        content: [{ type: "text", text: `Updated page at ${params.path}` }],
        details: { success: true, path: params.path },
      };
    },

    renderCall(args, theme, _context) {
      return new Text(
        theme.fg("toolTitle", theme.bold("wiki_update ")) +
        theme.fg("muted", `${args.path}`),
        0, 0
      );
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as { success?: boolean; path?: string } | undefined;
      if (!details?.success) {
        const error = result.content[0] as { type: string; text: string };
        return new Text(theme.fg("error", error.text), 0, 0);
      }
      
      return new Text(
        theme.fg("success", "✓ Updated ") + theme.fg("accent", details.path),
        0, 0
      );
    },
  });

  // Register the /wiki command for browsing
  pi.registerCommand("wiki", {
    description: "Browse wiki pages by category or search",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/wiki requires interactive mode", "error");
        return;
      }
      
      const pages = await getWikiPages(pi, ctx);
      const theme = ctx.ui.theme;
      
      // If there's a search query, filter and show results
      if (args && args.trim()) {
        const query = args.toLowerCase();
        const filtered = pages.filter(p => 
          p.title.toLowerCase().includes(query) ||
          p.type.toLowerCase().includes(query) ||
          p.tags.some(t => t.toLowerCase().includes(query))
        );
        
        const lines: string[] = [];
        lines.push(theme.fg("accent", "─".repeat(60)));
        lines.push(theme.fg("text", `Search results for "${args}"`));
        lines.push(theme.fg("accent", "─".repeat(60)));
        lines.push("");
        
        for (const page of filtered.slice(0, 50)) {
          const typeColor = {
            summary: "blue",
            entity: "green",
            concept: "yellow",
            analysis: "magenta",
            task: "red",
          }[page.type] as keyof typeof theme;
          
          const typeLabel = theme.fg(typeColor, `[${page.type}]`);
          const tags = page.tags.slice(0, 3).map(t => theme.fg("dim", `#${t}`)).join(" ");
          const excerpt = page.content.split("\n")[0]?.slice(0, 60) || "";
          
          lines.push(`  ${typeLabel} ${theme.fg("text", page.title)} ${tags}`);
          lines.push(`    ${theme.fg("dim", excerpt)}${excerpt.length === 60 ? "..." : ""}`);
          lines.push("");
        }
        
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }
      
      // No args - show all pages organized by type
      const byType: Record<string, typeof pages> = {};
      for (const page of pages) {
        if (!byType[page.type]) byType[page.type] = [];
        byType[page.type].push(page);
      }
      
      let output = theme.fg("accent", "─".repeat(60)) + "\n";
      output += theme.fg("text", "Wiki Pages by Type") + "\n";
      output += theme.fg("accent", "─".repeat(60)) + "\n\n";
      
      for (const [type, typePages] of Object.entries(byType)) {
        const typeLabel = theme.fg((type === "summary" ? "blue" : 
          type === "entity" ? "green" :
          type === "concept" ? "yellow" :
          type === "analysis" ? "magenta" : "red") as keyof typeof theme, `[${type}]`);
        
        output += `${typeLabel} (${typePages.length} pages)\n`;
        
        for (const page of typePages.slice(0, 20)) {
          const tags = page.tags.slice(0, 3).map(t => `#${t}`).join(" ");
          const excerpt = page.content.split("\n")[0]?.slice(0, 50) || "";
          output += `  - ${page.title} ${tags ? `(${tags})` : ""}\n`;
          output += `    ${excerpt}${excerpt.length === 50 ? "..." : ""}\n`;
        }
        
        if (typePages.length > 20) {
          output += `  ... and ${typePages.length - 20} more\n`;
        }
        output += "\n";
      }
      
      ctx.ui.notify(output, "info");
    },
  });

  // Inject wiki context into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    const pages = await getWikiPages(pi, ctx);
    
    // Get the most relevant pages for context
    const summaries = pages.filter(p => p.type === "summary").slice(0, 5);
    const concepts = pages.filter(p => p.type === "concept").slice(0, 5);
    const entities = pages.filter(p => p.type === "entity").slice(0, 5);
    
    let wikiContext = `\n\n# Available Wiki Knowledge Base\n`;
    wikiContext += `Location: ${WIKI_ROOT}\n`;
    wikiContext += `Total pages: ${pages.length}\n`;
    
    if (summaries.length > 0) {
      wikiContext += `\n## Summary Pages (recent)\n`;
      for (const s of summaries) {
        wikiContext += `- [[${s.title}]] — ${s.content.split("\n")[0]?.slice(0, 60) || ""}...\n`;
      }
    }
    
    if (concepts.length > 0) {
      wikiContext += `\n## Concept Pages\n`;
      for (const c of concepts) {
        wikiContext += `- [[${c.title}]] — ${c.tags.slice(0, 3).join(", ")}\n`;
      }
    }
    
    if (entities.length > 0) {
      wikiContext += `\n## Entity Pages\n`;
      for (const e of entities) {
        wikiContext += `- [[${e.title}]]\n`;
      }
    }
    
    wikiContext += `\n## Available Tools\n`;
    wikiContext += `- wiki_read(path) - Read a wiki page\n`;
    wikiContext += `- wiki_search(query) - Search for pages\n`;
    wikiContext += `- wiki_create(title, type, tags, content, category?) - Create a new page\n`;
    wikiContext += `- wiki_update(path, content, append?) - Update an existing page\n`;
    wikiContext += `- Use /wiki to browse pages interactively\n`;
    
    return {
      systemPrompt: event.systemPrompt + "\n" + wikiContext,
    };
  });

  // Register a shortcut to quickly open the wiki
  pi.registerShortcut("ctrl+w", {
    description: "Open wiki browser",
    handler: async (_event, ctx) => {
      if (ctx.mode !== "tui") return;
      await ctx.sendUserMessage("/wiki");
    },
  });
}