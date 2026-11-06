# Spec: The Copilot

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Copilot

The Copilot answers questions about the records in plain English, and makes the everyday CRM changes the app allows, once the person confirms each one. It works by asking a model, through OpenRouter, which uses tools that call Accountable's own API as the signed-in person.

### The panel

- **Z1.** A Copilot button in the top bar, on every screen once signed in, opens the Copilot panel at the right of the window, over the right side of the page. The page stays usable beside it, so a change can be watched as it lands. The button, the panel's Close button, or Escape while focus is in the panel, closes it.
- **Z2.** The conversation stays while the person moves between pages, and while the panel is closed and opened again. A reload or sign-out drops it (U5). New conversation clears it, stopping anything still running.
- **Z3.** Before the first message, the panel says what the Copilot can do, offers three examples that fill the box when clicked, and says where questions go, naming the model the backend uses (Z19): "Questions, and the records the Copilot reads to answer them, go to openrouter/free through OpenRouter. It can get things wrong, so check anything important on its page."
- **Z4.** The person types a question or a request, up to 2,000 characters, and sends it with Enter or Send. Shift+Enter starts a new line. One message goes at a time: while the Copilot works, Send becomes Stop, which stops it. A change the person confirmed that is already on its way still finishes, and everything on screen is read again, so it shows whether it did.
- **Z5.** Each tool the Copilot uses shows as a step, as it starts, in plain words the backend writes from the tool and what it was asked, such as Searching for "acme" or Listing deals closing Nov 1 to Nov 30, 2026, never in the model's own words. A step names a record once it's read, such as Read Harbor & Pine renewal. A finished step gets a check, and a failed one says why, in the API's words.
- **Z6.** The answer comes after the steps, once the model has finished it. It's shown as text, with paragraphs, bulleted and numbered lists and bold. Anything else, such as a link, an image, a heading, a table or HTML, shows as the characters typed. Nothing in an answer can be clicked or loads anything.
- **Z7.** The Copilot remembers the last 20 messages of the conversation, the person's and its own answers. What its tools read for an earlier question isn't kept, so it reads again what it needs, and its answers follow the records as they are now.

### What it can look up

- **Z8.** It can look up anything the app shows, through the routes the app's own pages read, each one a `GET`:

| It reads | Through |
|---|---|
| Organizations, contacts, deals and active products by name | `GET /search` |
| Organizations, contacts or deals, narrowed by what was asked, such as a stage, a status, an organization, close dates, or late deals only | `GET /organizations`, `/contacts`, `/deals` |
| One organization, contact or deal in full, with its contacts and deals | `GET /organizations/{id}`, `/contacts/{id}`, `/deals/{id}` |
| A timeline: activities, follow-ups and stage changes, newest first | `GET /organizations/{id}/timeline` and the same for contacts and deals |
| The dashboard's figures and the follow-ups due | `GET /dashboard` |
| The price list, archived products when asked | `GET /products` |
| Quotes, narrowed by status, deal or organization, and one quote with its lines | `GET /quotes`, `/quotes/{id}` |
| Invoices, narrowed by what they show as, deal or organization, and one invoice with its lines and payments | `GET /invoices`, `/invoices/{id}` |
| Bills, narrowed by unpaid, overdue or paid, supplier or category, and one bill | `GET /bills`, `/bills/{id}` |
| What's owed to us and what we owe | `GET /invoices/money`, `/bills/dashboard` |
| The cash flow, and what's expected in a month | `GET /cash-flow`, `/cash-flow/expected` |
| Profit and loss for a month, quarter or year | `GET /books/profit-and-loss` |
| The balance sheet on a day | `GET /books/balances` |
| Aged balances, customers or suppliers, on a day | `GET /aged-balances/customers`, `/aged-balances/suppliers` |
| Journal entries, by account, dates or search | `GET /books/entries` |
| The company settings, without the logo | `GET /settings` |

- **Z9.** A list hands the model at most 50 rows, with how many matched in all, and cuts long text, such as a note or a description, to 500 characters, so a question about 500 deals fits what a free model can read. The narrowing happens on the API's reply, before the model sees it. Each row keeps its id, so the model can read the record in full.
- **Z10.** The Copilot knows the backend's today (Terms), the signed-in person's name and the company's name, and the meanings in Terms it needs, such as an open deal, a late deal and expected revenue. It finds facts through its tools, never from memory, and says when the records don't hold the answer.

