# Backend and iOS sync

Phases 1 and 2 have a local implementation: rules, asset functions, guest-link functions and
the emulator stand-in for R2. Firebase projects, identity providers, App Check, billing
alerts, R2 buckets, and the public assets domain still need provisioning. No production
resources or secrets are committed here.

## Run locally

Use Node 22 (the Functions runtime), pnpm, Java 21, and Xcode. From the repository root:

```sh
make rules-test                 # Rules, asset validation/idempotency/quotas, guest links, cleanup, budget guard
make sync-test SIM='iPhone 17'   # Native Firebase clients: offline merge and edit leases
make web-sync-test              # Browser clients: sync, leases, guest links, uploads via localBlob
make emulators                 # Auth :9099, Firestore :8080, Functions :5001, UI :4000
```

The emulator project is always `demo-ehon`; it requires no Firebase login. The iOS sync tests
use independent Firebase app instances and temporary local stores. They use mock Google
credentials only with the Auth emulator, as described in the
[Firebase emulator documentation](https://firebase.google.com/docs/emulator-suite/connect_auth#non-interactive_testing_2).
Simulator builds are signed ad hoc so Firebase Auth can use the simulator keychain; no Apple
developer team is required.

To run the app against those emulators, add `-emulatorHost 127.0.0.1` to its Debug launch
arguments. This override does not exist in Release. Without either that argument or a
`GoogleService-Info.plist`, the app saves local books and shows cloud backup as unavailable.
Real Apple/Google authorization dialogs require provisioned provider credentials. Emulator
tests cover SDK credential exchange; real provider dialogs and App Check still need a device
smoke test after configuration.

Asset-service tests use a memory blob store and real Firestore emulator transactions. In the
Functions emulator, an empty `R2_ENDPOINT` selects `LocalBlobStore`: uploads land under
`functions/.blobs/` (ignored) and the `localBlob` HTTP function plays both the presigned PUT
target and the assets domain, so the whole presign → PUT → finalize → render path runs
offline. It is never deployed. To exercise real R2 from the emulator instead, copy
`functions/.env.example` to `functions/.env.local`, and `functions/.secret.example` to
`functions/.secret.local`; fill those files locally. Both files are ignored by Git. Presign
is side-effect free; finalize reserves derivative-inclusive quota before writing canonical
objects, and retries reuse that reservation.

Guest links (decision 41): `shareCreate` and `shareRevoke` are callables for signed-in owners,
bounded to 50 live links per book; `guestBook` is the one unauthenticated endpoint,
`GET /guestBook/<token>`, returning the codec metadata, the pages in manifest order and the
owner's `lib:` parts the pages use. It serves nothing for a revoked token, a deleted book or a
torn snapshot whose page hashes disagree with the manifest. Set `WEB_ORIGINS` (comma-separated)
to the web app's origins so browsers may fetch it; the phone builds links from `EhonWebURL`.

## Provision dev and prod

1. Create separate Firebase projects (preferred IDs `ehon-dev` / `ehon-prod`, subject to
   global availability), enable Blaze, and create Firestore in `asia-northeast1`. Functions
   are fixed to that region. Enable Anonymous, Apple, and Google authentication; leave
   automatic deletion of anonymous accounts **off**.
2. Register iOS bundle `app.ehon.petapeta`, enable Sign in with Apple for its App ID and
   provisioning profile, and configure the provider in Firebase. Add the downloaded
   `GoogleService-Info.plist` to `iosApp/Ehon/` and run `make xcodeproj`.
3. Copy `iosApp/Config/Cloud.local.xcconfig.example` to `Cloud.local.xcconfig`. Set the assets
   URL and the plist's `REVERSED_CLIENT_ID`. The config is included by both build modes and
   is ignored by Git. The `$()` in the example HTTPS URL prevents an xcconfig comment.
4. Register DeviceCheck for iOS App Check. Debug cloud builds use Firebase's debug provider;
   register their debug token in the console. Enable Firestore/App Check enforcement after
   validating the dev build. Deployed callable functions always enforce App Check.
5. Create **private** R2 buckets `ehon-assets-dev` and `ehon-assets-prod`. Leave public
   `r2.dev` access disabled, and do not attach an unrestricted public bucket domain. Apply
   `r2-cors.example.json`, replacing localhost with the actual web origins. The PUT URL
   uses the R2 S3 endpoint; public reads use the Worker domain.
6. Deploy `assets-worker/` with a custom domain such as `assets-dev.example.com` (dev) and
   `assets.example.com` (prod). Configure the domain route in `wrangler.jsonc` or the
   Cloudflare dashboard. The Worker exposes only `a/<sha256>/{m.png,1024.webp,256.webp}` and
   `fonts/*.{ttf,txt}`, caches successful GETs at the edge, and denies `s/`, `v/`, and `u/`.
   Cloudflare documents why a [public bucket domain exposes the bucket](https://developers.cloudflare.com/r2/buckets/public-buckets/).
7. Issue separate R2 credentials scoped to each bucket. Set `R2_ENDPOINT` and `R2_BUCKET`
   in `functions/.env.<project-id>`. Store `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` with
   `pnpm exec firebase functions:secrets:set NAME --project PROJECT_ID` from `backend/`.
   Never put secret values in command arguments or committed files.
8. From `backend/`, run `pnpm fonts` to stage five pinned Google Fonts releases and their
   OFL licenses in `build/r2-fonts/`. After exporting R2 credentials locally, `pnpm fonts --upload`
   uploads them to the bucket selected by `R2_BUCKET`; the phone downloads these complete TTFs.
   No upload occurs without `--upload`. The web app slices the same staged files into woff2
   (`make web-fonts`, or `make web-fonts FETCH=1` to stage them from here); without them the web
   renders those five faces with the system font.
9. Set a one-day R2 lifecycle expiry on the temporary `u/` prefix. Finalized masters,
   sources, and voice have no automatic garbage collection in v1. Failed quota reservations
   stay charged until the same upload succeeds; inspect abandoned reservations before any
   manual repair.
10. Create a JPY billing budget and Pub/Sub topic `ehon-budget-alerts`, enable budget
    notifications to that topic, and grant the documented publisher/subscriber permissions.
    `budgetGuard` sets `config/flags.aiEnabled=false` at ¥10,000 actual spend; lower or
    delayed alerts never reenable it. It is an AI feature switch, not a billing spending cap.

Deploy only after those values point to the intended environment:

```sh
make functions-deploy FIREBASE_PROJECT=YOUR_DEV_PROJECT_ID
cd backend
pnpm exec wrangler deploy --config assets-worker/wrangler.jsonc
# Production worker uses: --env prod
```

`functions-deploy` requires an explicit project and deploys rules, indexes, and Functions.
Worker routes/account IDs must be filled in before deployment. Test actual R2 checksums,
CORS, alpha derivatives, private signed reads, and device App Check in dev before prod.

## Sync contract

`books/{id}` stores codec metadata, `pageIds`, a `pageHashes` map, `revision`, server
`updatedAt`, `ownerId`, a nullable lease, and a soft-deletion flag. Each page document contains
`ownerId`, codec `json`, and server `updatedAt`. A page write must accompany a book revision
increment in the same atomic batch. Removed pages fall out of the manifest; their documents
are retained until a future garbage collector.

The per-book writer coalesces saves while a batch is pending. A stale revision rejects the
whole batch; the repository pulls a complete snapshot, merges clean pages in Kotlin, and
retries local dirty pages. A hash manifest prevents partially delivered snapshots from
replacing local files. Active gestures defer incoming documents; replacing a remote document
clears the editor's undo history so undo cannot reverse another device's work.

`Documents/books/sync-state.json` persists the owner and last acknowledged document. First
sign-in claims only unowned drafts. Signing out hides account-owned books; signing back in
restores them. Account switches never claim a previous owner's files. A corrupt journal
disables cloud writes and preserves the files for recovery. Cloud deletions keep a local
archive on disk but cannot be undone by an older device's queued save.

One shelf listener tracks metadata and one page listener belongs to the open route. Read
routes ignore leases; editing renews a lease every 60 seconds with a TTL below 180 seconds
(five seconds of clock-skew allowance). Close/background releases it with a compare-and-set.
An occupied lease makes the editor read-only. Offline editing remains available when no
known live lease is held elsewhere.

Bitmap masters are normalized PNGs addressed by the SHA-256 of their exact stored bytes.
Sources and voice keep private immutable version keys; reads require the owning signed-in
account and a ten-minute signed URL. The phone uses a decoded-image cache with a 64 MiB pixel
budget and disk cache; exports request masters. The part registry is stored per account,
and downloadable fonts come from the configured asset domain.
