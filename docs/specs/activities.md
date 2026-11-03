# Spec: Activities and timelines

Part of the [spec](../spec.md), which has the summary, the terms, the quality rules and the index of every area file.

## Activities and timelines

- **A1.** Every contact page and deal page has a Log activity button. An activity relates to one contact or one deal, never both. Once logged, it can't move to another contact or deal, so the activity form has no picker for it.
- **A2.** Activities can be edited and deleted from any timeline they appear on. Stage-change entries can't be edited or deleted, and go only when their deal is deleted.
- **A3.** A follow-up can be ticked done on a timeline or on the dashboard, and unticked on a timeline. Once done, it leaves the dashboard but stays on its timeline, marked done.
- **A4.** Timelines show the newest first. Each entry shows its type, when it happened, its description, any follow-up, and a link to the contact or deal it belongs to.
- **A5.** Timelines show 50 entries at first, with a Show more button that reaches the end, however long the timeline is. If it fails, what's showing stays.
- **A6.** A deal's entries follow its main contact: changing the main contact moves them to the new contact's timeline.

| Timeline on | Shows |
|---|---|
| Deal | Its activities and stage changes |
| Contact | Their activities, plus the activities and stage changes of deals where they're the main contact |
| Organization | Everything from its contacts and its deals, each entry once |
