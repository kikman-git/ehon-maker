/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EMULATOR_HOST?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FUNCTIONS_URL?: string;
  readonly VITE_ASSETS_URL?: string;
  readonly VITE_APPCHECK_SITE_KEY?: string;
  readonly VITE_FONTS_URL?: string;
}

// Firestore's Timestamp declares Temporal conversions; TypeScript ships no Temporal lib yet.
declare namespace Temporal {
  interface Instant { readonly epochMilliseconds: number }
}
