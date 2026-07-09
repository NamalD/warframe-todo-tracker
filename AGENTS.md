# AGENTS.md

This file provides guidance to AI coding agents working in this repository.

## Commit message requirement

**Every commit must reference a GitHub issue** using one of these keywords in the subject line or body:

- `Closes #N`
- `Fixes #N`
- `Resolves #N`

Where `N` is the issue number. Merge commits are exempt.

### Examples

```
fix: add blocked as valid todo status (#59)

Added blocked to the server-side SQLite CHECK constraint
and VALID_STATUSES array.

Closes #59
```

```
feat: add Sentinels to craftable items

Added Sentinels category to prebuild, bringing 16 craftable
sentinels into the items list.

Closes #27
```

### Why

A GitHub Actions workflow (`.github/workflows/commit-check.yml`) runs on every push and rejects commits that don't contain a closing reference. This ensures:

1. All work is linked to a tracked issue
2. The auto-deploy hook fires on issue-closing commits
3. The project board stays in sync with completed work

### One issue per commit

Each commit should close exactly one issue (or a small, related batch). If a commit fixes multiple issues, list each on its own line:

```
Closes #61
Closes #62
```

### Creating issues

If the work you're doing doesn't have an existing issue, create one first with `gh issue create` before committing. All work — bug fixes, features, refactors, and tests — needs an issue.

## Architecture

See `CLAUDE.md` for full architecture documentation, commands, and known gotchas.
