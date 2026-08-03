import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCl0R77R1ua88jmBVbd6RDayBTs8tjD4Zw",
  authDomain: "playoff-predictor-934b7.firebaseapp.com",
  projectId: "playoff-predictor-934b7",
  storageBucket: "playoff-predictor-934b7.firebasestorage.app",
  messagingSenderId: "202745059405",
  appId: "1:202745059405:web:884ca8c1c41a13e9702404",
  measurementId: "G-LL3S2MNMYY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Exporting these as constants
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Setting high-level custom parameters (Optional but good for web UX)
googleProvider.setCustomParameters({ prompt: 'select_account' });