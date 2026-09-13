/** Cloud settings from Vite env. A checkout without them is a fully usable local book maker. */
export interface CloudConfig {
  projectId: string;
  apiKey: string;
  authDomain: string;
  appId: string;
  emulatorHost: string | null;
  functionsUrl: string;
  assetsUrl: string | null;
  /** The published story templates (decision #60); null reads the dev server's local copy. */
  templatesUrl: string | null;
  appCheckSiteKey: string | null;
}

const env = import.meta.env;
const emulatorHost = (env.VITE_EMULATOR_HOST as string | undefined)?.trim() || null;

export const cloud: CloudConfig | null = emulatorHost
  ? {
      projectId: 'demo-ehon',
      apiKey: 'AIzaSyDemoEhonLocalEmulatorOnly00000000000',
      authDomain: `${emulatorHost}:9099`,
      appId: '1:1234567890:web:0123456789abcdef',
      emulatorHost,
      functionsUrl: `http://${emulatorHost}:5001/demo-ehon/asia-northeast1`,
      assetsUrl: (env.VITE_ASSETS_URL as string | undefined) || `http://${emulatorHost}:5001/demo-ehon/asia-northeast1/localBlob`,
      templatesUrl: (env.VITE_TEMPLATES_URL as string | undefined) || null,
      appCheckSiteKey: null,
    }
  : env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_APP_ID
    ? {
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        appId: env.VITE_FIREBASE_APP_ID,
        emulatorHost: null,
        functionsUrl: env.VITE_FUNCTIONS_URL || `https://asia-northeast1-${env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`,
        assetsUrl: env.VITE_ASSETS_URL || null,
        templatesUrl: env.VITE_TEMPLATES_URL || (env.VITE_ASSETS_URL ? `${(env.VITE_ASSETS_URL as string).replace(/\/$/, '')}/templates` : null),
        appCheckSiteKey: env.VITE_APPCHECK_SITE_KEY || null,
      }
    : null;

export const isDev = env.DEV;
