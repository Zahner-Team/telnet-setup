import { db, serverTimestamp } from '../helpers/firebase.js';
import { zeaDebug } from '../helpers/zeaDebug.js';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Session {
  #latestSelectedAnchor;

  constructor(id) {
    if (!id) {
      throw new Error('Missing `id` arg.');
    }
    this.id = id;
  }

  async init() {
    await this.#observeSession();
  }

  async addPoint(point, anchor) {
    if (!anchor && !this.#latestSelectedAnchor) {
      console.warn(
        'Missing `anchor` and `latestSelectedAnchor`. Did you remember to #init the session?'
      );
      return;
    }

    console.log('anchor selected: ', anchor);
    const theAnchor = anchor || this.#latestSelectedAnchor;

    // Create a document reference for a new point
    const docRef = doc(collection(db, 'points'));

    const data = {
      id: docRef.id, // Use docRef.id for the document ID
      createdAt: serverTimestamp(),
      sessionId: this.id,
      anchor: theAnchor,
      string: point,
    };

    await setDoc(docRef, data);

    zeaDebug("Created new point with id '%s' and anchor '%s'", docRef.id, theAnchor);

    return docRef.id; // Return the new document ID
  }

  onCommandCreated(callback) {
    const q = query(
      collection(db, 'commands'),
      where('sessionId', '==', this.id),
      where('isInvoked', '==', false),
      orderBy('createdAt')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          callback(change.doc.data());
        }
      });
    });

    return unsub;
  }

  async #observeSession() {
     //console.log("db sessions", this.id, '\n', db);

    const docRef = doc(collection(db, 'sessions'), this.id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error(
        `Session not found. Id: "${this.id}". Session must be created using the web app`
      );
    }

    zeaDebug("Found existing session with id '%s'", this.id);

    if (this.unsub) {
      this.unsub();
    }
    
    this.unsub = onSnapshot(docRef, (snapshot) => {
      this.#latestSelectedAnchor = snapshot.data().latestSelectedAnchor || null;
      console.log("current anchor selected", this.#latestSelectedAnchor);
    }, (error) => {
      console.log(`Encountered error: ${error}`);
    });
  }

  // Example method to mark a command as invoked (not originally in your code)
  async #markAsInvoked() {
    try {
      const docRef = doc(collection(db, 'commands'), this.data.id);
      await setDoc(docRef, { isInvoked: true }, { merge: true });
      console.log(`Command marked as invoked for anchor: ${this.data.anchor}`);
    } catch (error) {
      console.error('Error marking command as invoked:', error);
    }
  }
}

export { Session };
