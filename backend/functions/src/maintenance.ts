import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

export async function cleanupJobs(db: Firestore, now = Date.now()): Promise<number> {
  let removed = 0;
  for (let page = 0; page < 50; page++) {
    const expired = await db.collection('jobs').where('expiresAt', '<=', Timestamp.fromMillis(now)).limit(200).get();
    if (expired.empty) break;
    const batch = db.batch();
    expired.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    removed += expired.size;
  }
  return removed;
}

export async function applyBudgetAlert(db: Firestore, alert: unknown, thresholdYen: number): Promise<boolean> {
  if (!alert || typeof alert !== 'object') return false;
  const { currencyCode, costAmount } = alert as Record<string, unknown>;
  if (currencyCode !== 'JPY' || typeof costAmount !== 'number' || !Number.isFinite(costAmount) || costAmount < thresholdYen) return false;
  await db.doc('config/flags').set({ aiEnabled: false, budgetDisabledAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}
