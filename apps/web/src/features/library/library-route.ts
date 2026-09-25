/**
 * The Library's own address.
 *
 * This file used to carry a request as well: `/library?mode=open&record=…&id=…`,
 * which is how the Database's row press asked the Library to open one record's page.
 * The owner's round 22 removed the question — a record has an address of its own now
 * (`record-route.ts`), and one screen opens and edits it — so what is left is the one
 * thing that is still the Library's: where the list lives.
 */
export const LIBRARY_HREF = "/library";
