//import  randomUUID  from 'crypto-random-string'
//import  randomUUID  from 'crypto'
//import { randomUUID } from 'crypto-random-string.js'
//const randomUUID = require('crypto-random-string')
// import { db, serverTimestamp } from '../helpers/firebase.js'
// import { zeaDebug } from '../helpers/zeaDebug.js'

// import {expressServer} from '../StreamBrowser.js'
// import {streamBrowser} from '../../index.js'

import { initializeApp } from 'firebase/app';
// import { getFirestore} from 'firebase/firestore/lite';
// import firebase from 'firebase/compat/app';
// import firebase from 'firebase/app';
// import 'firebase/firestore';
import { collection, getDocs, getFirestore, orderBy, query } from "firebase/firestore";

// import serviceAccount from './firebase_service_account_key.json' //assert { type: 'json' }
//import serviceAccount from '../../firebase_service_account_key.json';




class ClientSession {

  constructor() {

    console.log("ClientSession constructor")
    this.name = 'Polygon';

  }


  async init() {
    await this.observeSession()
    return this.dbSessions;
  }

  // async #observeSession() {
  async observeSession() {

    // const firebaseConfig = {
    //   apiKey: "AIzaSyCwm0Nex3W_jTBFZWAofXH7r4mTa3bdosw",
    //   authDomain: "zahner-production-8e2af.firebaseapp.com",
    //   projectId: "zahner-production-8e2af",
    //   storageBucket: "zahner-production-8e2af.appspot.com",
    //   messagingSenderId: "379521829525",
    //   appId: "1:379521829525:web:ca6517410571680ab6299c",
    //   measurementId: "G-7X3BB5E4MG"
    // };

    // const firebaseConfig = {
    //   apiKey: "AIzaSyCIoL9RlD15JzJo1XDPBzTm1xR6StBUaxI",
    //   authDomain: "csc-surveylink.firebaseapp.com",
    //   projectId: "csc-surveylink",
    //   storageBucket: "csc-surveylink.appspot.com",
    //   messagingSenderId: "473701857342",
    //   appId: "1:473701857342:web:73573aa5b8fc7db50b396f",
    //   measurementId: "G-71DM2KZP94"
    // };

    // Base template firebase config
    const firebaseConfig = {
      apiKey: "AIzaSyB9vUEPeFPFT-eBs7b5fbFDItvhLdvnSkE",
      authDomain: "surveylink-base-template.firebaseapp.com",
      projectId: "surveylink-base-template",
      storageBucket: "surveylink-base-template.firebasestorage.app",
      messagingSenderId: "430020659734",
      appId: "1:430020659734:web:990ed653f0456a1ccc4337"
    };


    // const firebaseConfig = {
    //   apiKey: "AIzaSyDhrTyj2hISapfNqAyGEEb5p2s47wi9_mA",
    //   authDomain: "zahner-development.firebaseapp.com",
    //   databaseURL: "https://zahner-development-default-rtdb.firebaseio.com",
    //   projectId: "zahner-development",
    //   storageBucket: "zahner-development.appspot.com",
    //   messagingSenderId: "71481654606",
    //   appId: "1:71481654606:web:f8d33f05cc676ffe27721f",
    //   measurementId: "G-7P92N16XE1"
    // };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // console.log("db", db)

    // const querySnapshot = await getDocs(collection(db, "sessions"));
    // const dbGrab = await getDocs(collection(db, "sessions"));
    // const querySnapshot = query(dbGrab, orderBy("name", "desc"));
    const dbGrab = await query(collection(db, "sessions"), orderBy("name", "asc"));
    const querySnapshot = await getDocs(dbGrab);

    const docs = []
    querySnapshot.forEach((doc) => {

      docs.push({ id: doc.id, ...doc.data() });
      // console.log(`${doc.id} => ${doc.data()}`);
      // this.#dbSessions = docs;
      this.dbSessions = docs;
    });



  }



}

export { ClientSession }
