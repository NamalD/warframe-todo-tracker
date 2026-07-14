---
problem_type: pattern
category: testing
tags: [project-board, github-project, ids, caching, board-discipline]
date: 2026-07-14
issue: #181
---

# Cache GitHub Project IDs to avoid lookup round-trips

## Problem
Agents working on the repo had to run `gh project list` to discover the project number and field/option IDs every time, instead of having them cached.

## Root Cause
The project IDs (number, project ID, status field ID, option IDs) were not recorded anywhere stable in the repo.

## Solution
Add the GitHub Project block to `AGENTS.md`:

```markdown
- **GitHub Project**: owner=`NamalD`, project=`Warframe Item Tracker`, number=`4`, project ID=`PVT_kwHOACqRis4Bc2Fb`
  - Status field ID: `PVTSSF_lAHOACqRis4Bc2FbzhXb60w`
  - Status option IDs: Todo=`f75ad846`, In Progress=`47fc9ee4`, Done=`98236657`
```

This gives agents all IDs needed for `gh project item-add`, `gh project item-edit`, and status transitions without any lookup calls.

## Prevention
When a new GitHub Project is created, add its IDs to `AGENTS.md` immediately.
