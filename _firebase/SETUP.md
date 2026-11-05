# Firebase setup

This site uses Firebase Authentication's anonymous provider and Realtime Database. Visitors do not create or enter an account; the browser gets a temporary Firebase identity so the database can protect each claim.

1. Create a Firebase project on the **Spark** plan. Realtime Database's Spark allowance is 1 GB stored and 10 GB downloaded per month, with no payment method required. See [Firebase pricing](https://firebase.google.com/pricing).
2. In the project, add a **Web app** and copy its Firebase config into `firebase-config.js`. Copy the `databaseURL` from the Realtime Database page as well.
3. Create a **Realtime Database** in locked mode.
4. In **Authentication > Sign-in method**, enable **Anonymous**.
5. In **Authentication > Settings > Authorized domains**, add `jimna-h.github.io` (and any custom domain used for the site).
6. In **Realtime Database > Rules**, paste the contents of `_firebase/database.rules.json` and publish them.

The Firebase web config is visible to site visitors by design. Access is controlled by Realtime Database rules. The rules let visitors mark an unclaimed item and let the same browser undo its own claim; another browser cannot clear it.

Each wishlist item has a fixed `id` in its YAML entry. Keep that ID if you rename or move the item. When adding an item, give it a new unique ID in that list (for example, the next `james-N` value). Deleting an item leaves an unused record in Firebase, which does not affect the other items.
