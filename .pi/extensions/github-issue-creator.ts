/**
 * GitHub Issue Creator Extension
 *
 * Creates a new GitHub issue on the project board with AI-generated title/description,
 * template selection (bug/feature), and AI-powered estimation/sizing.
 *
 * Usage: /create-issue [feature|bug] "initial description or idea"
 */

import type { ExtensionAPI, ExtensionCommandContext, ModelInfo } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

const REPO = "NamalD/warframe-todo-tracker";

type IssueType = "feature" | "bug";

interface IssueTemplate {
	name: string;
	about: string;
	labels: string[];
	body: string;
}

interface AIGeneratedIssue {
	title: string;
	body: string;
	labels: string[];
	template: IssueType;
	estimate: {
		size: "XS" | "S" | "M" | "L" | "XL";
		points: number;
		reasoning: string;
	};
}

const IssueTypeSchema = StringEnum(["feature", "bug"] as const, {
	description: "Type of issue to create",
});

const CreateIssueParams = Type.Object({
	type: Type.Optional(IssueTypeSchema),
	initialIdea: Type.Optional(Type.String({ description: "Initial idea or description for the issue" })),
});

const TEMPLATES: Record<IssueType, IssueTemplate> = {
	feature: {
		name: "Feature request",
		about: "New feature or request",
		labels: ["enhancement"],
		body: `### Description



### Acceptance criteria

- [ ]
- [ ]

### Estimate

- **Size:** \${size}
- **Points:** \${points}
- **Reasoning:** \${reasoning}`,
	},
	bug: {
		name: "Bug report",
		about: "Something isn't working",
		labels: ["bug"],
		body: `### Steps to reproduce



### Expected behavior



### Actual behavior



### Affected area (page/component)



### Estimate

- **Size:** \${size}
- **Points:** \${points}
- **Reasoning:** \${reasoning}`,
	},
};

function getCurrentModel(pi: ExtensionAPI): ModelInfo | undefined {
	const models = pi.getModels();
	const activeModel = pi.getActiveModel();
	return models.find((m) => m.id === activeModel?.id);
}

