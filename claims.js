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
const connectionStatus = document.querySelector("#claim-connection-status");
const configReady = !Object.values(firebaseConfig).some((value) =>
  String(value).startsWith("PASTE_")
);
let statusTimer;

function setConnectionStatus(message) {
  connectionStatus.textContent = message;
  clearTimeout(statusTimer);
}

function flashConnectionStatus(message) {
  setConnectionStatus(message);
  statusTimer = setTimeout(() => {
    if (connectionStatus.textContent === message) setConnectionStatus("");
  }, 4000);
}

function setMessage(card, message) {
  card.querySelector("[data-claim-message]").textContent = message;
}

function showSetupState() {
  setConnectionStatus("Purchase tracking is not set up yet.");
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

    setConnectionStatus("Connecting to purchase status...");
    cards.forEach((card) => setMessage(card, "Connecting..."));

    const userCredential = await signInAnonymously(auth);
    const user = userCredential.user;
    const claimsRef = ref(database, "claims");
    let currentClaims = {};
    let hasLoadedClaims = false;

    onValue(claimsRef, (snapshot) => {
      currentClaims = snapshot.val() || {};
      const isFirstSnapshot = !hasLoadedClaims;
      hasLoadedClaims = true;

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
        if (isFirstSnapshot) setMessage(card, "");
      });

      if (isFirstSnapshot) setConnectionStatus("");
    }, () => {
      setConnectionStatus("Could not load purchase status. Please refresh.");
      cards.forEach((card) => setMessage(card, "Could not load purchase status. Please refresh."));
    });

    toggles.forEach((toggle) => {
      toggle.addEventListener("change", async () => {
        const card = toggle.closest("[data-item-id]");
        const itemId = card.dataset.itemId;
        const itemRef = ref(database, `claims/${itemId}`);
        saving.add(itemId);
        toggle.disabled = true;
        setConnectionStatus("Saving purchase status...");
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
            flashConnectionStatus("Someone else already marked this bought.");
          } else if (!result.committed) {
            setMessage(card, "No change was saved. Please try again.");
            flashConnectionStatus("No change was saved. Please try again.");
          } else {
            if (result.snapshot.exists()) currentClaims[itemId] = result.snapshot.val();
            else delete currentClaims[itemId];
            const message = result.snapshot.exists() ? "Marked as bought." : "Mark removed.";
            setMessage(card, message);
            flashConnectionStatus(message);
          }
        } catch (error) {
          console.error("Could not update purchase status", error);
          setMessage(card, "Could not save. Check the connection and database rules.");
          flashConnectionStatus("Could not save. Check the connection and database rules.");
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
    setConnectionStatus("Could not connect to purchase status. Please refresh.");
    cards.forEach((card) => setMessage(card, "Could not connect. Please refresh."));
  }
}
