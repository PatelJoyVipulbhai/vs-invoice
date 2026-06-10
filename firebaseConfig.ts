import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBUbY165Xd4vnh43nzSgN9GcbSz28oaAas",
  authDomain: "vs-enterprise-1dd97.firebaseapp.com",
  projectId: "vs-enterprise-1dd97",
  storageBucket: "vs-enterprise-1dd97.firebasestorage.app",
  messagingSenderId: "875585957808",
  appId: "1:875585957808:web:a4202b216e0a61a5f9f075"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };
