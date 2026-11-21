# Improve the harness

Run this at Deploy, after the review fixes and before the merge.

1. Look at what went wrong on this change:
   - the review's findings
   - what the person corrected: their own messages in this change's Claude Code sessions (`~/.claude/projects/`), and what `docs/STATUS.md` says they agreed to
   - what the checks caught: the end-of-turn hook's errors in those sessions, the pre-commit hook and CI
2. For a mistake that has happened twice, add the correction to AGENTS.md or docs/REVIEW.md, or suggest a change to docs/STANDARDS.md for the person to make. If a tool can catch it, add it to the checks instead.
   - To tell whether it happened before, use the records in `docs/STATUS.md`, not the other folders in `docs/changes/` (AGENTS.md says to leave those unread).
   - Suggest, rather than make, a correction that loosens a check or raises a limit (AGENTS.md, Checks).
3. Remove anything out of date.
4. Record the round in `docs/STATUS.md`: what happened twice and what you changed or suggested, and what happened only once, so the next round can spot a repeat.
5. Improve this file, so that the next round makes a better change, and add what you changed to the round's record in `docs/STATUS.md`. Keep this as the last step.
