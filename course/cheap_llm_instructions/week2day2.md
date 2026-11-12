# Alternative instructions for cheap or free LLMs

These instructions are based on the main instructions in [course/instructions/week2day2.md](../instructions/week2day2.md). They're more suitable if you're working with cheap or free models.

**What's different from the main instructions:** there's nothing to build today. Building features side by side takes a large model and hours of agent time. On this route you watch the lectures instead. Your own build stays as it is on your `main`, ready for the pipeline board on Week 2 Day 5.

# Week 2 Day 2 instructions

In today's lectures a team builds two features at the same time: products and company settings. The lead prepares `main` first. Then two developers each build one feature with their own coding agent in their own worktree, and the person who merges brings both together.

## On this route

Watch the lectures. Your build doesn't change today.

## If you'd like to look at my build

This isn't recommended. My build is much bigger than yours, and the rest of this route doesn't need it. If you'd still like to see it, clone the repo a second time into a folder of its own beside `accountable`, so your own build and its database stay as they are. In a terminal in your `accountable` folder:

```
cd ..
git clone https://github.com/ed-donner/accountable accountable-ed
cd accountable-ed
git checkout week2day2-end
npm install
uv sync
npm run seed
npm run dev
```

`npm run seed` puts my sample data in the second folder's own database. It asks first: type `yes`. Stop your own app before you start mine, since both use the same ports. Press Ctrl+C to stop it. When you're done, you can delete the `accountable-ed` folder.