async function generateIssueWithAI(
	pi: ExtensionAPI,
	type: IssueType,
	initialIdea: string,
	model: ModelInfo,
): Promise<AIGeneratedIssue> {
	const template = TEMPLATES[type];

	const prompt = `You are a product manager creating a GitHub issue for the Warframe TODO Tracker project (Next.js 14, SQLite, Warframe game data).

**Project context:** Warframe TODO Tracker — a Next.js 14 App Router app for tracking Warframe craftable items, materials, mods, loadouts, and crafting progress. Stack: Next.js 14, SQLite via better-sqlite3, @wfcd/items for game data, Vitest/Playwright testing, Docker deployment on VPS.

**Issue type:** ${type === "feature" ? "Feature request (enhancement)" : "Bug report"}
**Template to follow:**
\`\`\`markdown
${template.body}
\`\`\`

**Initial idea/description from user:**
${initialIdea || "(none provided — create a sensible issue from the project context)"}

**Task:** Generate a complete GitHub issue with:
1. A clear, concise **title** (max 80 chars, imperative mood)
2. A detailed **body** following the template above
3. Appropriate **labels** (use template labels + any relevant area labels like "frontend", "backend", "database", "testing", "docs", "ci", "dependencies")
4. **Estimation** (size: XS/S/M/L/XL, story points: 1/2/3/5/8, reasoning)

**Output format (JSON only, no markdown):**
\`\`\`json
{
  "title": "...",
  "body": "...",
  "labels": ["enhancement", "frontend"],
  "estimate": {
    "size": "S",
    "points": 2,
    "reasoning": "Clear reasoning for the estimate based on complexity, risk, and effort"
  }
}
\`\`\`

**Estimation guidelines (Warframe TODO Tracker context):**
- XS (1pt): Trivial change, <30 min (typo fix, config tweak, single-line change)
- S (2pts): Small, well-scoped change, ~1-2 hrs (new API endpoint, single component, simple migration)
- M (3pts): Medium, ~half day (new feature with UI + API, moderate refactor, new test suite)
- L (5pts): Large, ~1-2 days (major feature, significant refactor, new integration, complex migration)
- XL (8pts): Very large, 3+ days (architectural change, major refactor, new subsystem)

Consider: Warframe domain complexity, SQLite migrations, @wfcd/items data handling, Next.js App Router patterns, testing requirements, Docker/VPS deployment impact.`;

	try {
		const response = await pi.askAI({
			model: model.id,
			messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
			temperature: 0.3,
			maxTokens: 3000,
			jsonMode: true,
		});

		const content = response.content[0];
		if (content.type !== "text") {
			throw new Error("AI response was not text");
		}

		const parsed = JSON.parse(content.text) as AIGeneratedIssue;

		// Validate required fields
		if (!parsed.title || !parsed.body || !parsed.estimate) {
			throw new Error("AI response missing required fields");
		}

		// Validate estimate
		const validSizes = ["XS", "S", "M", "L", "XL"] as const;
		const validPoints = [1, 2, 3, 5, 8];
		if (!validSizes.includes(parsed.estimate.size) || !validPoints.includes(parsed.estimate.points)) {
			throw new Error("Invalid estimate values from AI");
		}

		return {
			...parsed,
			template: type,
		};
	} catch (error) {
		throw new Error(`AI generation failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function confirmWithUser(
	ctx: ExtensionCommandContext,
	issue: AIGeneratedIssue,
): Promise<{ confirmed: boolean; edits?: Partial<AIGeneratedIssue> }> {
	const template = TEMPLATES[issue.template];

	const preview = `**Title:** ${issue.title}

**Labels:** ${issue.labels.join(", ")}

**Estimate:** ${issue.estimate.size} (${issue.estimate.points}pts) — ${issue.estimate.reasoning}

---

**Body preview:**
${issue.body.slice(0, 500)}${issue.body.length > 500 ? "..." : ""}`;

	const confirmed = await ctx.ui.confirm("Create Issue?", preview);

	if (!confirmed) {
		return { confirmed: false };
	}

	// Offer to edit title/body
	const editTitle = await ctx.ui.confirm("Edit title?", `Current: "${issue.title}"`);
	let newTitle = issue.title;
	if (editTitle) {
		const input = await ctx.ui.input("New title:", { placeholder: issue.title });
		if (input) newTitle = input;
	}

	const editBody = await ctx.ui.confirm("Edit body?", "Open editor for full body?");
	let newBody = issue.body;
	if (editBody) {
		const edited = await ctx.ui.editor("Edit issue body", issue.body);
		if (edited) newBody = edited;
	}

	const editLabels = await ctx.ui.confirm("Edit labels?", `Current: ${issue.labels.join(", ")}`);
	let newLabels = issue.labels;
	if (editLabels) {
		const input = await ctx.ui.input("Labels (comma-separated):", {
			placeholder: issue.labels.join(", "),
		});
		if (input) newLabels = input.split(",").map((l) => l.trim()).filter(Boolean);
	}

	const editEstimate = await ctx.ui.confirm("Edit estimate?", `Current: ${issue.estimate.size} (${issue.estimate.points}pts)`);
	let newEstimate = issue.estimate;
	if (editEstimate) {
		const sizeOptions = ["XS", "S", "M", "L", "XL"] as const;
		const size = await ctx.ui.select("Size:", sizeOptions.map((s) => ({ value: s, label: s })));
		const pointsOptions = [1, 2, 3, 5, 8];
		const points = await ctx.ui.select("Points:", pointsOptions.map((p) => ({ value: String(p), label: String(p) })));
		const reasoning = await ctx.ui.input("Reasoning:", { placeholder: issue.estimate.reasoning });

		if (size && points) {
			newEstimate = { size, points: Number(points), reasoning: reasoning || issue.estimate.reasoning };
		}
	}

	return {
		confirmed: true,
		edits: {
			title: newTitle,
			body: newBody,
			labels: newLabels,
			estimate: newEstimate,
		},
	};
}

async function createGitHubIssue(pi: ExtensionAPI, cwd: string, issue: AIGeneratedIssue): Promise<{ number: number; url: string }> {
	const template = TEMPLATES[issue.template];

	// Replace template placeholders with AI estimate
	const bodyWithEstimate = template.body
		.replace(/\$\{size\}/g, issue.estimate.size)
		.replace(/\$\{points\}/g, String(issue.estimate.points))
		.replace(/\$\{reasoning\}/g, issue.estimate.reasoning);

	// Use the AI-generated body but ensure template structure is preserved
	const finalBody = issue.body.includes("### Estimate") ? issue.body : bodyWithEstimate;

	const args = [
		"issue",
		"create",
		"--repo",
		REPO,
		"--title",
		issue.title,
		"--body",
		finalBody,
		...issue.labels.flatMap((label) => ["--label", label]),
	];

	const result = await pi.exec("gh", args, { cwd, timeout: 30_000 });

	if (result.code !== 0) {
		throw new Error(`gh issue create failed: ${result.stderr}`);
	}

	// gh issue create outputs the URL to stdout
	const url = result.stdout.trim();
	const match = url.match(/\/issues\/(\d+)/);
	const number = match ? parseInt(match[1], 10) : 0;

	return { number, url };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("create-issue", {
		description: "Create a GitHub issue with AI-generated title/description/estimate",
		getArgumentCompletions: (prefix) => {
			const types = ["feature", "bug"];
			return types.filter((t) => t.startsWith(prefix)).map((t) => ({ value: t, label: t }));
		},
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/create-issue requires TUI mode", "error");
				return;
			}

			// Parse arguments
			const parts = args.trim().split(/\s+/);
			const typeArg = parts[0] as IssueType | undefined;
			const initialIdea = parts.slice(1).join(" ");

			// Determine issue type
			let type: IssueType;
			if (typeArg === "feature" || typeArg === "bug") {
				type = typeArg;
			} else {
				const selected = await ctx.ui.select("Issue type:", [
					{ value: "feature", label: "Feature request (enhancement)" },
					{ value: "bug", label: "Bug report" },
				]);
				if (!selected) {
					ctx.ui.notify("Cancelled", "info");
					return;
				}
				type = selected as IssueType;
			}

			// Get initial idea if not provided
			let idea = initialIdea;
			if (!idea) {
				const input = await ctx.ui.input(`Describe the ${type}:`, {
					placeholder: "Brief description or leave empty for AI to suggest based on project context",
				});
				if (input === undefined) {
					ctx.ui.notify("Cancelled", "info");
					return;
				}
				idea = input;
			}
			
			// Get current model
			const model = getCurrentModel(ctx.modelRegistry);
			if (!model) {
				ctx.ui.notify("No active model available", "error");
				return;
			}

			ctx.ui.notify("Generating issue with AI...", "info");

			// Generate issue with AI
			let generatedIssue: AIGeneratedIssue;
			try {
				generatedIssue = await generateIssueWithAI(pi, type, idea, model);
			} catch (error) {
				ctx.ui.notify(`AI generation failed: ${error}`, "error");
				return;
			}

			// Confirm with user
			const confirmation = await confirmWithUser(ctx, generatedIssue);
			if (!confirmation.confirmed) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}

			// Apply edits
			const finalIssue: AIGeneratedIssue = {
				...generatedIssue,
				...confirmation.edits,
			};

			ctx.ui.notify("Creating GitHub issue...", "info");

			// Create the issue
			try {
				const result = await createGitHubIssue(pi, ctx.cwd, finalIssue);
				ctx.ui.notify(`Created issue #${result.number}: ${result.url}`, "success");
			} catch (error) {
				ctx.ui.notify(`Failed to create issue: ${error}`, "error");
			}
		},
	});
}