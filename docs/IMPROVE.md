# Improve the harness

Run this at Deploy, after the review fixes and before the merge. It changes only the harness. If review findings are still open, say so first and leave them to the review fixes.

1. Look at what went wrong on this change: the review's findings, what the person corrected and what the checks caught. Look in:
   - the review's report and the review sections of docs/STATUS.md
   - the person's own messages in the coding agent's session logs, for anything they had to correct or say more than once. Claude Code keeps one `.jsonl` file per session in `~/.claude/projects/`, in the folder named after this project's path
   - the hook results and failed checks in those logs, and anything the agent says it got wrong
2. For a mistake that has happened twice, in this change or across changes, add the correction to AGENTS.md or docs/REVIEW.md, or suggest a change to docs/STANDARDS.md for the person to make. If a tool can catch it, add it to the checks instead. Check Seen once below for earlier times.
3. Add each mistake that has happened only once to Seen once, with the change it came from and the fix you'd make if it comes back. Take out any that became a rule.
4. Remove anything out of date, in the harness docs and in docs/STATUS.md, such as a finding still marked open after it was fixed.
5. Say in docs/STATUS.md what this run changed.
6. Improve this file, so that the next round makes a better change. Keep this as the last step.

## Seen once

- **dark-mode, lost work:** while proving a test fails, `git checkout --` restored a file from the last commit and wiped the new code in it. The owner commits at the end, so the tree holds work git doesn't have. Fix if it comes back: undo a deliberate break by reverting your own edit or from a copy, never through git.
- **dark-mode, wrong baseline:** the plan said to compare light mode with `main`, but the local `main` has no app. The build used the commit the branch started from. Fix if it comes back: plans name the branch's starting commit, from `git merge-base`, as the baseline.
- **dark-mode, test data clash:** two end-to-end tests on the same worker added a deal with the same name, and one found the other's. Fix if it comes back: each test names its records after itself.
