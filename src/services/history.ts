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
  getDocs, 
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc
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
 * compressImageThumbnail
 * Creates a lightweight base64 thumbnail (<20KB) from any full-size image data URL,
 * ensuring Firestore documents never exceed size limits.
 */
export async function compressImageThumbnail(dataUrl: string, maxDimension: number = 240, quality: number = 0.65): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl || '';
  
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl.slice(0, 30000));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = () => {
        resolve('');
      };
      img.src = dataUrl;
    } catch {
      resolve('');
    }
  });
}

/**
 * Safely parses various timestamp formats into a JavaScript Date
 */
function parseTimestampSafe(rawTimestamp: any): Date {
  if (!rawTimestamp) return new Date();
  if (typeof rawTimestamp.toDate === 'function') {
    try {
      return rawTimestamp.toDate();
    } catch {
      return new Date();
    }
  }
  if (typeof rawTimestamp.seconds === 'number') {
    return new Date(rawTimestamp.seconds * 1000);
  }
  if (rawTimestamp instanceof Date) {
    return rawTimestamp;
  }
  if (typeof rawTimestamp === 'string' || typeof rawTimestamp === 'number') {
    const parsed = new Date(rawTimestamp);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * savePrediction
 * 
 * Saves a new produce scan to the 'predictions' database collection.
 * Attaches the current user's ID, compressed thumbnail, and current timestamp.
 */
export async function savePrediction(data: Omit<PredictionHistoryItem, 'id' | 'timestamp' | 'userId'>): Promise<string | null> {
  // Only save if someone is logged in (either via Google or auto-guest)
  if (!auth.currentUser) {
    console.warn("Cannot save prediction: auth.currentUser is not ready");
    return null;
  }
  
  const path = 'predictions';
  try {
    let safeImageUrl = data.imageUrl;
    if (safeImageUrl && safeImageUrl.length > 40000) {
      safeImageUrl = await compressImageThumbnail(safeImageUrl);
    }

    const payload = {
      userId: auth.currentUser.uid,
      produceType: data.produceType,
      qualityScore: Number(data.qualityScore),
      rulHours: Number(data.rulHours),
      temperatureK: Number(data.temperatureK || 293.15),
      humidity: Number(data.humidity || 60),
      timestamp: serverTimestamp(),
      ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
      ...(data.isCorrect !== undefined ? { isCorrect: data.isCorrect } : {}),
      ...(data.correctedType ? { correctedType: data.correctedType } : {}),
      ...(data.alertEnabled !== undefined ? { alertEnabled: data.alertEnabled } : {}),
      ...(data.alertThreshold !== undefined ? { alertThreshold: data.alertThreshold } : {}),
    };

    const docRef = await addDoc(collection(db, path), payload);
    console.log("Prediction saved to Firestore successfully:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Firestore savePrediction error:", error);
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      // Ignored for graceful degradation
    }
    return null;
  }
}

/**
 * updatePrediction
 * 
 * Updates fields of an existing scan record (e.g., when the user changes
 * the fruit type, toggles alerts, or verifies correctness).
 */
export async function updatePrediction(id: string, data: Partial<Omit<PredictionHistoryItem, 'id' | 'timestamp' | 'userId'>>) {
  if (!auth.currentUser || !id) return;
  
  const path = `predictions/${id}`;
  try {
    const docRef = doc(db, 'predictions', id);
    await updateDoc(docRef, data);
    console.log("Prediction updated in Firestore successfully:", id);
  } catch (error) {
    console.error("Firestore updatePrediction error:", error);
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      // Ignored for graceful degradation
    }
  }
}

/**
 * getHistory
 * 
 * Fetches the user's past scans from Firestore, sorted by most recent first.
 */
export async function getHistory(limitCount: number = 20): Promise<PredictionHistoryItem[]> {
  if (!auth.currentUser) {
    console.log("getHistory skipped: auth.currentUser is not yet authenticated");
    return [];
  }
  
  const path = 'predictions';
  try {
    // Look up only the scans that belong to the currently logged in user
    const q = query(
      collection(db, path),
      where('userId', '==', auth.currentUser.uid)
    );
    
    const querySnapshot = await getDocs(q);
    const results: PredictionHistoryItem[] = querySnapshot.docs.map(d => {
      const docData = d.data();
      return {
        id: d.id,
        userId: docData.userId || auth.currentUser?.uid || '',
        produceType: docData.produceType || 'produce',
        qualityScore: typeof docData.qualityScore === 'number' ? docData.qualityScore : 0.8,
        rulHours: typeof docData.rulHours === 'number' ? docData.rulHours : 24,
        temperatureK: typeof docData.temperatureK === 'number' ? docData.temperatureK : 293.15,
        humidity: typeof docData.humidity === 'number' ? docData.humidity : 60,
        imageUrl: docData.imageUrl || undefined,
        isCorrect: docData.isCorrect,
        correctedType: docData.correctedType,
        alertEnabled: docData.alertEnabled,
        alertThreshold: docData.alertThreshold,
        timestamp: parseTimestampSafe(docData.timestamp),
      };
    });

    // Sort newest to oldest right in JavaScript
    const sorted = results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limitCount);
    console.log(`Loaded ${sorted.length} scan records from Firestore`);
    return sorted;
  } catch (error) {
    console.error("Firestore getHistory error:", error);
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      // Ignored for graceful degradation
    }
    return [];
  }
}

/**
 * deletePrediction
 * 
 * Deletes a scan record from Firestore by ID.
 */
export async function deletePrediction(id: string): Promise<boolean> {
  if (!auth.currentUser || !id) return false;
  const path = `predictions/${id}`;
  try {
    const docRef = doc(db, 'predictions', id);
    await deleteDoc(docRef);
    console.log("Prediction deleted from Firestore successfully:", id);
    return true;
  } catch (error) {
    console.error("Firestore deletePrediction error:", error);
    try {
      handleFirestoreError(error, OperationType.DELETE, path);
    } catch {
      // Ignored
    }
    return false;
  }
}
