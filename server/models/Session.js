// server/models/Session.js
import { db, serverTimestamp } from '../helpers/firebase.js';
import { collection, doc, setDoc, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore';
import EventEmitter from 'events';
import { logger } from '../helpers/logger.js';

class Session extends EventEmitter {
  constructor(id) {
    super();
    if (!id) {
      throw new Error('Missing `id` argument.');
    }
    this.id = id;
    // Instead of obtaining the latest anchor from Firestore, we hard-code it.
    this.defaultAnchor = 'DefaultAnchor';
    this.unsub = null;
  }

  /**
   * Initialize the session.
   * Since we're no longer using a Firestore sessions doc, we simply set a default anchor.
   */
  async init() {
    // You could, if desired, write a new session doc to Firestore here.
    // For now, we just log and use a hard-coded default anchor.
    logger.info(`Using hard-coded session ${this.id} with default anchor: ${this.defaultAnchor}`);
  }

  /**
   * Adds a point to the session and optionally writes it to Firestore.
   * If no anchor is provided, the defaultAnchor is used.
   */
  async addPoint(point, anchor) {
    const theAnchor = anchor || this.defaultAnchor;
    logger.info(`Adding point "${point}" for anchor: ${theAnchor}`);
    const docRef = doc(collection(db, 'points'));
    const data = {
      id: docRef.id,
      createdAt: serverTimestamp(),
      sessionId: this.id,
      anchor: theAnchor,
      string: point,
    };
  
    try {
      await setDoc(docRef, data);
      logger.info(`Point added to Firestore: ${point} for anchor: ${theAnchor}`);
    } catch (error) {
      logger.error('Error adding point to Firestore:', error);
    }
  }

  /**
   * Sets up a listener for new commands in Firestore.
   * This query still filters by sessionId so that you only process commands
   * that are meant for this hard-coded session.
   */
  onCommandCreated(callback) {
    const q = query(
      collection(db, 'commands'),
      where('sessionId', '==', this.id),
      where('isInvoked', '==', false),
      orderBy('createdAt')
    );
  
    const unsub = onSnapshot(q, (snapshot) => {
      logger.info(`Command snapshot received for session ${this.id}. Change count: ${snapshot.docChanges().length}`);
      snapshot.docChanges().forEach((change) => {
        logger.info(`Change detected: ${change.type}`, change.doc.data());
        if (change.type === 'added') {
          // Attach the document ID
          const data = change.doc.data();
          data.id = change.doc.id;
          callback(data);
        }
      });
    }, (error) => {
      logger.error(`Error listening to commands for session ${this.id}:`, error);
    });
  
    this.unsub = unsub;
  }

  /**
   * Clears any pending (non-invoked) commands from Firestore.
   */
  async clearPendingCommands() {
    try {
      const q = query(
        collection(db, 'commands'),
        where('sessionId', '==', this.id),
        where('isInvoked', '==', false)
      );
      const snapshot = await getDocs(q);
      for (const cmdDoc of snapshot.docs) {
        await setDoc(doc(db, 'commands', cmdDoc.id), { isInvoked: true }, { merge: true });
        logger.info(`Marked command ${cmdDoc.id} as invoked to clear pending backlog.`);
      }
    } catch (error) {
      logger.error('Error clearing pending commands:', error);
    }
  }

  cleanup() {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
      logger.info(`Cleaned up listeners for session ${this.id}`);
    }
  }
}

export { Session };
