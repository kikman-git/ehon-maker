import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { cloud } from './config';

export interface Services { app: FirebaseApp; auth: Auth; db: Firestore; functions: Functions }

let services: Services | null = null;

/** One app per tab. Firestore keeps no persistent cache: the repository's local store is the durable copy. */
export function firebase(): Services {
  if (services) return services;
  if (!cloud) throw new Error('Cloud is not configured.');
  const app = initializeApp({ apiKey: cloud.apiKey, authDomain: cloud.authDomain, projectId: cloud.projectId, appId: cloud.appId });
  if (cloud.appCheckSiteKey) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(cloud.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  const functions = getFunctions(app, 'asia-northeast1');
  if (cloud.emulatorHost) {
    connectAuthEmulator(auth, `http://${cloud.emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, cloud.emulatorHost, 8080);
    connectFunctionsEmulator(functions, cloud.emulatorHost, 5001);
  }
  services = { app, auth, db, functions };
  return services;
}