### What it can change

- **Z11.** It can make these changes, each through the route the app's own form or board uses, so every rule holds as if the person had made it in the app: the form's checks (F2 to F9), the stage rules (S1, S9), and who added and last changed the record, which is the person (U10).

| Change | Through | Button |
|---|---|---|
| Add an organization | `POST /organizations` | Add organization |
| Edit an organization | `PATCH /organizations/{id}` | Save organization |
| Add a contact | `POST /contacts` | Add contact |
| Edit a contact | `PATCH /contacts/{id}` | Save contact |
| Add a deal | `POST /deals` | Add deal |
| Edit a deal, any field but its stage | `PATCH /deals/{id}` | Save deal |
| Move a deal to another stage, to the top of its new column (S9) | `PATCH /deals/{id}`, with the stage alone | Move deal |
| Add an activity, a note, call or email, on a contact or a deal, with an optional follow-up date | `POST /activities` | Add activity |
| Mark a follow-up done | `PATCH /activities/{id}`, with done alone | Mark done |

- **Z12.** It changes nothing else. It can't delete anything, or change products, quotes, invoices, payments, bills, the books, the company settings or users. It has no tool for them, so a model that asks for one gets nothing: a call for a tool not on its list is refused before it reaches the API. Asked for one of these, it says plainly that it can't, and where in the app it's done, such as "I can't mark bills paid. Open the bill and use Mark paid."
- **Z13.** Before any change, the panel shows a change card and waits. The card says what will change, in words the backend writes from the change's arguments and the records as the API gives them, never in the model's words, so it says what would really happen. Its title names the change and the record, such as "Move Harbor & Pine renewal to Negotiation?". Below it, each field the change sets, with what it is now and what it will be, such as "Stage: from Proposal to Negotiation". A move to Won or Lost adds what else changes by S1, such as "The close date becomes today, and Sam Carter becomes a customer." The card has the change's own button, from Z11's table, and Cancel.
- **Z14.** Each card is one change to one record, and its button runs that change alone. If the model asks for several changes at once, the card shows the first, and the model is told the others need cards of their own, one after another.
- **Z15.** Pressing the change's button runs it through the API as the person. The step then says what happened, such as "Moved Harbor & Pine renewal to Negotiation.", with a link to the record, and everything on screen is read again, so the board, the tables and the record's page show it at once. A refused change shows the API's words, such as "Enter a name", and the model is told, so it can try again or explain.
- **Z16.** Cancel changes nothing. The panel says "Cancelled. Nothing was changed." and the Copilot stops there, without asking the model again. A card left unanswered stays until it's answered, a new message is sent, which cancels it, or the conversation ends.

### Text from the records

- **Z17.** Any text stored in Accountable is untrusted, because anyone who can type into a note, a contact or a deal could have written it. The Copilot treats everything its tools read as data typed by people, never as instructions, whatever it says. The model is told so, and what the tools read reaches it as data, kept apart from its instructions. A note that asks for a change can at most lead to a change card, which changes nothing until the person presses its button (Z13), and whose words come from the change itself.
- **Z18.** Its tools reach only Accountable's own API. Nothing sends email, fetches a web page or calls another service. The one call outside the app is the backend's to OpenRouter, for the model's replies, and the browser never makes it.

### The model

- **Z19.** The model comes from OpenRouter. The backend reads two settings from its environment: `OPENROUTER_API_KEY`, the key, and `OPENROUTER_MODEL`, the model, which is `openrouter/free`, OpenRouter's router across its free models, when it's unset or empty. A team that wants a paid model sets it to any OpenRouter model that can use tools. Neither decides which copy runs (C8). The key stays on the server and never reaches the browser.
- **Z20.** The Copilot asks the model at most 8 times in a row without coming to an answer or a change card, and waits at most 60 seconds for each reply. At the limit it stops, with "The Copilot stopped after 8 steps without an answer. Try asking something narrower."
- **Z21.** When something goes wrong, the panel says what, in plain words, in place of the answer, with Try again, which sends the same message again:

