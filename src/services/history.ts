/**
 * History Service for BioFresh-CV
 * 
 * This file handles saving, loading, and updating past produce scans in Firebase Firestore.
 * That way, users don't lose their previous scans and can see freshness over time!
 */
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  Timestamp, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

// Simple list of database action names for error tracking
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// Information attached when an error happens in Firestore
interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

/**
 * Helper function to print clean, readable error logs if a Firestore database request fails
 */
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Shape of a saved scan record in history
export interface PredictionHistoryItem {
  id?: string; // Unique database ID
  userId: string; // The user or guest who scanned it
  produceType: string; // e.g. 'avocado' or 'banana'
  qualityScore: number; // 0.0 to 1.0
  rulHours: number; // Remaining useful life in hours
  temperatureK: number; // Storage temperature in Kelvin
  humidity: number; // Moisture %
  timestamp: any; // Date and time when scanned
  imageUrl?: string; // Captured photo thumbnail
  isCorrect?: boolean; // If the user clicked "Correct" or corrected the fruit
  correctedType?: string; // If corrected, what fruit they chose
  alertEnabled?: boolean; // Whether the user wants a reminder before it expires
  alertThreshold?: number; // Hours remaining to trigger alert (e.g. 12h)
}

/**
 * savePrediction
 * 
 * Saves a new produce scan to the 'predictions' database collection.
 * Attaches the current user's ID and current timestamp.
 */
export async function savePrediction(data: Omit<PredictionHistoryItem, 'id' | 'timestamp' | 'userId'>) {
  // Only save if someone is logged in (either via Google or auto-guest)
  if (!auth.currentUser) return null;
  
  const path = 'predictions';
  try {
    const docRef = await addDoc(collection(db, path), {
      ...data,
      userId: auth.currentUser.uid,
      timestamp: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * updatePrediction
 * 
 * Updates fields of an existing scan record (e.g., when the user changes
 * the fruit type, toggles alerts, or verifies correctness).
 */
export async function updatePrediction(id: string, data: Partial<Omit<PredictionHistoryItem, 'id' | 'timestamp' | 'userId'>>) {
  if (!auth.currentUser) return;
  
  const path = `predictions/${id}`;
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const docRef = doc(db, 'predictions', id);
    await updateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * getHistory
 * 
 * Fetches the user's past scans from Firestore, sorted by most recent first.
 */
export async function getHistory(limitCount: number = 20) {
  if (!auth.currentUser) return [];
  
  const path = 'predictions';
  try {
    // Look up only the scans that belong to the currently logged in user
    const q = query(
      collection(db, path),
      where('userId', '==', auth.currentUser.uid)
    );
    
    const querySnapshot = await getDocs(q);
    const results = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: (doc.data().timestamp as Timestamp).toDate(),
    })) as PredictionHistoryItem[];

    // Sort newest to oldest right in JavaScript
    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limitCount);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
