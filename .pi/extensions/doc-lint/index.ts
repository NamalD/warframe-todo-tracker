/**
 * Doc-Lint Extension
 *
 * Warns on stale architecture docs by checking for keywords that contradict
 * the current project architecture (as defined in AGENTS.md).
 *
 * Runs on session start and can be triggered manually via /doc-lint.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

// Files/directories to completely exclude from linting
const EXCLUDED_PATHS = [
  "migration-plan.md",
  "schema.md",
  "historical",
  "migrations",
];

// Files that should always be excluded
const EXCLUDED_FILES = [
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "AGENTS.md",
  "CLAUDE.md",
];

// Architecture patterns to detect (stale/deprecated references)
// These patterns are only flagged if they appear in lines that claim to describe
// the current architecture (e.g., lines with "Type:", "Framework:", "Build:", etc.)
const ARCHITECTURE_KEYWORDS = [
  "Type:",
  "Framework:",
  "Backend:",
  "Database:",
  "Build:",
  "Build Requirements",
  "Runtime Requirements",
  "Application Profile",
  "Architecture",
  "Stack:",
  "Tech Stack:",
  "Package manager:",
  "Dependencies:",
];

const STALE_PATTERNS = [
  {
    pattern: /react\s+routing|react-router|react\s+router/gi,
    message: "React Router is deprecated — this project uses Next.js App Router",
    severity: "warning",
  },
  {
    pattern: /client-side\s+spa|spa.*client-side/gi,
    message: "Client-side SPA is outdated — this project uses server-rendered Next.js",
    severity: "warning",
  },
  {
    pattern: /npm\s+(ci|run\s+build)|"npm"/gi,
    message: "npm is deprecated — this project uses Yarn 4",
    severity: "warning",
  },
  {
    pattern: /vite\s+build|vite\s+dev|vite\s+serve/gi,
    message: "Vite is deprecated — this project uses Next.js for builds",
    severity: "warning",
  },
  {
    pattern: /create-react-app|craco|webpack\s+config/gi,
    message: "Create React App/Webpack config is outdated — this project uses Next.js",
    severity: "info",
  },
  {
    pattern: /express\s+server|fastify|koa|@openapi/gi,
    message: "Express/fastify/koa is deprecated — this project uses Next.js API Routes",
    severity: "info",
  },
  {
    pattern: /postgresql|postgres|mysql|mariadb|mongodb|firebase|supabase/gi,
    message: "External database detected — this project uses SQLite",
    severity: "info",
  },
  {
    pattern: /jwt\s+auth|passport|oauth|cognito|auth0/gi,
    message: "External auth detected — this project uses session-based JWT auth via jose",
    severity: "info",
  },
];

interface LintIssue {
  file: string;
  line: number;
  column: number;
  pattern: string;
  message: string;
  severity: "warning" | "info";
}

interface LintResult {
  issues: LintIssue[];
  filesScanned: number;
  totalIssues: number;
  warnings: number;
  infos: number;
}

/**
 * Check if a path should be excluded from linting
 */
