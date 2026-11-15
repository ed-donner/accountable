# Status

No code has been written yet.

## Done

- `docs/intent.md`: scope, users, constraints and success criteria agreed, including delete rules, stage probabilities, required links, scale, speed and accessibility.
- `docs/spec.md`: numbered requirements (R1–R61) and the design for the MVP: architecture, data model, API, screens, brand-based visual design and test plan.
- `docs/mockups/`: three design directions (A classic sidebar, B summary-led top bar, C icon rail with a Today column). Each draws the Overview (landing page) and Pipeline sections, switched from the menu, with a 1440 px screenshot of each beside it. No direction chosen yet.
  - Reviewed against spec.md and the brand skill and corrected. Every figure now comes from one sample deal list (34 deals, R52/R53) so tiles, charts, funnel (R48) and board agree. Won/Lost columns hold all their deals and columns scroll (R39/R43). Recent activity shows 10 entries (R49). Follow-ups are complete and grouped (R50). B gained a pipeline search box (D21) and an open "Move to…" menu (R41). Boards scroll sideways below 1280 px (R60). Funnel money is shown in full.
  - Contrast fix (R58): white text on Cerulean (4.0:1) and on Raspberry (3.6:1) fails AA at small sizes, so pills, tags and stage headers that carry text use darker fills `#0D6C8C` and `#C8264F`. Spec 2.8 tokens should add these.
  - Regenerate with `node docs/mockups/generate.mjs docs/mockups`.
- Navigation: Pipeline is its own item in the left menu (Overview, Pipeline, Deals, Contacts, Organizations), and Overview is the landing page. The Dashboard tabs are gone (intent.md, spec.md R39, D15–D17, D21 and the mockups updated).

- `docs/plan.md`: the build plan, covering the files that change, nine phases (0–8) each ending at a commit point, risks, and proof (backend and frontend unit tests, and end-to-end tests mapped to the intent's success criteria).

## Next

- Phase 0 of `docs/plan.md`: choose a mockup direction (or a mix), add the two darker text-bearing colours to spec 2.8, and confirm the funnel and rounding rules (plan Risks 4 and 5).
- Then build from Phase 1 (skeleton), in a fresh session.
