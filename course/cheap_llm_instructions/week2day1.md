# Alternative instructions for cheap or free LLMs

These instructions are the same as the main instructions in [course/instructions/week2day1.md](../instructions/week2day1.md). Nothing changes on this route, because the demo uses git alone, with no coding agent.

# Week 2 Day 1 instructions

My git worktree demo from the end of the day, if you'd like to follow along. It runs in a throwaway repo, so it doesn't touch Accountable.

## Git worktrees

### Set up a throwaway repo

In a terminal in your `accountable` folder, go up one level, so that the demo sits beside `accountable` rather than inside it:

```
cd ..
git init -b main demo
```

Open the `demo` folder in VS Code (File > Open Folder) and open its terminal (Terminal > New Terminal). In the Explorer, right-click and choose New File, call it `README.md`, type `# Demo` in it and save. Then:

```
git add README.md
git commit -m "First commit"
```

### Add a worktree

```
git worktree add ../demo-feature -b feature
git worktree list
```

Git prints "Preparing worktree (new branch 'feature')", and the list shows two folders: `demo` on `[main]` and `demo-feature` on `[feature]`.

### Work in the second folder

Open `demo-feature` in a second VS Code window (File > New Window, then File > Open Folder). In its Explorer, right-click and create a new file called `feature.txt`, type a line in it and save. Then, in that window's terminal:

```
git add feature.txt
git commit -m "Add the feature"
```

### Back in the first folder

In the `demo` window's terminal:

```
ls
```

Only `README.md` is there, because the first folder still has `main` checked out.

```
git log --oneline feature
```

The "Add the feature" commit is there too. Both folders share one repository, so there's nothing to push or pull between them.

```
git checkout feature
```

This fails with "fatal: 'feature' is already checked out at ...", because a branch can be checked out in only one folder at a time.

### Merge and clean up

Close the `demo-feature` window first, then in the `demo` terminal:

```
git merge feature
git worktree remove ../demo-feature
git branch -d feature
```

The merge is a fast-forward, and `feature.txt` is now in `demo`. When you're done, close the window and delete the `demo` folder.
