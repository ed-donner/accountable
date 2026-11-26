# Currency switch for Accountable

A second Accountable change, built with the same stages as the first: intent, spec, plan, build, test, review, deploy.

It adds a currency choice to the user menu, US dollar or Australian dollar. Every amount in the app follows the choice, using one fixed exchange rate kept in one place. Stored values stay in USD, and the choice is remembered in local storage.

- `intent.md`: what the change is for
- `spec.md`: what it does, with numbered requirements
- `plan.md`: how it was built, in phases

The build is in my fork: https://github.com/HopeFan/accountable (the change is in `docs/changes/currency/`, with screenshots in both currencies).

What I learned: the reviewer subagent and ui-check found real problems the tests missed, such as chart axis labels repeating when revenue is zero. The end-to-end screenshot tests also rewrote committed images on every run, so I moved them out of `docs/changes/`.
