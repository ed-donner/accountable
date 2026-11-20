# Coding standards
 
Follow these coding guidelines. Formatting, complexity and secret checks are handled by tools, and bug and security checks by docs/REVIEW.md, so none of those are repeated here.
 
## Style
 
1. Be thoughtful and careful about naming things, so that code is expressive and easy to read.
2. Don't comment out unused code. Delete it.
3. Favour short functions and methods with one purpose.
4. Make code readable, so that only very short comments are needed, and mostly comment the why.
5. Use clean abstractions with clear separation of concerns, but don't abstract before it's needed.
6. Avoid brittle tests that are tied to implementation specifics.

## Lessons from this build
 
7. Never decide anything from cached or pending data. Wait for fresh data, and act on each save's own result.
8. Sample data must never be able to reach a real person. Use made-up .ng domains, phone numbers that can't be dialled, and no real company names.
9. Nothing may depend on the real time of day. Fixed times in sample data are in the past, and tests fix the time as well as the date.
 