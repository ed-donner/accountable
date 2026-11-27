# Improve the harness

Run this at Deploy, after the review fixes and before the merge.

1. Look at what went wrong on this change: the review's findings, what the person corrected and what the checks caught.
   - Add the review's findings to `docs/STATUS.md` if they aren't there, numbered on from the last.
   - The plan's own corrections during Build are in `git log -p main..HEAD -- docs/changes/<branch name>/`.
   - Ask the person what they corrected and what the checks caught. Neither is kept in the repo.
2. For a mistake that has happened twice, add the correction to AGENTS.md or docs/REVIEW.md, or suggest a change to docs/STANDARDS.md for the person to make. If a tool can catch it, add it to the checks instead. Look for the first time in the earlier findings in `docs/STATUS.md`. A correction for AGENTS.md goes under "Mistakes made twice", naming its findings.
3. Remove anything out of date. Time `npm run check` and `npm run check:quick`, and compare them with `AGENTS.md` and `docs/STATUS.md`.
4. Note in `docs/STATUS.md` what this round changed.
5. Improve this file, so that the next round makes a better change. Keep this as the last step.
