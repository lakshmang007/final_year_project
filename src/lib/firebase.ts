/**
 * Firebase Setup & Authentication
 * 
 * In simple words:
 * This file connects our app to Google Firebase for:
 * 1. User login (Google Account or Guest login)
 * 2. Firestore database (saving and retrieving past scans)
 */
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  signInAnonymously 
} from 'firebase/auth';
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
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/**
 * loginWithGoogle
 * 
 * Attempts popup login first, and falls back to redirect for mobile browsers if popup fails or is blocked.
 */
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    // If on mobile or popup blocked, try redirect flow
    if (
      error?.code === 'auth/popup-blocked' || 
      error?.code === 'auth/popup-closed-by-user' ||
      /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    ) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.log("Switching to signInWithRedirect for mobile/popup restriction...");
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
    }
    console.error("Google Login failed:", error);
    throw error;
  }
};

/**
 * checkRedirectLogin
 * 
 * Checks if user just completed a mobile redirect login.
 */
export const checkRedirectLogin = async () => {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (error) {
    console.warn("Redirect result check:", error);
    return null;
  }
};

/**
 * loginAnonymously
 * 
 * Creates a frictionless guest session if Anonymous Sign-in is enabled in Firebase.
 * If disabled in Firebase Console, returns null gracefully without throwing an uncaught error.
 */
export const loginAnonymously = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error: any) {
    console.warn("Anonymous auth disabled or restricted in Firebase console:", error?.code || error?.message);
    return null;
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
