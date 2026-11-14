# Phone and tablet view

Accountable was locked to a laptop width. A window narrower than 900px now uses a phone layout. The top bar wraps. The five figures sit in two columns, and in one column below 560px. Paired panels stack. A table and the pipeline scroll inside their own panels. The page does not scroll sideways. A wider window keeps the laptop layout.

No new routes, records, or languages.

The build is at https://github.com/VerbodhDev/accountable. The site is https://d3lzszqmcqjrkz.cloudfront.net.

## Six stages

1. Intent. The page should be usable at 390px and at 768px, with the laptop layout unchanged.
2. Spec. docs/spec.md, docs/specs/shell.md, and docs/specs/scope.md describe the phone layout.
3. Plan. One breakpoint at 900px, a second at 560px, and a scroll panel around the table. No API change.
4. Build. The styles and the table wrapper are on the fork.
5. Review. No important findings. The checks passed. At 390px and at 768px the dashboard, a list, the pipeline, and an organization page do not scroll the page sideways. At 1280px the laptop layout stays.
6. Deploy. The same frontend is on the CloudFront site above. The bucket stays private.
