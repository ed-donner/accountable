# Git guide for the coding agent

How to help the student share their work in a pull request (PR), sort out commits the agent made, and pull Ed's latest changes. The student can follow it too.

The student may be on Windows (PowerShell) or a Mac; every command here works on both.

The course uses `git checkout` to change branches, never `git switch`, so use `git checkout` too.

## How the course uses branches

The student's own `main` holds their build for the whole course. Each change gets a branch of its own, such as `mvp` on Week 1 Day 3, which they merge into `main` at Deploy and then delete. Ed's branches, such as `week1day2-end`, hold his version at the end of each day, for catching up. `README.md` explains how to move `main` onto one of them.

## If the agent has committed

The course leaves commits to the student: at the end of each stage they run `git add .` and `git commit -m` with the message on the slide. An agent sometimes commits as it goes anyway, for example after each phase of `docs/plan.md`. Nothing is lost when it does.

1. If `git commit` says "nothing to commit, working tree clean", the agent has already committed everything. `git log --oneline` shows its commits, newest first.
2. `git branch` marks the current branch with `*`. Check that it's the stage's branch, such as `mvp`, and not `main`.
3. Keep the commits and carry on. If `git status` still shows changes, commit them with the slide's message.

For one commit per stage, as on the slides, combine the agent's commits before merging. In `git log --oneline`, find the last commit from before the stage, and use its hash:

```
git reset --soft <hash>
git add .
git commit -m "Build: the MVP"
```

`--soft` keeps every change and replaces only the commits. Do this only with commits that haven't been pushed.

If the commits landed on `main` because the branch wasn't made first, move them onto the branch. With `git status` clean, and `<hash>` the last commit from before the stage:

```
git branch mvp
git reset --hard <hash>
git checkout mvp
```

`git branch mvp` keeps the agent's commits on `mvp`, and `git reset --hard` moves `main` back to where it was before the stage.

## Sharing work in a pull request

Ed encourages students to share their work with a PR that adds it to `community_contributions/`. Other students learn from it, and the student is credited on GitHub as a contributor to the repo. Ed's overview of the steps is at https://edwarddonner.com/pr.

### 1. Fork the repo and set the remotes

A PR needs the student's own fork of the repo. The course makes one at the start of Week 1 Day 3.

The student cloned `ed-donner/accountable`, so `origin` is Ed's repo. Keep it as `origin`: the course reads Ed's branches as `origin/<branch>`. Add the student's fork as a second remote to push to.

1. On GitHub, the student forks https://github.com/ed-donner/accountable to their own account, leaving **Copy the main branch only** ticked.
2. Add the fork: `git remote add fork https://github.com/<username>/accountable.git`
3. Check with `git remote -v`: `origin` is `ed-donner/accountable` and `fork` is the student's.

If `origin` is already the student's fork, because they cloned the fork, add Ed's repo with `git remote add upstream https://github.com/ed-donner/accountable.git`. Then read `upstream` wherever this guide says `origin`, and `origin` wherever it says `fork`.

If the student gets stuck:

- **No GitHub account:** they sign up for free at https://github.com first.
- **Which button:** **Fork** at the top right of Ed's repo page, then **Create fork** on the page that follows.
- **The username:** ask the student for their GitHub username. It's in their fork's address, `https://github.com/<username>/accountable`.
- **A typo in the remote:** `git remote set-url fork https://github.com/<username>/accountable.git` replaces it.
- **Signing in on the first push:** git asks the student to sign in to GitHub, and their GitHub password won't work. In VS Code's terminal, VS Code offers to sign in through the browser, and Git for Windows does the same. Otherwise the student makes a personal access token on GitHub (Settings, Developer settings, Personal access tokens) with access to their fork, and pastes it themselves when git asks for a password. It never goes in a file or the chat.

### 2. Put the files in a folder of the student's own

The files go in `community_contributions/<folder>/`, where `<folder>` is any name the student likes. Screenshots and code stay in the student's fork, which keeps the course repo small.

