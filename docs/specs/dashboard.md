# Spec: Dashboard

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Dashboard

- **H1.** A one-line summary gives the overdue follow-ups and late deals, such as "6 follow-ups overdue and 5 deals running late."
- **H2.** Four headline figures appear, each linking to where the detail lives. The won figures link to Deals showing Won deals only (T10).

| Figure | Beside it |
|---|---|
| Revenue won this month | Last month's revenue won |
| Deals won this month | Last month's deals won |
| Open pipeline (total value of open deals) | Number of open deals |
| Expected revenue | As a percentage of the open pipeline |

This month's figures sit beside last month's rather than showing a percentage change, because early in a month any percentage would look like a collapse.

- **H3.** A **pipeline band** shows the four open stages as blocks sized by value, each with its name, value and deal count. It links to the Pipeline.
- **H4.** A **line chart** shows revenue won per month, and a **bar chart** shows deals won per month. Both cover the last 12 months including the current one, with months of no wins shown as zero. The current month is marked as "so far". There's no date filter.
- **H5.** A top-down **sales funnel** shows how much value has reached each stage, narrowing from New at the top to Won at the bottom, with the percentage carried forward from the stage before. It covers every deal there has ever been. A deal counts for every stage up to the furthest one it has been in, even if it skipped some, and moving back doesn't remove it. A lost deal counts up to the furthest stage it reached before it was lost, and every deal counts for New. Won is the last step, so Lost isn't on the funnel.
- **H6.** **Follow-ups** lists every follow-up not yet done: overdue ones first, oldest first, then upcoming ones by date. Each shows what it's about, its date, a link to its contact or deal, and a tick box to mark it done. Overdue ones carry an Overdue chip. The panel's heading shows how many are overdue and upcoming, and the panel scrolls if the list is long.
- **H7.** **Recent activity** lists the 10 newest activities and stage changes, leaving out anything dated in the future. Each links to its contact or deal.
- **H8.** Every chart and list has a designed empty state, and nothing divides by zero.
- **H9.** Each of the five questions in the [Problem](../spec.md#problem) can be answered within two clicks of the dashboard: which companies we deal with, who our contacts are, what's in the pipeline, what happened last with a customer and what needs doing next.
- **H10.** Other areas can add sections below the dashboard's own, such as what customers owe, in the order `App.tsx` gives them. The dashboard's own part still fills the window, so the page scrolls to them. Bills adds the Money section: what we owe, what's overdue, the bills due in the next 30 days and spending by category ([E20 to E24](bills.md#the-money-section)).

## Screens

### Dashboard

Everything fits on one screen at 1440 by 900 with no page scrolling, so what needs doing next is always in view. Sections other areas add (H10) come below that screen, such as the Money section, which has its own screen in [bills.md](bills.md#money-section). The page only scrolls on windows under 760px tall. Follow-ups and Recent activity each scroll by themselves.

The revenue chart is the one bold thing on this screen: a large figure over a solid Sea Green area that runs to the panel's edges. Everything around it stays quiet.

```
+-------------------------------------------------------------------------------------------------------------+
| Accountable  [Dashboard]  Organizations  Contacts  Deals  Pipeline  Products  [Search ]  Oct 31, 2026  (AR) |
+-------------------------------------------------------------------------------------------------------------+
Dashboard   6 follow-ups overdue and 5 deals running late.

+---------------------------------------------------+ +-----------------------+
| Revenue won in October                      $100k | | Follow-ups            |
| $84,500                                           | |   6 overdue, 10 upcoming
| September $72,000                                 | | [ ] Send revised quote|
|        solid Sea Green area under the line        | |     Overdue    Oct 12 |
+---------------------------------------------------+ |                       |
| Open pipeline  Expected revenue  [New|Qual|Pro|Neg] | +-----------------------+
+---------------------------------------------------+ | Recent activity       |
| Deals won in October 6  | Sales funnel            | | Moved from Proposal   |
| bars for 12 months      | top-down, with values   | |   to Negotiation      |
+-------------------------+-------------------------+ +-----------------------+
```

The right column is 396px wide and the left takes the rest, with 12px gaps. Under the revenue chart, the strip holds Open pipeline, Expected revenue and the pipeline band. The bottom row gives Deals won about 40% of the width and the funnel about 60%.

In this narrow column, a follow-up shows its action and a link to its contact or deal, with the organization left out. An activity shows the link and the time on its second line.
