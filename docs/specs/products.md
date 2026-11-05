# Spec: Products

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## The price list

- **G1.** Products is the price list: what the business sells, each with a name, a description, a unit price and whether it's active. It's the sixth section in the top bar, after Pipeline ([N1](shell.md#app-shell)). Quotes take their lines from it ([Q11](quotes.md#lines)), and invoices will later. Deals don't name products: their quotes do.
- **G2.** A product's name is required and unique, ignoring case in any language, the same in the local copy and the shared app. So "Pro license" can't be added beside "PRO LICENSE", and "Émile" clashes with "émile". Spaces at either end are dropped first. A name has 200 characters at most, so its key always fits the database's index: Postgres can't index a key over about 2,690 bytes, and no character's key is more than 12. Archived products count, so restoring one can never make two products with the same name. A product can change the case of its own name. The page and the API refuse a name that's taken, and so does the database, so two saves at once can't both get through.
- **G3.** A unit price is in US dollars and cents, from $0.00 to $1,000,000,000,000.00, the same limit as a deal's value. It's kept and sent as a whole number of cents, never as a decimal, so $49.50 is 4950. It shows with its cents everywhere it appears, as `$49.50` or `$1,250.00`, in the table, on the product's page and in search results, and the form shows its cents too (G4).
- **G4.** The Unit price box takes a price as people write it: `49.50`, `49.5`, `49`, `1,250` or `$1,250.00`. Anything else, such as a third figure after the point, a minus sign or letters, gets "Enter a price in dollars and cents, such as 49.50" (F2). What's typed becomes cents by its digits, never through floating point, where 0.29 times 100 is 28.999999999999996. Editing a product shows its price with two figures after the point, such as `1250.00`.

## Products table

- **G5.** The Products table follows T1 to T5, with Archive in place of Delete. Its columns are Name, Description and Unit price, sorted by Name to start with. The description shows on one line, cut short with "…" if it doesn't fit, and in full on the product's page. The table's search matches the name and the description (T2), and Unit price sorts by amount.
- **G6.** Archived products are hidden from the table until Show archived, beside the search box, is ticked. It shows how many there are, such as "Show archived (2)", and stays in the address with the search, sort and page (T4). Ticked, archived products sort among the rest, with an Archived chip after the name, and Restore in place of Archive on their rows.
- **G7.** With no products at all, the table invites the first one (T7). If every product is archived and Show archived is off, it says "Every product is archived." with a button that shows them. A search with no matches says so and offers to clear the search, and if archived products match while they're hidden, it also says how many, such as "2 archived products match.", with a button that shows them. Clearing the search leaves Show archived as it was, because ticking it only ever adds rows.

| Table | Columns | Default sort |
|---|---|---|
| Products | Name, Description, Unit price | Name |

## Adding and editing

- **G8.** Add and Edit open the same form in a dialog, following F1, F2 and F10. Name and Unit price are required, and Description is optional and can run to several lines. There's no Active box: a product is added active, and Archive and Restore change it (G9). A name that's taken gets "A product with this name already exists" beside it, or, if the product with that name is archived, "An archived product has this name. Restore it or choose another." A longer one than G2 allows gets "Keep the name to 200 characters or fewer", from the form before it sends and from the API, which counts characters the same way.

| Record | Required | Other fields | Defaults |
|---|---|---|---|
| Product | Name, Unit price | Description | Active |

## Archiving

- **G9.** Products are archived, never deleted. Archive is on each active product's row and page, and Restore on each archived one's. Neither asks first, because each undoes the other. Archiving shows "Product archived." with a Restore button, so a slip takes one click to put right, and restoring shows "Product restored." The archived message stays for 10 seconds, rather than the usual 4, because reaching its button with Tab doesn't pause it the way pointing at it does. Each happens once, however quickly its button is pressed, and one that fails says so and leaves the product as it was. Neither the app nor the API has a way to delete a product. `npm run empty` removes them along with every other record (C4).
- **G10.** An archived product keeps its name, price and description, and can still be edited. It's left out of the top bar's search ([K1](search.md#search)) and can't be added to a quote (Q11), and its page and address still work. Quotes it's already on keep their lines as they are (Q13). Archiving a row with Show archived off takes it out of the table, and focus moves to the table's search box, so it isn't left on nothing (Q3).

## Product page

- **G11.** A product's page shows its name, with an Archived chip if it's archived, its unit price, its description, and who added it and last changed it, as in R6. It has Edit, and Archive or Restore. Archiving or restoring stays on the page. There's no timeline, because nothing is logged against a product, and no list of the quotes it's on.
- **G12.** Each product records who added it and who last changed it, following U10. Archiving and restoring count as changes. An address that couldn't be a product, or names one that doesn't exist, shows "This product no longer exists" with a link back to Products (N4).

## Screens

### Products table

Laid out like the other tables ([Screens](records.md#screens)): the page title with Add product beside it, then the search box with the Show archived box after it, then the table on a panel. Unit prices are in JetBrains Mono, like other money in tables. Edit, Archive and Restore are icon buttons at the end of each row, always visible, with labels for screen readers such as "Archive Pro license". Archive and Restore use lucide-react's archive and archive-restore icons.

The Archived chip is in the label style, fully round like other chips, in the archived chip colors: Sea Mist with Midnight text in light mode, and a dark slate with Sea Mist text in dark mode ([Color tokens](visual-design.md#color-tokens)). It's quiet on purpose, because an archived product needs no attention.

### Product page

The two columns of the other record pages ([Screens](records.md#screens)). The page title is the product's name, with the Archived chip after it and Edit and Archive, or Restore, at the right. The left column holds the details panel: the unit price in JetBrains Mono at the headline figure size, whether it's active or archived, and the lines from R6 at its foot in muted ink. The right column holds the description on a panel of its own, in body text with its line breaks kept, or "No description." in muted ink.

### Product form

A dialog like the other forms, with Name, Description as a box about four lines tall, and Unit price, which shows `$` at its start and its figures in JetBrains Mono. The button reads Save product.
