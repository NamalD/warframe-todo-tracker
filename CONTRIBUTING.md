# Warframe TODO Tracker — Contribution Rules

## Git commit/push requirement

Every code change made for this project MUST be committed to git and pushed to the remote repository. Scratch-only and workspace-only outputs are not acceptable.

For any task affecting this repo:
1. Work directly in `/tmp/warframe-todo-tracker/` or the assigned worktree.
2. Stage, commit, and push changes before marking the task complete.
3. If `git push` fails, at minimum commit locally and report the failure in a kanban comment before blocking.
4. Verify the commit is present in `github.com/NamalD/warframe-todo-tracker` using `git status`, `git log`, and remote branch state before completing.

## Commit message convention

- Use Conventional Commits style:
  - `feat: <summary>` for new features
  - `fix: <summary>` for bug fixes
  - `chore: <summary>` for tooling/build updates
  - `docs: <summary>` for README/docs
- Keep the subject under 72 characters.
- Include the task id when known: `feat(t_f6894e05): bootstrap React Router app shell`

## Blocker message template

If a task is complete in every way except git/push, add this comment and block:

> AUDIT FLAG: This task does not show committed and pushed changes in github.com/NamalD/warframe-todo-tracker. Scratch/workspace-only outputs are not acceptable. Required actions: commit to git, push to remote, verify with `git status`. Describe what is missing before unblocking.
