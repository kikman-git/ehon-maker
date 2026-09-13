import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

async function purgeExpired(db: Firestore, name: string, now: number): Promise<number> {
  let removed = 0;
  for (let page = 0; page < 50; page++) {
    const expired = await db.collection(name).where('expiresAt', '<=', Timestamp.fromMillis(now)).limit(200).get();
    if (expired.empty) break;
    const batch = db.batch();
    expired.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    removed += expired.size;
  }
  return removed;
}

/** Expired jobs and spent or abandoned QR login requests; both carry an `expiresAt`. */
export async function cleanupJobs(db: Firestore, now = Date.now()): Promise<number> {
  return await purgeExpired(db, 'jobs', now) + await purgeExpired(db, 'loginRequests', now);
}

export async function applyBudgetAlert(db: Firestore, alert: unknown, thresholdYen: number): Promise<boolean> {
  if (!alert || typeof alert !== 'object') return false;
  const { currencyCode, costAmount } = alert as Record<string, unknown>;
  if (currencyCode !== 'JPY' || typeof costAmount !== 'number' || !Number.isFinite(costAmount) || costAmount < thresholdYen) return false;
  await db.doc('config/flags').set({ aiEnabled: false, budgetDisabledAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}