function isExcluded(path: string): boolean {
  const lowerPath = path.toLowerCase();
  const lowerBasename = extname(path) ? path.split("/").pop() : path;

  // Check excluded files
  if (EXCLUDED_FILES.includes(lowerBasename ?? "")) {
    return true;
  }

  // Check excluded paths
  for (const excluded of EXCLUDED_PATHS) {
    if (lowerPath.includes(excluded.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a line is describing the current architecture
 * (vs. historical context, examples, or migration notes)
 */
function isArchitectureLine(line: string): boolean {
  // Check if line contains architecture keywords
  for (const keyword of ARCHITECTURE_KEYWORDS) {
    if (line.includes(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if file has doc-lint: ignore marker
 */
function shouldIgnoreFile(content: string): boolean {
  return content.includes("<!-- doc-lint: ignore -->") || content.includes("<!--ignore-lint-->");
}

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir: string, excludes: string[] = []): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      // Skip excluded directories
      if (entry.isDirectory()) {
        if (!excludes.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        // Only include .md files
        if (extname(entry.name) === ".md") {
          if (!EXCLUDED_FILES.includes(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Check a single markdown file for stale patterns
 */
function checkFile(filePath: string, cwd: string): LintIssue[] {
  const issues: LintIssue[] = [];

  try {
    const content = readFileSync(filePath, "utf-8");

    // Check for ignore marker
    if (shouldIgnoreFile(content)) {
      return issues;
    }

    // Check if file should be excluded
    if (isExcluded(filePath)) {
      return issues;
    }

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Only check lines that describe current architecture
      if (!isArchitectureLine(line)) {
        continue;
      }

      for (const { pattern, message, severity } of STALE_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          // Find column position
          const matchIndex = line.indexOf(match[0]);

          issues.push({
            file: filePath.replace(cwd + "/", ""),
            line: i + 1,
            column: matchIndex + 1,
            pattern: match[0],
            message,
            severity,
          });
        }
      }
    }
  } catch (e) {
    // File might be inaccessible, skip it
  }

  return issues;
}

/**
 * Lint all documentation files in the project
 */
export async function lintDocs(pi: ExtensionAPI, ctx: ExtensionContext): Promise<LintResult> {
  const cwd = ctx.cwd;
  const docsDir = join(cwd, "docs");

  const issues: LintIssue[] = [];
  let filesScanned = 0;

  // Check if docs directory exists
  try {
    statSync(docsDir);
  } catch {
    return {
      issues: [],
      filesScanned: 0,
      totalIssues: 0,
      warnings: 0,
      infos: 0,
    };
  }

  // Find all markdown files in docs
  const mdFiles = findMarkdownFiles(docsDir);

  for (const file of mdFiles) {
    const fileIssues = checkFile(file, cwd);
    issues.push(...fileIssues);
    filesScanned++;
  }

  const warnings = issues.filter((i) => i.severity === "warning").length;
  const infos = issues.filter((i) => i.severity === "info").length;

  return {
    issues,
    filesScanned,
    totalIssues: issues.length,
    warnings,
    infos,
  };
}

/**
 * Format lint results for display
 */
function formatResults(result: LintResult): string {
  const lines: string[] = [];

  lines.push("Doc Lint Report");
  lines.push(`  Files scanned: ${result.filesScanned}`);
  lines.push(`  Issues found: ${result.totalIssues} (${result.warnings} warnings, ${result.infos} info)`);
  lines.push("");

  if (result.totalIssues === 0) {
    lines.push("  No stale architecture references found");
    return lines.join("\n");
  }

  // Group by severity
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const infos = result.issues.filter((i) => i.severity === "info");

  if (warnings.length > 0) {
    lines.push("Warnings:");
    for (const issue of warnings) {
      lines.push(`  ${issue.file}:${issue.line}:${issue.column}`);
      lines.push(`    Found: "${issue.pattern}"`);
      lines.push(`    ${issue.message}`);
    }
    lines.push("");
  }

  if (infos.length > 0) {
    lines.push("Info:");
    for (const issue of infos) {
      lines.push(`  ${issue.file}:${issue.line}:${issue.column}`);
      lines.push(`    Found: "${issue.pattern}"`);
      lines.push(`    ${issue.message}`);
    }
  }

  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  // Run lint on session start
  pi.on("session_start", async (_event, ctx) => {
    const result = await lintDocs(pi, ctx);

    if (result.totalIssues > 0) {
      ctx.ui.notify(`Stale doc references found — run /doc-lint for details`, "warning");
    }
  });

  // Register /doc-lint command
  pi.registerCommand("doc-lint", {
    description: "Check docs for stale architecture references",
    handler: async (_args, ctx) => {
      const result = await lintDocs(pi, ctx);
      const report = formatResults(result);

      ctx.ui.notify(report, result.totalIssues > 0 ? "warning" : "info");
      return result;
    },
  });

  // Register a tool for programmatic access
  pi.registerTool({
    name: "doc_lint",
    label: "Doc Lint",
    description: "Check documentation files for stale architecture references",
    parameters: Type.Object({
      path: Type.Optional(Type.String({
        description: "Path to check (default: docs/ directory)",
      })),
    }),

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      let cwd = ctx.cwd;

      if (params.path) {
        cwd = params.path;
      }

      const docsPath = join(cwd, "docs");

      try {
        const mdFiles = findMarkdownFiles(docsPath);
        const issues: LintIssue[] = [];

        for (const file of mdFiles) {
          const fileIssues = checkFile(file, cwd);
          issues.push(...fileIssues);
        }

        const warnings = issues.filter((i) => i.severity === "warning").length;
        const infos = issues.filter((i) => i.severity === "info").length;

        const output = issues.map((i) => {
          return `${i.file}:${i.line}:${i.column} [${i.severity.toUpperCase()}] ${i.pattern}\n  ${i.message}`;
        }).join("\n\n") || "No issues found";

        return {
          content: [{ type: "text", text: output }],
          details: {
            success: true,
            filesScanned: mdFiles.length,
            totalIssues: issues.length,
            warnings,
            infos,
          },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e}` }],
          details: { success: false, error: String(e) },
        };
      }
    },

    renderCall(args, theme, _context) {
      return new Text(
        theme.fg("toolTitle", theme.bold("doc_lint ")) +
        theme.fg("muted", `checking documentation for stale references`),
        0, 0
      );
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as { success?: boolean; filesScanned?: number; totalIssues?: number; warnings?: number; infos?: number } | undefined;
      if (!details?.success) {
        return new Text(theme.fg("error", "Linting failed"), 0, 0);
      }

      const count = details.totalIssues ?? 0;
      const color = count > 0 ? "warning" : "success";
      const emoji = count > 0 ? "⚠️" : "✅";

      return new Text(
        theme.fg(color, `${emoji} ${details.filesScanned} files, ${count} issues (${details.warnings} warnings, ${details.infos} info)`),
        0, 0
      );
    },
  });
}