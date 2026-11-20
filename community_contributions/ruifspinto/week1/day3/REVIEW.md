# Review policy

Every change is reviewed against this policy before it merges. The reviewer reports its findings and doesn't change any code.

## Passes

Make a separate pass over every change for each of these:

- **Bugs:** the code does what it's meant to, including when something goes wrong.
- **Security:** no secrets or personal data are exposed, and nobody can do what they shouldn't.
- **Matches the spec and plan.md:** the change does what `docs/spec.md`, the area files in `docs/specs/` and plan.md say, with nothing missing and nothing extra. Where they disagree, the spec wins — a plan or a test that restates a spec rule with a weaker number or a looser wording is a finding against that document, not a pass.
- **Described by the spec:** every piece of behavior in the change has a home in `docs/spec.md` or an area file in `docs/specs/` — flag any code that the spec doesn't describe.
- **Matches STANDARDS.md:** the code follows `docs/STANDARDS.md`, the repo's coding guidelines.

## Important

An Important finding must be fixed before the change merges. A finding is Important if the change breaks behavior that should work, leaks data or breaks a rule in AGENTS.md.

## Nits

A nit is a small point, such as style or naming, that doesn't block the merge. Report at most five per review.