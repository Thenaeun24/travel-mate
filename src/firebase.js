import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAYF-Gm-tQG84-XpTMoMQklwpS-4yQ6Wfw",
  authDomain: "fire-station-6c2b2.firebaseapp.com",
  databaseURL: "https://fire-station-6c2b2-default-rtdb.firebaseio.com",
  projectId: "fire-station-6c2b2",
  storageBucket: "fire-station-6c2b2.firebasestorage.app",
  messagingSenderId: "264965329371",
  appId: "1:264965329371:web:822a4ba9be8741146d17fe",
  measurementId: "G-C87W63Z6G8"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export { db, auth };
