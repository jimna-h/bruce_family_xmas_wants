---
layout: null
---
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  getDatabase,
  onValue,
  ref,
  runTransaction
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

window.claimTrackerStarted = true;

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

function waitFor(promise, milliseconds, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });
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

    setConnectionStatus("Connecting to Firebase...");
    cards.forEach((card) => setMessage(card, "Connecting..."));

    const userCredential = await waitFor(
      signInAnonymously(auth),
      15000,
      "Firebase sign-in timed out."
    );
    const user = userCredential.user;
    const claimsRef = ref(database, "claims");
    let currentClaims = {};
    let hasLoadedClaims = false;
    const databaseTimeout = setTimeout(() => {
      if (!hasLoadedClaims) {
        setConnectionStatus("The database has not responded. Check its URL and published read rules.");
      }
    }, 15000);

    onValue(claimsRef, (snapshot) => {
      currentClaims = snapshot.val() || {};
      const isFirstSnapshot = !hasLoadedClaims;
      hasLoadedClaims = true;
      clearTimeout(databaseTimeout);

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
    }, (error) => {
      clearTimeout(databaseTimeout);
      console.error("Could not read purchase status", error);
      const message = error.code === "PERMISSION_DENIED"
        ? "Firebase rules denied access. Check the published database rules."
        : "Could not load purchase status. Check the database URL and connection.";
      setConnectionStatus(message);
      cards.forEach((card) => setMessage(card, message));
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
    let message = "Could not connect to Firebase. Check the project settings and connection.";
    if (error.message.includes("timed out")) {
      message = "Firebase sign-in is taking too long. Check Anonymous sign-in and authorized domains.";
    } else if (error.code === "auth/unauthorized-domain") {
      message = "This website is not in Firebase Authentication's authorized domains.";
    } else if (error.code === "auth/operation-not-allowed") {
      message = "Enable Anonymous sign-in in Firebase Authentication.";
    } else if (error.code === "auth/network-request-failed") {
      message = "Could not reach Firebase Authentication. Check the internet connection.";
    }
    setConnectionStatus(message);
    cards.forEach((card) => setMessage(card, message));
  }
}
