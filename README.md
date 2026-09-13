<p align="center">
  <img src="docs/readme/icon.png" width="112" alt="ぺたぺた app icon">
</p>

<h1 align="center">ぺたぺた</h1>

<p align="center">
  <b>おやこで つくる えほん</b><br>
  A picture-book maker for small children and the grown-ups reading with them.<br>
  iPhone · iPad · Japanese UI · Kotlin Multiplatform core + SwiftUI
</p>

<p align="center">
  <img src="docs/readme/phone-shelf.png" width="19%" alt="ほんだな: the bookshelf">
  <img src="docs/readme/phone-editor.png" width="19%" alt="はる: sticking parts onto a page">
  <img src="docs/readme/phone-text.png" width="19%" alt="もじ: words, with six fonts to pick from">
  <img src="docs/readme/phone-share.png" width="19%" alt="かぞくに おくる: sending the book to family">
  <img src="docs/readme/phone-guest.png" width="19%" alt="Grandma's side: hold the button to leave a voice reply">
</p>

<p align="center">
  <img src="docs/readme/phone-read.png" width="96%" alt="よむ: a two-page spread, with grandma's voice waiting on the page">
</p>

<p align="center">
  <img src="docs/readme/ipad-make.png" width="31%" alt="iPad held upright: making together, parts on the rail">
  <img src="docs/readme/ipad-read.png" width="65%" alt="iPad held sideways: reading the spread">
</p>

<p align="center"><sub>
  Shelf · はる (stick) · もじ (words) · send to family · grandma's reply screen · reading spread · iPad make and read
</sub></p>

## What it does

- **Start from a template**, then stick parts on the page, draw with a finger, or write words. Three modes, never overlapping, so a small hand cannot wreck a page by accident.
- **Words in six faces**: てがき, まるまる, えほん, ぽっぷ, マーカー, ふとまる. One ships in the app; the others download on first use. Japanese books get a furigana field in おとな mode.
- **Reading is a two-page spread** with a drag-driven page fold, read-aloud, and おやすみ mode that turns pages by itself at bedtime.
- **Family can join in.** Send the book as an `.ehon` file or a printable PDF. A grandparent can hold a button to leave a voice reply on a page, and it plays back during reading.
- **こども / おとな** switch: bigger targets and fewer knobs for the child; layering, furigana and page reordering for the adult.
- **iPad**: hold it upright to make, turn it sideways to read.
- Japanese first. The UI falls back to English on other devices.
- **A book is one document.** Pictures travel inside the `.ehon` file as SVG, so a language model can write or rework a whole illustrated book and every piece stays movable and every caption editable. The contract is [`docs/EHON_FORMAT.md`](docs/EHON_FORMAT.md).

## How it is built

A shared Kotlin core owns the document, the editor semantics and the layout, and emits a **pure-data scene graph**. Each platform has one thin painter that walks it. The screen, the 2048 px share image and the 300 dpi PDF are the same tree at different scales, so what a child sees is structurally what prints.

```
shared/            Kotlin Multiplatform: model, parts catalog, scene graph, EditorController, codec, strings
iosApp/            SwiftUI app + CoreGraphics painter (iPhone and iPad)
painter-compose/   Compose painter, kept compiling on the JVM so the core always has two consumers
web/               React harness + generated Kotlin/JS core and Canvas2D painter
docs/DECISIONS.md  Why things are the way they are
docs/EHON_FORMAT.md  The book document a model or a person writes: pages, words, SVG art
docs/WEB_BACKEND_PLAN.md  The web studio and backend, phase by phase (Phases 0–2 implemented locally)
```

Mutation happens only in Kotlin. Swift sends intents and repaints; see the decision record for the interop lessons behind that rule.

## Build and run

Requirements: Xcode 26, a JDK 21 (`brew install openjdk@21`), Google Chrome for the shared browser tests, and [xcodegen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`). The Xcode project is generated from `iosApp/project.yml` and is not committed.

```sh
make test                       # shared tests on JVM, Node and Chrome + Compose painter
make run SIM='iPhone 17'        # build, install and launch on a simulator
make check SIM='iPhone 17'      # everything, including the iOS painter tests
make shots                      # screenshot every screen into build/shots/
```

For a real device, set your team once and regenerate the project:

```sh
export EHON_DEVELOPMENT_TEAM=ABCDE12345
make xcodeproj && open iosApp/Ehon.xcodeproj
```

Device builds link the Kotlin framework in Release, so the first one takes a few minutes longer.

The web harness additionally needs Node 22.12+ and pnpm 11.22:

```sh
make web                        # build the Kotlin/JS package and open Vite on localhost:5173
make web-build                  # generate core, check TypeScript and build web/dist/
cd web && pnpm exec playwright install chromium  # once, for browser checks
cd .. && make web-test           # browser interactions and six painter snapshots
```

Open `http://localhost:5173/app` to draw on a blank page, or choose a book from the shelf.
The studio has brush and eraser tools, one working page with thumbnail navigation, readable
system fonts, text with furigana, undo/redo, and opening/saving `.ehon` files. Save before
switching templates or closing the tab. See [`web/README.md`](web/README.md) for the facade contract.

## Status

Working prototype heading into closed testing. Not on the App Store. Books live on the device and the reply recorder lives inside the app. Phases 0–2 of [`docs/WEB_BACKEND_PLAN.md`](docs/WEB_BACKEND_PLAN.md) are implemented locally: codec v3 (still reads v1/v2), the Kotlin/JS core, a web shelf, a drawing workspace (one page at a time, visible brush and eraser tools, thumbnail navigation, pan/zoom and optional illustration placement), a reader, accounts with book sync on iOS and web, read-only guest links, PNG uploads that become parts on every device, sliced web fonts and Lighthouse byte budgets in CI. Everything runs against the Firebase emulators; the Firebase project, R2 buckets, the assets domain and Cloudflare Pages are not provisioned, so nothing is deployed yet. Advanced layered raster painting, AI, billing and packs remain in Phases 3–4.

## License

Code is released under the [MIT License](LICENSE).

The fonts are not mine. Yomogi, Zen Maru Gothic and Caprasimo ship in the app, and Kiwi Maru, Hachi Maru Pop, Yusei Magic and RocknRoll One download on demand. All are Google Fonts releases under the [SIL Open Font License 1.1](https://openfontlicense.org); the licence texts travel with the bundled fonts in `iosApp/Ehon/Fonts/`.
