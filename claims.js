import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  getDatabase,
  onValue,
  ref,
  runTransaction
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const toggles = [...document.querySelectorAll("[data-claim-toggle]")];
const cards = [...document.querySelectorAll("[data-item-id]")];
const saving = new Set();
const configReady = !Object.values(firebaseConfig).some((value) =>
  String(value).startsWith("PASTE_")
);

function setMessage(card, message) {
  card.querySelector("[data-claim-message]").textContent = message;
}

function showSetupState() {
  toggles.forEach((toggle) => {
    toggle.disabled = true;
    setMessage(toggle.closest("[data-item-id]"), "Claiming will be available soon.");
  });
}

if (!configReady) {
  showSetupState();
} else {
  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const database = getDatabase(app);

    toggles.forEach((toggle) => { toggle.disabled = true; });
    cards.forEach((card) => setMessage(card, "Connecting..."));

    const userCredential = await signInAnonymously(auth);
    const user = userCredential.user;
    const claimsRef = ref(database, "claims");
    let currentClaims = {};

    onValue(claimsRef, (snapshot) => {
      currentClaims = snapshot.val() || {};

      cards.forEach((card) => {
        const toggle = card.querySelector("[data-claim-toggle]");
        const label = card.querySelector("[data-claim-label]");
        const itemId = card.dataset.itemId;
        const claim = currentClaims[itemId];
        const isMine = claim?.uid === user.uid;
        const isClaimed = Boolean(claim);
        const isPreclaimed = card.dataset.preclaimed === "true";

        toggle.checked = isPreclaimed || isClaimed;
        toggle.disabled = isPreclaimed || saving.has(itemId) || (isClaimed && !isMine);
        label.textContent = isPreclaimed
          ? "Already being bought"
          : isMine
            ? "Marked by you (tap to undo)"
            : isClaimed
              ? "Already marked bought"
              : "Mark as bought";
        setMessage(card, "");
      });
    }, () => {
      cards.forEach((card) => setMessage(card, "Could not load purchase status. Please refresh."));
    });

    toggles.forEach((toggle) => {
      toggle.addEventListener("change", async () => {
        const card = toggle.closest("[data-item-id]");
        const itemId = card.dataset.itemId;
        const itemRef = ref(database, `claims/${itemId}`);
        saving.add(itemId);
        toggle.disabled = true;
        setMessage(card, "Saving...");

        try {
          const result = await runTransaction(itemRef, (current) => {
            if (current === null) return { claimed: true, uid: user.uid };
            if (current.uid === user.uid) return null;
            return;
          }, { applyLocally: false });

          if (!result.committed && result.snapshot.exists()) {
            currentClaims[itemId] = result.snapshot.val();
            setMessage(card, "Someone else already marked this bought.");
          } else {
            if (result.snapshot.exists()) currentClaims[itemId] = result.snapshot.val();
            else delete currentClaims[itemId];
            setMessage(card, result.snapshot.exists() ? "Marked as bought." : "Mark removed.");
          }
        } catch (error) {
          console.error("Could not update purchase status", error);
          setMessage(card, "Could not save. Please try again.");
        } finally {
          saving.delete(itemId);
          const claim = currentClaims[itemId];
          const isPreclaimed = card.dataset.preclaimed === "true";
          toggle.checked = isPreclaimed || Boolean(claim);
          toggle.disabled = isPreclaimed || Boolean(claim && claim.uid !== user.uid);
        }
      });
    });
  } catch (error) {
    console.error("Could not connect to Firebase", error);
    cards.forEach((card) => setMessage(card, "Could not connect. Please refresh."));
  }
}
