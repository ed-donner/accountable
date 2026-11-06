# Intent: quotes and invoices share their code

## Problem

Quotes and invoices each have their own code for line items, totals and the PDF, built on separate branches. Quotes draw their PDFs with fpdf2 in a look of their own, and invoices theirs with ReportLab in the design, accent color and logo chosen in Company settings. So there are two PDF libraries, two copies of the fonts, and two ways of saving lines, and a quote can't look like the business's invoices.

## Proposed outcome

Before anything changes, characterization tests pin what quotes and invoices do today: each line's amount, the subtotal, the tax and the total, the numbering, and what their PDFs contain.

Then quotes and invoices use the same code for their lines, their totals and their PDFs, and quotes take the invoice design, accent color and logo chosen in Settings, on the PDF and in the preview on the quote's page. The PDF library is the one invoices use, ReportLab.

## Constraints

- Change nothing else: not the database, the API's routes or what the pages do. The quote page keeps its form, buttons and saving.
- Work in small steps, and run the characterization tests after each one, keeping every one passing without changing it.
- The exception, agreed before the work started: the tests that record the quote PDF's old look. In the step that switches quote PDFs to the invoice designs, the four quote records are taken again from the new output after checking them by hand, and in the file test only the lines about the fonts, the title and the logo change.
- Update the spec to match, and run `npm run check` at the end.
- The two forms' line editors stay separate, because they behave differently.

## Not in this change

- Merging the quote form's and the draft invoice form's line editors.
- Any change to what a quote or an invoice holds, saves or refuses.
