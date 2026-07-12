---
name: create-github-issue
description: Create a GitHub issue with AI-generated title, description, labels, and estimate
---

# Create GitHub Issue Skill

This skill creates a new GitHub issue on the Warframe TODO Tracker project board with AI-generated content.

## Parameters

- `type` (required): "feature" or "bug" - Issue type
- `description` (required): Initial idea or description for the issue
- `model` (optional): Model to use for AI generation (defaults to current model)

## Usage

```
/skill:create-github-issue type=feature description="Add dark mode toggle to settings page"
/skill:create-github-issue type=bug description="Items not loading from @wfcd/items after migration"
```

## Process

1. **Read the appropriate issue template** from `.github/ISSUE_TEMPLATE/`:
   - `feature_request.md` for features
   - `bug_report.md` for bugs

2. **Generate issue content using AI** with this prompt:

```
You are a product manager creating a GitHub issue for the Warframe TODO Tracker project (Next.js 14, SQLite, Warframe game data).

**Project context:** Warframe TODO Tracker — a Next.js 14 App Router app for tracking Warframe craftable items, materials, mods, loadouts, and crafting progress. Stack: Next.js 14, SQLite via better-sqlite3, @wfcd/items for game data, Vitest/Playwright testing, Docker deployment on VPS.

**Issue type:** ${type === "feature" ? "Feature request (enhancement)" : "Bug report"}

**Template to follow:** (read from the appropriate .github/ISSUE_TEMPLATE/ file)

**Initial idea/description from user:**
${description}

**Task:** Generate a complete GitHub issue with:
1. A clear, concise **title** (max 80 chars, imperative mood)
2. A detailed **body** following the template above
3. Appropriate **labels** (use template labels + relevant area labels from available: "documentation", "test", "process", "good first issue", "help wanted", "question", "wontfix", "duplicate", "invalid")
4. **Estimation** (size: XS/S/M/L/XL, story points: 1/2/3/5/8, reasoning)

**Output format (JSON only):**
{
  "title": "...",
  "body": "...",
  "labels": ["enhancement", "documentation"],
  "estimate": {
    "size": "S",
    "points": 2,
    "reasoning": "Clear reasoning for the estimate based on complexity, risk, and effort"
  }
}

**Estimation guidelines (Warframe TODO Tracker context):**
- XS (1pt): Trivial change, <30 min (typo fix, config tweak, single-line change)
- S (2pts): Small, well-scoped change, ~1-2 hrs (new API endpoint, single component, simple migration)
- M (3pts): Medium, ~half day (new feature with UI + API, moderate refactor, new test suite)
- L (5pts): Large, ~1-2 days (major feature, significant refactor, new integration, complex migration)
- XL (8pts): Very large, 3+ days (architectural change, major refactor, new subsystem)

Consider: Warframe domain complexity, SQLite migrations, @wfcd/items data handling, Next.js App Router patterns, testing requirements, Docker/VPS deployment impact.
```

3. **Present the generated issue to user** for review (show title, labels, estimate, body preview)

4. **Create the issue** using the `github_create_issue` tool:
   - `title`: Generated title
   - `body`: Generated body
   - `labels`: Comma-separated list of labels

## Output

Returns the created issue number and URL.