- **The day's documents:** at the end of Week 1 Day 3, the student shares what they wrote that day: `docs/intent.md`, `docs/spec.md`, `docs/plan.md` and `REVIEW.md`, with a short `README.md` that says what they built and links to their build in their fork. Push their `main` to the fork first, with `git push -u fork main`, so that the link works: `https://github.com/<username>/accountable`.
- **A small, self-contained piece:** a skill, a hook, a subagent, a CI workflow, or a guide for a coding agent the course doesn't cover, such as `community_contributions/<folder>/skills/release-notes/SKILL.md`.

The student's `main` holds their whole build, so the PR comes from a new branch that starts at Ed's latest `main` instead. It carries nothing else from the student's work:

1. Copy the files into `community_contributions/<folder>/`.
2. Commit or stash everything else, so that `git status` shows only the new folder.
3. Make the branch, with any name, such as `share-day3`. The new folder comes with you, since git leaves untracked files alone:
   ```
   git fetch origin
   git checkout --no-track -b <branch> origin/main
   ```

### 3. Commit, check and submit

```
git add community_contributions/<folder>
git commit -m "<what it is>"
git diff --numstat origin/main...HEAD
```

`--numstat` lists each file in the PR with its lines added and deleted. Before submitting, check all of these:

- No more than 5 files
- Under 2,000 lines changed in total, except for the day's documents, which can be any length
- No file changed outside `community_contributions/`
- No lines deleted
- No API keys or `.env` contents, no unnecessary test files, no wordy README or `.env.example`, and no emojis or other LLM artifacts

If the PR fails a check, fix it, or share a write-up instead (step 4). Then push the branch to the fork:

```
git push -u fork <branch>
```

On GitHub, the fork's page offers **Compare & pull request**. The base repository is `ed-donner/accountable` and the base branch `main`. Give the PR a short title and a line or two on what it is. With the GitHub CLI, `gh pr create --repo ed-donner/accountable --base main --head <username>:<branch>` does the same.

Afterwards, go back to the student's own branch with `git checkout main` (or the branch they were on), and run `git stash pop` if they stashed.

### 4. A bigger piece: share a write-up

The student's own build of Accountable is too big to merge, so they share a write-up instead: one Markdown file, in `community_contributions/<folder>/`, with what they built, their takeaways, and a link to their build in their fork. Screenshots go in the fork, and the write-up can link to them.

1. Push their `main` to the fork: `git push -u fork main`. The link is `https://github.com/<username>/accountable`.
2. Make the PR with the Markdown file alone, following steps 2 and 3.

### 5. A fix to a bug in the repo

A fix to Ed's code or a guide is welcome as a PR outside `community_contributions/`. Unless the fix is obvious, the student checks with Ed first, in the course's Q&A on Udemy or by email to ed@edwarddonner.com.

Branch from the branch with the bug: `origin/main` for a guide or a document in `docs/`, or the day branch for a bug in Ed's build. Make the smallest change that fixes it, and open the PR against that branch, saying what was wrong.

## Pulling Ed's latest changes

Ed adds improvements to the course over time, on his `main`. To bring them into the student's build:

1. `git status` shows the student's local changes.
2. Set them aside, one of two ways:
   - If the student doesn't need them: `git stash`. They stay in the stash, where `git stash pop` brings them back and `git stash drop` deletes them.
   - To keep them: `git add -A`, then `git commit -m "My changes"`.
3. On their `main`, `git pull --no-rebase origin main` merges Ed's latest into their build.
4. If git reports conflicts, `git status` lists the files. A document the student changed during the course, such as `docs/intent.md`, usually keeps the student's version: `git checkout --ours <file>`. Otherwise keep the right lines and delete the conflict markers. Then `git add` each file, and `git commit` finishes the merge. `git merge --abort` goes back to before the pull.
5. Run `npm install` and `uv sync`, in case the dependencies changed.
