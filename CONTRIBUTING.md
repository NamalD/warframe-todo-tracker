# Contribution Rules

This is the canonical guide for all changes to this repository. Humans and AI agents alike must follow these rules. For agent-specific guidance (project context, commands, gotchas, CE skills), see [AGENTS.md](./AGENTS.md).

## Workflow

Every repository modification ships through the same sequence:

1. Ensure the main checkout is clean (`git status` shows no modifications).
2. Create a fresh worktree from `main`: `git worktree add ./worktrees/<branch-name> -b <branch-name> main`.
3. `cd` into the worktree and run `yarn install` to restore the Yarn PnP cache (the worktree does not inherit `.yarn/cache` from the main checkout).
4. `cd` into the worktree and make changes there.
4. Commit with an issue reference.
5. Push the branch.
6. Open a PR.
7. Enable gated squash auto-merge.
8. After the PR is merged, clean up: `git worktree remove ./worktrees/<branch-name>` and `git branch -d <branch-name>`.

Never make changes directly in the main checkout. Never push directly to `main`. Never stop after a local commit or pushed branch without a PR. Never manually merge or disable required checks.

### Worktree conventions

- **Location:** `./worktrees/<branch-name>` (relative to the main checkout).
- **Base:** always create from `main`, not from the current branch.
- **Naming:** use a short descriptive branch name (`fix/login-loop`, `feat/coda-weapons`, `docs/align-workflow-docs`).
- **Cleanup:** remove the worktree and delete the branch after the PR is merged. If the worktree was already removed by `--delete-branch-on-merge`, just delete the local branch.
- **Dirty main:** if the main checkout has uncommitted changes, stash or commit them before creating a worktree. Do not discard work silently.
- **Existing worktree:** if `./worktrees/<branch-name>` already exists, stop and ask before overwriting or reusing it.

## Issue requirements

An issue is required **before making any edit** for:

- Product behavior changes
- Bug fixes
- Refactors
- Dependency or tooling changes
- Configuration changes
- CI / deployment changes
- Operations changes
- Documentation changes

Issue-exempt work:

- Read-only investigation or review
- Work solely categorized as Process, Compound, Review, or pure documentation maintenance that has no runtime, config, or operational effect

If the classification is mixed or uncertain, stop and get a decision before editing.

### Ready-for-dev bar

Before starting development on any issue, it must contain:

- **Bug reports**: steps to reproduce, expected vs. actual behavior, affected page/component.
- **Feature requests**: a description of the desired behavior and clear acceptance criteria.

If an issue is missing any of this, fill in what can be confidently inferred from the codebase and note it in a comment; for anything genuinely ambiguous, comment with specific questions and wait for a reply. Label the issue `question` while it's blocked on missing info, and remove the label once it's resolved. Don't start coding until the bar is met.

## Project board

The GitHub Project board is the source of truth for what's being worked on. Every issue on the board must have its status column match reality.

- When picking up an issue, move it from **Todo → In Progress** before writing any code.
- When committing code that closes an issue, use `Closes #N` — GitHub automation auto-moves the card to **Done** on merge to main.
- After every commit or push, verify the board state matches reality.
- If an open issue exists but isn't on the project board, add it (Todo or In Progress as appropriate) — and set its **Priority** and **Estimate** fields (see below).
- Every board item carries **Priority** (P0–P3) and **Estimate** (XS/S/M/L/XL) single-select fields. Pick up work highest-priority-first, breaking ties toward the smaller estimate. Priority weighs data safety first (loss/corruption bugs), then everyday user value, then speculative scope; Estimate is t-shirt sizing (XS ≈ one-liner, S ≈ a focused session, M ≈ a day or two, L ≈ multi-day, XL ≈ open-ended multi-week).

### Reading the board

The relevant board is **GitHub Project #4 "Warframe Item Tracker"** (`gh project item-list 4 --owner @me`). The other project, **"Iris"** (project #5), is an unrelated email-assistant project — ignore it.

- **Project ID string:** `PVT_kwHOACqRis4Bc2Fb` (use with `--project-id` flag for item-edit operations)
- **Quick reference for adding items:** `gh project item-add 4 --owner @me --url <issue-url>`
- **`gh project item-list` truncates by default.** Always pass `--limit 1000` or you'll only see a subset of items and will wrongly conclude columns are empty / issues are missing.
- To get a clean status+title dump:
  ```bash
  gh project item-list 4 --owner @me --limit 1000 --format json \
    | jq -r '.items[] | "\(.status)\t\(.content.number // "DRAFT")\t\(.title)"'
  ```
