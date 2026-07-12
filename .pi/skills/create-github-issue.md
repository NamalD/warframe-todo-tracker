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

1. Selects the appropriate issue template (feature_request.md or bug_report.md)
2. Generates title, body, labels, and estimate using AI with project context
3. Presents the generated issue for review
4. Creates the issue via `gh` CLI

## Output

Returns the created issue number and URL.