# A pre-commit check that keeps STATUS.md from going stale

`docs/STATUS.md` is only useful if it is current, and an agent that is deep in a task forgets to update it. The course's instruction ("Update `docs/STATUS.md` when you finish a piece of work") is a request. This makes it a rule: a commit that changes anything outside `docs/` fails unless `docs/STATUS.md` is in the same commit.

It is one lefthook job and a short script, added in the Harness stage. The build is at https://github.com/HopeFan/accountable, and the script is [`scripts/check-status-updated.mjs`](https://github.com/HopeFan/accountable/blob/main/scripts/check-status-updated.mjs).

## How it works

`lefthook.yml` runs the script first in the pre-commit job, before formatting, lint and types, so a commit without a STATUS update fails straight away:

```yaml
pre-commit:
  piped: true
  jobs:
    - name: status updated
      run: node scripts/check-status-updated.mjs
```

The script ([check-status-updated.mjs](https://github.com/HopeFan/accountable/blob/main/scripts/check-status-updated.mjs)) lists the staged files with `git diff --name-only --cached`. If any is outside `docs/` and `docs/STATUS.md` is not among them, it prints a message and exits 1:

```
docs/STATUS.md is not part of this commit. Update it to say what is now done or still to do, then stage it.
```

The message is written for the agent as much as for you. An agent that sees it updates STATUS.md and commits again, without being asked.

## What it does not do

- **It checks that the file is staged, not that the update is true.** An agent can add a blank line to STATUS.md and pass. It forces the question; it doesn't answer it.
- **Tiny changes pay the same price.** A typo fix in the frontend needs a STATUS line too. I accept that, because a one-line STATUS entry is cheap and a stale STATUS is not. If you don't, the script could skip commits under a few lines, or `git commit --no-verify` skips every hook for a commit you know is trivial.
- **Docs-only commits are exempt**, so writing the spec or a plan never needs a STATUS update.

## If you try it

1. Copy the script from my fork to `scripts/check-status-updated.mjs`.
2. Add the job to the top of `pre-commit` in `lefthook.yml`.
3. Run `npx lefthook install` if the hooks aren't installed yet.
4. Test it both ways: stage a change to a code file alone and check the commit is refused, then stage `docs/STATUS.md` with it and check it goes through.
