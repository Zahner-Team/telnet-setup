// Import the necessary Firebase modules
import { initializeApp } from 'firebase/app';
import { getFirestore, serverTimestamp } from 'firebase/firestore';

// Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyCIoL9RlD15JzJo1XDPBzTm1xR6StBUaxI",
  authDomain: "csc-surveylink.firebaseapp.com",
  projectId: "csc-surveylink",
  storageBucket: "csc-surveylink.appspot.com",
  messagingSenderId: "473701857342",
  appId: "1:473701857342:web:73573aa5b8fc7db50b396f",
  measurementId: "G-71DM2KZP94"
};

// const firebaseConfig = {
//   apiKey: "AIzaSyCwm0Nex3W_jTBFZWAofXH7r4mTa3bdosw",
//   authDomain: "zahner-production-8e2af.firebaseapp.com",
//   projectId: "zahner-production-8e2af",
//   storageBucket: "zahner-production-8e2af.appspot.com",
//   messagingSenderId: "379521829525",
//   appId: "1:379521829525:web:8e360f3265ebb300b6299c",
//   measurementId: "G-9M6F508LJ7",

// };

// Initialize Firebase app with the configuration
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Export the initialized app and Firestore instance
export { app, db, serverTimestamp };
//aam
