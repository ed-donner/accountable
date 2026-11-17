The project has not yet started.

## Intent

- `docs/intent.md` was clarified through an interview with the product owner: delete rules, timelines, pipeline columns, stage probabilities, close dates on Won and Lost, contact status on a win, required fields, the dashboard's period, scale, sample data size, the user, and success in everyday use. No code yet.

## Spec

- `docs/spec.md` has the requirements and design for the MVP, following the brand, with concerns listed at the top. The product owner confirmed all of them. No code yet.

## Mockups

- `docs/mockups/` has three design directions for the dashboard and the pipeline, each an HTML file with a screenshot beside it. A uses a Midnight sidebar and follows the spec's layout. B uses a top navigation bar, a tapered funnel and a stacked pipeline strip. C uses a slim icon rail, a dark hero panel, and Won and Lost as drop zones. The sample data and chart helpers they share are in `docs/mockups/shared/`.
- Chosen design: A, with the funnel from C and the probability ring from B, in `docs/mockups/final-dashboard.html` and `docs/mockups/final-pipeline.html`. `docs/spec.md` is updated to match.

## Plan

- `docs/plan.md` has the build plan: the files that change, eight phases of work, the risks and the tests that prove each requirement, with IDs linked to the spec and intent and a traceability matrix. No code yet.

## Structure review

- The layout is now grouped by section on both sides, with one backend module per section holding its endpoints and queries, and one frontend folder per section. Alembic migrations run on every start (new requirement G12), and the frontend's API types are generated with openapi-typescript. `docs/spec.md` (repository layout, libraries, G4, G12) and `docs/plan.md` (files, W2.1, W2.2, W2.4, W2.5, W3.9, W4.2, W4.7, TB42, TF17, R15, R16) are updated to match.