| What happened | The panel says |
|---|---|
| No key, local copy | The Copilot needs an OpenRouter key. Add OPENROUTER_API_KEY to .env, then start Accountable again. |
| No key, shared app | The Copilot needs an OpenRouter key. Add OPENROUTER_API_KEY to the service's environment on Render. |
| OpenRouter refused the key | OpenRouter didn't accept the key. Check OPENROUTER_API_KEY. |
| No credits left for a paid model | The OpenRouter account has run out of credits for this model. |
| The limit of requests a minute | The Copilot has reached OpenRouter's limit for this minute. Wait a minute and try again. |
| The limit of requests a day | The Copilot has used today's free requests on OpenRouter. Try again tomorrow, or add credits to the OpenRouter account. |
| Another limit, or the model's host busy | The model is busy right now. Wait a minute and try again. |
| A model that can't use tools | The model in OPENROUTER_MODEL can't use tools. Choose another model. |
| OpenRouter can't be reached | Can't reach OpenRouter. Check your internet connection. |
| No reply within 60 seconds | The model took too long to answer. Try again. |
| A reply that can't be read, or anything else | The model's reply couldn't be read. Try again. |

With no key, the panel says so as it opens, without Try again, and Send is off. The backend tells the day's limit from the minute's by what OpenRouter's reply says, and says the model is busy when it can't tell.
- **Z22.** A free OpenRouter key allows 20 requests a minute, and 50 a day until the account has bought $10 of credits, then 1,000. The whole team shares the key, and one question takes at least two requests: one that picks the tools and one that answers. Z20's limit keeps a question from using more than 8 in a row.

### What's sent and kept

- **Z23.** What the model receives is the person's messages and the Copilot's answers (Z7), its instructions, with the person's name, the company's name and today, and what its tools read. The host of the model may keep it, and may train on it ([Known risks](security.md#known-risks)). Accountable keeps nothing of a conversation: no table, and no question or answer in its logs.

## Screens

### Copilot button and panel

The Copilot button sits in the top bar between today's date and the menu button ([Shell](shell.md#shell)). It's a 32px circle in the page color with lucide-react's sparkles icon in ink, and while the panel is open it's Sea Green with the icon in Midnight, as the current section is. Its label for screen readers is "Copilot", and it says whether the panel is open.

The panel is 400px wide, 20px from the window's right edge, in line with the top bar's end, and runs from 12px below the top bar to 12px above the window's bottom, staying put as the page scrolls. It's on the raised surface, rounded like a panel, with the soft shadow and no outline. It fades in quickly, as dialogs do. Opening it puts focus in the message box, and closing it puts focus back on the Copilot button. It doesn't block the page, so the page can still be clicked and scrolled.

At the top, "Copilot" as a section heading, then New conversation and Close, each an icon button with its name for screen readers and as a tooltip. Below them, the conversation scrolls, newest at the bottom, and keeps the newest in view as steps arrive, unless the person has scrolled up. Screen readers hear each step and the answer as they arrive.

- **The person's message:** at the right, in the page color, rounded like a card, at most 85% of the panel's width, in ink at the body size.
- **A step:** one line in muted ink at the body size, with a 16px icon: a turning loader while it runs, a check when it's done, and an alert icon in Raspberry text when it fails, with the reason after it. The loader stays still under reduced motion.
- **The answer:** in ink at the body size, with no backing.
- **A change card:** in the page color, rounded like a card. The title in ink, semibold. Each field on a line of its own, its name in muted ink and its values in ink, with money, dates and percentages in JetBrains Mono. Below, the change's button, a main button in Sea Green, and Cancel, in the raised color. After it's answered, the buttons go and the card says what happened.
- **A problem:** Z21's words in ink, after an alert icon in Raspberry text, with Try again as a secondary button.

At the bottom, the message box, in the page color like other inputs, growing to six lines and then scrolling, with the placeholder "Ask a question or for a change", and Send, a main button with an arrow icon. While the Copilot works, Send becomes Stop, a secondary button with a square icon. Before the first message, the conversation's place holds Z3's words and the three examples as secondary buttons: Which deals close this month?, What do customers owe us? and Move a deal to Negotiation.
