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

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

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

export interface PredictionHistoryItem {
  id?: string;
  userId: string;
  produceType: string;
  qualityScore: number;
  rulHours: number;
  temperatureK: number;
  humidity: number;
  timestamp: any;
  imageUrl?: string;
}

export async function savePrediction(data: Omit<PredictionHistoryItem, 'id' | 'timestamp' | 'userId'>) {
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

export async function getHistory(limitCount: number = 20) {
  if (!auth.currentUser) return [];
  
  const path = 'predictions';
  try {
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

    // client side sort if index is missing or to avoid complex rules
    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limitCount);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
