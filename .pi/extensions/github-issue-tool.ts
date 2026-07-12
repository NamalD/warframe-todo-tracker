/**
 * GitHub Issue Creator Tool
 *
 * Creates a GitHub issue on the Warframe TODO Tracker project board.
 * Used by the create-github-issue skill.
 */

import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const REPO = "NamalD/warframe-todo-tracker";

interface CreateIssueParams {
	title: string;
	body: string;
	labels: string[];
}

const CreateIssueParamsSchema = Type.Object({
	title: Type.String({ description: "Issue title (max 80 chars, imperative mood)" }),
	body: Type.String({ description: "Full issue body in markdown" }),
	labels: Type.Array(Type.String(), { description: "Labels to apply" }),
});

async function createGitHubIssue(pi: ExtensionAPI, cwd: string, params: CreateIssueParams): Promise<{ number: number; url: string }> {
	const args = [
		"issue",
		"create",
		"--repo",
		REPO,
		"--title",
		params.title,
		"--body",
		params.body,
		...params.labels.flatMap((label) => ["--label", label]),
	];

	const result = await pi.exec("gh", args, { cwd, timeout: 30_000 });

	if (result.code !== 0) {
		throw new Error(`gh issue create failed: ${result.stderr}`);
	}

	const url = result.stdout.trim();
	const match = url.match(/\/issues\/(\d+)/);
	const number = match ? parseInt(match[1], 10) : 0;

	return { number, url };
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "github_create_issue",
		label: "Create GitHub Issue",
		description: "Creates a GitHub issue on NamalD/warframe-todo-tracker with the given title, body, and labels",
		parameters: CreateIssueParamsSchema,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const result = await createGitHubIssue(pi, ctx.cwd, params);
				return {
					content: [{ type: "text", text: `Created issue #${result.number}: ${result.url}` }],
					details: { number: result.number, url: result.url },
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `Failed to create issue: ${error instanceof Error ? error.message : String(error)}` }],
					isError: true,
				};
			}
		},
	});
}