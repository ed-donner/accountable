# Spec: Sign-in and the team

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Signing in

- **U1.** Signed out, every address shows the sign-in screen, with no top bar. Once signed in, the page at that address opens, so a link someone sent still lands where it points.
- **U2.** In the shared app, people sign in with their email and password, through Supabase Auth. The Sign in button works once, however quickly it's pressed. A wrong email or password says "That email and password don't match." and keeps the email. If Supabase can't be reached, the screen says "Can't reach the sign-in service. Check your internet connection." If Supabase is refusing tries for a while, the screen says "Too many tries. Wait a minute and try again."
- **U3.** There's no sign-up page and no password reset. The project owner adds each person in Supabase's dashboard, with their email, a password and a display name, and sign-ups are turned off there. Supabase's Add user form has no display name field, so `docs/STATUS.md` says how to set one.
- **U4.** Once signed in, a person stays signed in on that browser, through refreshes and restarts, until they sign out. Each browser signs in separately.
- **U5.** Sign out is in the menu ([N7](shell.md#app-shell)). It returns to the sign-in screen at the Dashboard's address, and drops every record the app had read, every message still showing, buttons and all, and the Copilot's conversation, with anything it was still doing (Z2), so nothing from that session shows to whoever signs in next. A message from a save that finishes after sign-out isn't shown at all. Other tabs in the same browser show the sign-in screen straight away, and at the latest the next time they reach the backend. In the shared app they also show U6's message, because Supabase's client can't tell another tab's sign-out from a session that ended.
- **U6.** If a session ends any other way, such as the person being removed in Supabase, the backend refuses the next request and the app shows the sign-in screen with "Your session has ended. Sign in again." Anything typed into an open form is lost.
- **U7.** The backend refuses every request that doesn't carry a valid token, and takes the person from the token, never from the request. [Security](security.md#security) has the details.

## People and names

- **U8.** A person's name is the display name in their Supabase profile, or their email if they have none. Their initials are the first letters of the first and last words of the name, in capitals, such as AR for Alex Rivera, or one letter for a one-word name. Someone with no display name gets the first letter of their email, in capitals.
- **U9.** The backend keeps each person's name and email in a `users` table, taken from their token and updated when it changes. So a name changed in Supabase shows everywhere once that person's token is next renewed, and the records of someone removed from Supabase still show their name.
- **U10.** Each organization, contact, deal, activity, product, quote and bill records who added it and who last changed it, with the times it already keeps. A change is any save that alters the record: an edit, a stage change, a move on the board, ticking or unticking a follow-up, archiving or restoring a product, sending, accepting or declining a quote, marking a bill paid or unpaid, and a won deal making its main contact a customer, which counts as a change to the contact by whoever moved the deal. Accepting a quote counts as a change to its deal, and to the deal's other sent quotes that it declines, by whoever accepted it (Q29). A move within a column counts, but dropping a card back where it was doesn't, and nor does a save that alters nothing, such as pressing Save in an Edit dialog with nothing changed. Changes the app makes around a save leave the other records' last change alone: renumbering the other cards in a column, and blanking a link because its record was deleted. The company settings keep who last changed them by the same rule ([B9](settings.md#saving)).
- **U11.** Stage changes record who made them.
- **U12.** Records from before sign-in existed, which only a local copy can have, have no one recorded. They show their dates with no name until `npm run seed` replaces them.

Where the names show is in [R6](records.md#record-pages), [A7](activities.md#activities-and-timelines), [S2](deals.md#stage-changes), [G11](products.md#product-page), [Q28](quotes.md#the-quote-page), [E18](bills.md#bill-page) and [B9](settings.md#saving).

## The local copy

- **U13.** The local copy has four made-up teammates and no passwords. Its sign-in screen lists them, and clicking one signs in as that person. They are Alex Rivera, Dana Whitfield, Theo Brandt, and `robin@accountable.example`, who has no display name, so the email fallback in U8 always has a case to show. Their emails use `.example` (M5), and their names are unlike any sample contact's.
- **U14.** The sample data puts each record down to one of the made-up teammates as who added it, and some to another as who last changed it, so record pages and timelines show a mix from the start. The shared app's sample data does the same, though the made-up teammates can't sign in there.
- **U15.** Signing in to the local copy survives a restart of the app, so the restart in C3 doesn't sign anyone out.
- **U16.** The local copy's sign-in exists only in the local copy. The shared app has no such screen or routes, whatever the request.

## Screens

### Sign-in screen

The page background in the current mode, with one panel in the middle, 400px wide. The panel holds the Accountable wordmark, set as in the top bar, then "Sign in" as a section heading.

In the shared app, the panel has Email and Password fields, labeled, and a full-width Sign in button in Sea Green with Midnight text. Field errors sit beside their field, as in F2: "Enter your email" and "Enter your password". The messages in U2 and U6 sit above the button, in ink, on the page color, rounded like inputs. Enter in either field signs in.

In the local copy, the panel says "This is a local copy with made-up data. Choose who to sign in as." in muted ink, then lists the four teammates as full-width buttons. Each shows the person's initials in the same circle as the menu button ([Shell](shell.md#shell)), their name, and their email in muted ink below it. Hover takes the page color, like the section links.

The theme is this browser's saved choice ([L2](shell.md#theme)), and there's no menu to change it until someone signs in.
