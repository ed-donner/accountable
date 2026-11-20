# Improve the harness

Run this at Deploy, after the review fixes and before the merge.

1. Look at what went wrong on this change: the review's findings, what the person corrected, what the checks and CI caught, the plan's "Changes while building", and any test that failed while building or fixing. CI runs only on pushed commits, so check `gh run list --branch <branch name>`, and if it hasn't run on the branch's latest commit, say so.
2. For a mistake that has happened twice, add the correction to AGENTS.md or docs/REVIEW.md, or suggest a change to docs/STANDARDS.md for the person to make. If a tool can catch it, add it to the checks instead. To find an earlier time, search the earlier sections of docs/STATUS.md and `git log main`, not the other change folders. If a rule already covers it, sharpen that rule rather than add a second.
3. Remove anything out of date, including in this change's own plan.md, such as tests added at review, so a later review finds that it matches.
4. Record what you changed and why in docs/STATUS.md, under the change's heading, as "The harness, improved".
5. Improve this file, so that the next round makes a better change. Keep this as the last step.
