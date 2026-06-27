// Firebase initialization and Firestore data access.
// All Firestore-specific logic lives here so script.js never touches
// the Firebase SDK directly — it only calls the functions exported below.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TAKES_COLLECTION = "takes";
const MAX_ITEMS = 200;

/**
 * Checks whether a username has already submitted a take.
 * The document ID is the lowercased username, so this is also how
 * the "one submission per account" rule is enforced server-side:
 * Firestore security rules can additionally block overwriting an
 * existing document (see README.md for the recommended rules).
 */
export async function hasUserSubmitted(username){
  const ref = doc(db, TAKES_COLLECTION, username.toLowerCase());
  const snap = await getDoc(ref);
  return snap.exists();
}

/**
 * Saves a new take. Uses the username as the document ID so a second
 * write attempt for the same username overwrites instead of duplicating
 * — combined with hasUserSubmitted() this keeps it to one per account.
 *
 * Firestore caps each document at ~1MB. If the pfp data URL is too
 * large (e.g. compression didn't bring it down enough), the take is
 * still saved — just without the photo — rather than failing outright.
 */
const PFP_SAFE_BYTE_LIMIT = 700000; // leaves headroom under Firestore's 1MB doc limit

export async function submitTake(username, text, pfpDataUrl){
  let safePfp = pfpDataUrl || null;
  if(safePfp && safePfp.length > PFP_SAFE_BYTE_LIMIT){
    console.warn("Profile picture too large for Firestore, saving take without it.");
    safePfp = null;
  }

  const ref = doc(db, TAKES_COLLECTION, username.toLowerCase());
  await setDoc(ref, {
    username: username,
    text: text,
    pfp: safePfp,
    createdAt: serverTimestamp()
  });
}

/**
 * Subscribes to the most recent takes (newest first, capped at
 * MAX_ITEMS). Calls onUpdate(items) every time the data changes,
 * including immediately with the current snapshot.
 * Returns an unsubscribe function.
 */
export function subscribeToTakes(onUpdate){
  const q = query(
    collection(db, TAKES_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(MAX_ITEMS)
  );

  return onSnapshot(q, (snapshot)=>{
    const items = snapshot.docs.map(d=>{
      const data = d.data();
      return {
        username: data.username,
        text: data.text,
        pfp: data.pfp || null
      };
    });
    onUpdate(items);
  });
}

export { MAX_ITEMS };