- To rank the backlog by priority/estimate (what to pick up next):
  ```bash
  gh project item-list 4 --owner @me --limit 1000 --format json \
    | jq -r '.items[] | select(.status == "Todo") | "\(.priority // "-")\t\(.estimate // "-")\t#\(.content.number)\t\(.title)"' | sort
  ```
- To set Priority/Estimate on a board item, use `gh project item-edit --id <item-id> --project-id PVT_kwHOACqRis4Bc2Fb --field-id <field-id> --single-select-option-id <option-id>` with these IDs (stable, created 2026-07-11):
  - **Priority** field `PVTSSF_lAHOACqRis4Bc2FbzhXrT4s`: P0=`68c09189`, P1=`83c82297`, P2=`379c4132`, P3=`0e04d828`
  - **Estimate** field `PVTSSF_lAHOACqRis4Bc2FbzhXrT8A`: XS=`5c5e23d3`, S=`92fa8114`, M=`d7260a84`, L=`5da64983`, XL=`e2407bc6`
- The `read:project` OAuth scope is required; if `gh project` errors with `missing required scopes`, run `gh auth refresh -h github.com -s read:project`. Editing fields additionally needs the `project` (write) scope.
- Note: board items generally have **no assignee** (single-developer project) — that's expected, not a gap to fix.

## Commit conventions

Every feature/bug-fix/refactor/config/ops/docs commit must reference a GitHub issue using one of these keywords in the body: `Closes #N`, `Fixes #N`, or `Resolves #N`. This ensures the Project board card auto-moves to Done on merge.

Format:
```
[Tag] Short description (#issue-number)

- Bullet points of what was done

Closes #N
```

Process commits (`[Process]`, `[Compound]`, `[Review]`) are exempt — they don't close issues and don't need a reference.

If the work doesn't have an existing issue, create one first with `gh issue create` before committing.

## Stop conditions

Stop rather than improvise when:

1. The work type is unclear and issue exemption cannot be determined.
2. A required issue is absent, incomplete, already claimed, or has conflicting PR/branch signals.
3. GitHub/project authentication prevents issue creation, board triage, push, PR creation, or auto-merge.
4. Auto-merge is disabled or the required check is absent — do not bypass by manually merging or pushing `main`.
5. The working tree contains unrelated modifications that cannot safely be separated.
6. Required local validation fails.
7. PR checks fail or auto-merge is not actually queued.
8. A requested operation is destructive or changes repository visibility; explicit sign-off is required.
9. A supposedly issue-exempt documentation task expands into config, runtime, or operational changes.

## Deployment

The app is deployed to a VPS via Docker Compose using pull-based deploys — CI never connects to the VPS:

1. Test Suite runs on every PR and push to main
2. On test pass on main, the "Deploy" workflow builds the Docker image and pushes it to GHCR (`ghcr.io/namald/warframe-todo-tracker:latest`)
3. Watchtower (a service in `docker-compose.yml`) polls GHCR every 60s from the VPS, restarts the app container when the image changes, and prunes the old image

No repository secrets are needed for deployment — the workflow pushes to GHCR with the built-in `GITHUB_TOKEN`. App secrets live on the VPS in a `.env` file next to `docker-compose.yml`, which Docker Compose reads automatically:

| `.env` variable | Description |
|--------|-------------|
| `PASSWORD` | Warframe Tracker password (passed to container) |
| `SESSION_SECRET` | Random string for HMAC session signing |

### Setting up the VPS (one-time)

1. Install Docker and add your user to the `docker` group
2. Clone the repo: `git clone https://github.com/NamalD/warframe-todo-tracker ~/warframe-todo-tracker`
3. Create `~/warframe-todo-tracker/.env` containing `PASSWORD=...` and `SESSION_SECRET=...`
4. Authenticate to GHCR so the private image can be pulled: `docker login ghcr.io -u namald` with a personal access token that has `read:packages` (skip and remove the `config.json` mount from the watchtower service if the package is public)
5. Start everything: `docker compose up -d`

Image updates are fully automatic from then on. Changes to `docker-compose.yml` itself are the one thing that still needs a manual `git pull && docker compose up -d` on the VPS.

## Validation

Before shipping, run the validation appropriate to the change:

- **Code/refactor:** targeted tests, `yarn vitest run`, and build as appropriate.
- **UI:** relevant Playwright tests with content assertions.
- **CI/config/ops:** parser/config validation, `docker compose config`, Docker build where applicable.
- **Documentation:** link/command/config consistency checks.

Never proceed to shipping with failed required validation.
