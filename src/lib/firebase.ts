/**
 * Firebase Setup & Authentication
 * 
 * In simple words:
 * This file connects our app to Google Firebase for:
 * 1. User login (Google Account or Guest login)
 * 2. Firestore database (saving and retrieving past scans)
 */
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize the Firebase app with configuration
const app = initializeApp(firebaseConfig);

// Connect to Firestore Database (stores scan history)
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Connect to Firebase Authentication (handles user logins)
export const auth = getAuth(app);

// Google Sign-In Provider setup
export const googleProvider = new GoogleAuthProvider();

/**
 * loginWithGoogle
 * 
 * Opens the Google Sign-in popup so the user can log in with their Google account.
 */
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error("Google Login failed:", error);
    throw error;
  }
};

/**
 * loginAnonymously
 * 
 * Creates a frictionless guest session instantly without requiring a password or Google account.
 * This makes sure the app works smoothly immediately on first load.
 */
export const loginAnonymously = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error: any) {
    console.error("Anonymous Login failed:", error);
    throw error;
  }
};

/**
 * testConnection
 * 
 * Quick health-check verifying that the app can connect to Firebase Firestore servers.
 */
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connection verified");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
