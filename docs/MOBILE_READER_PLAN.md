# ぺたぺた — the phone becomes the reader: migration plan

Decision #69 (2026-10-28): the web studio makes books, the phone reads them. This is the
order of work, what each step touches, and how each step is known to be done. Every step ships
on its own; step 1 is the only one that must come before the deletions.

---

## 0. Summary

**Keep on the phone.** Shelf as a library · reader (fold, よみあげ, おやすみ, family voice) ·
sign-in and the QR approval for the browser (#58) · guest links · share sheet · PNG and PDF
export · the remote material catalog and bundled subset that just landed.

**Remove from the phone.** The editor (はる / かく / もじ), the drawer, the tablet つくる layout,
the templates-as-start screen, the blank-page and template tiles, できあがり, the editing lease.

**Unchanged.** The Kotlin core, including `EditorController`, which the web uses. The painters,
the goldens, the codec, sync's journal shape (#46). The web studio.

**Already in place.** `BookRepository.receive` prefetches every raster part of a synced book at
display size, `MaterialCatalog` refreshes the catalog on launch and on every foreground, and
`AssetLoader` validates masters by hash and trims its disk cache. A book made on the web with
new materials renders on the phone without an app update.

---

## 1. Split the iPad reader from the editor (prerequisite)

Decision #27 made the tablet read view a mode of the tablet editor: `TabletRootView` owns an
`EditorModel` and `AppModel.openRead` creates one on iPad even when reading starts from the
shelf. `ReadView` itself takes a `Book`, so the dependency is only in the tablet root.

- `iosApp/Ehon/Views/TabletViews.swift`: `TabletRootView` takes a `Book` and a start page and
  presents `ReadView` directly; the つくる branch and the rotate card stay for now.
- `iosApp/Ehon/Support/AppModel.swift`: `openRead` no longer creates an `EditorModel` on iPad.
- Done when `make ios-test SIM="iPad Pro 13-inch (M5)"` passes and reading a book from the
  shelf on the iPad simulator opens the spread without an editor model (`make shots`).

## 2. Reading is the default; authoring hides

No code deleted, so the release can be reverted by a flag.

- `ShelfView`: tapping a book opens `ReadView`; the two start tiles and the つくる tab go.
  The filter chips become ぜんぶ / あたらしい (books received from sync since the last read) /
  よんだ. Reading position per book is a `UserDefaults` key like `finished-<id>` is today.
- The five bound stories list on the shelf as readable books for anyone, signed in or not,
  through `TemplateCatalog`; opening one reads it, it is not instantiated.
- Empty state for "your books": one line that books are made at the studio with the same
  account, and the QR login button that already exists in `AccountView`.
- `RootView`: the `.editor`, `.templates` and `.done` screens remain reachable only through
  the `startScreen` debug route, so `make shots` still works until step 3 updates it.
- Store copy and `docs/readme/phone-*.png` are redone around reading.
- Done when the no-cloud shelf shows the stories and opens one in the reader; the browser
  suite is untouched.

## 3. Delete the editor and the phone's lease

- Remove `Views/EditorView.swift`, `EditorDrawer.swift`, `EditorPage.swift`,
  `PageReorder.swift`, `TemplatesView.swift`, `DoneView.swift`, `RetiredMaterialsNotice.swift`,
  the つくる half of `TabletViews.swift`, `Support/EditorModel.swift`, and the `.editor`,
  `.templates`, `.done` cases of `Screen`. `AppModel` loses `startBlankBook`,
  `startDocumentTemplate`, `openTemplates`, `editor` and the `finished-*` keys. こども / おとな
  (`uiLevel`) gated editing and `ShareView`'s send settings; it becomes a plain おとな toggle in
  `ShareView` or goes. `bigTargets` stays as the reader's accessibility setting.
- `BookRepository.open(_:editing:)` is always `editing: false`; `SyncEngine` drops
  `startHeartbeat`, `acquireLease`, `releaseLease`, `heldElsewhere`, `scheduleLeaseRetry` and
  the `onLease` callback. The phone still pushes: a voice reply changes `Page.reply` and goes up
  through the same journal, and the web's lease logic is untouched.
- `make shots` routes become `shelf`, `read`, `share`, `guest`.
- Tests: `SyncIntegrationTests` keeps the two-client case for a web edit arriving on a reading
  phone and loses the two-editors case; `ScenePainterTests` and the goldens stay because export
  and the reader paint through the same painter; `TemplateCatalogTests` asserts the stories read,
  not instantiate.
- Decisions #7, #12, #23 and #62 are noted as phone history in
  `DECISIONS.md`; #69 is the entry.
- Done when `make check` passes and the app has no path to `EditorController` except export.

## 4. Spend the freed budget on reading

In the order a family would notice:

1. **Page-turn sound** (open item since v1): two or three variants, randomised, through the
   existing haptic hook in the fold.
2. **Words light up while よみあげ reads**: `AVSpeechSynthesizer` boundary callbacks drive a
   per-run highlight in `ReadView`; the scene graph already knows each text run's rectangle.
3. **さいごまで よむ**: a continuous mode that reads every spread and turns, with the おやすみ
   interval, and a sleep timer that dims and stops.
4. **Offline for print**: `AssetLoader.prepare(book, master: true)` runs when a book is marked
   よんだ twice or shared, so PNG and PDF export works without a connection; today the master is
   fetched at export time.
5. **Guest links open in the app** through Universal Links once the Apple team id exists
   (`WEB_BACKEND_PLAN.md` §14).

---

## 5. Risks

- **The anonymous-first promise (#15).** A reader with no books is an empty screen. Step 2's
  stories on the shelf answer it; do not ship step 3 before step 2 has been on TestFlight.
- **A tester's phone-made book in progress.** Sync carries it to the web, where it is edited
  from then on; the phone opens it in the reader. Nothing is lost, and nothing on the phone
  edits it again.
- **Voice replies still write.** `Page.reply` goes up without a lease, so a reply recorded while
  the web is editing the same book merges by page (#33). A reply never touches items, so the
  merge is clean, but the two-client test in step 3 must cover exactly this.
- **The README's phone screenshots** show the editor until step 2 replaces them.
