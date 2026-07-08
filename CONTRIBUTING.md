# Warframe TODO Tracker — Contribution Rules

## Git workflow

- Commit and push every code change to `origin` — don't leave work uncommitted or local-only.
- Commit at logical checkpoints rather than one giant commit per task.

## Commit message convention

- Use Conventional Commits style:
  - `feat: <summary>` for new features
  - `fix: <summary>` for bug fixes
  - `chore: <summary>` for tooling/build updates
  - `docs: <summary>` for README/docs
  - `test: <summary>` for test-only changes
- Keep the subject under 72 characters.
- If the commit addresses a tracked issue, reference it in the subject (`fix: add missing getTrackedMods (#12)`) and include a closing keyword in the body (`Closes #12`) so the issue auto-closes and the project board card auto-moves to Done.

## Issue & project board workflow

All work in this repo — whether requested directly or spotted along the way — is tracked as a GitHub issue on the [project board](https://github.com/users/NamalD/projects/4).

### Filing issues

- When a new bug or missing feature is identified (not just when asked to fix something), file an issue immediately rather than waiting for approval. Search existing open/closed issues first to avoid duplicates.
- Every new issue is added to project board #4 (lands in `Todo` automatically).
- Use the existing label set only (`bug`, `enhancement`, `documentation`, `question`, `duplicate`, `invalid`, `wontfix`, `help wanted`, `good first issue`) — don't invent new labels (e.g. no priority/size labels).
- Large features that need breaking down use GitHub sub-issues linked to a parent issue (auto-added to the board), not flat checklists.

### Ready-for-dev bar

Before starting development on any issue, it must contain:

- **Bug reports**: steps to reproduce, expected vs. actual behavior, affected page/component.
- **Feature requests**: a description of the desired behavior and clear acceptance criteria.

If an issue is missing any of this, fill in what can be confidently inferred from the codebase and note it in a comment; for anything genuinely ambiguous, comment with specific questions and wait for a reply. Label the issue `question` while it's blocked on missing info, and remove the label once it's resolved. Don't start coding until the bar is met.

### Board movement

- `Todo`: automatic when an issue is added to the board.
- `In Progress`: set manually when development starts (no assignee needed).
- `Done`: automatic — closing the issue (via a `Closes #N` commit, see above) triggers the board's built-in workflow to move the card and close the issue. No manual card move needed.
