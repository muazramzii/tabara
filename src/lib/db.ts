import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export type TxnType = "expense" | "income";

export interface Transaction {
  id: string;
  amount: number;
  type: TxnType;
  category: string;
  note?: string;
  date: Date;
}

export interface UserProfile {
  income: number;
  savingsGoal: number;
  budgets?: Record<string, number>; // categoryId -> monthly limit
}

export async function saveUserProfile(uid: string, p: UserProfile) {
  await setDoc(
    doc(db, "users", uid),
    { ...p, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function saveBudgets(uid: string, budgets: Record<string, number>) {
  const ref = doc(db, "users", uid);
  try {
    await updateDoc(ref, { budgets, updatedAt: serverTimestamp() });
  } catch {
    await setDoc(ref, { budgets, updatedAt: serverTimestamp() }, { merge: true });
  }
}

export async function addTransaction(
  uid: string,
  txn: { amount: number; type: TxnType; category: string; note?: string }
) {
  const payload: Record<string, unknown> = {
    amount: txn.amount,
    type: txn.type,
    category: txn.category,
    date: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  if (txn.note) payload.note = txn.note;
  await addDoc(collection(db, "users", uid, "transactions"), payload);
}

export async function deleteTransaction(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "transactions", id));
}

export function listenTransactions(
  uid: string,
  cb: (txns: Transaction[]) => void
) {
  const q = query(
    collection(db, "users", uid, "transactions"),
    orderBy("date", "desc")
  );
  return onSnapshot(q, (snap) => {
    const txns = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        amount: data.amount ?? 0,
        type: (data.type ?? "expense") as TxnType,
        category: data.category ?? "other",
        note: data.note,
        date: data.date instanceof Timestamp ? data.date.toDate() : new Date(),
      } as Transaction;
    });
    cb(txns);
  });
}