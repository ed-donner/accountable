# Improve the harness

Run this at Deploy, after the review fixes and before the merge.

1. Look at what went wrong on this change: the review's findings, what the person corrected, what the checks caught — and what the checks missed. Every gate stayed green on the dark-mode change while it broke its own AA rule, so don't take a green run as evidence the requirements held.
2. For a mistake that has happened twice, add the correction to AGENTS.md or docs/REVIEW.md, or suggest a change to docs/STANDARDS.md for the person to make. Put it where it would have stopped the mistake: rules about writing the change go in AGENTS.md, rules about judging it go in REVIEW.md. If a tool can catch it, add it to the checks instead.
3. Remove anything out of date — counts, hedges and claims the fixes have since changed.
4. Improve this file, so that the next round makes a better change. Keep this as the last step.
