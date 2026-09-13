SHELL := /bin/bash

# openjdk@21 is keg-only, so builds need JAVA_HOME set explicitly. Overridable:
#   make test JAVA_HOME=/path/to/jdk
JAVA_HOME ?= $(shell for d in /usr/local/opt/openjdk@21 /opt/homebrew/opt/openjdk@21 \
                              /usr/local/opt/openjdk /opt/homebrew/opt/openjdk; do \
                       [[ -x "$$d/bin/java" ]] && echo "$$d" && break; done)
export JAVA_HOME

SIM ?= iPhone 16
BUNDLE := app.ehon.petapeta
# Ad-hoc simulator signing gives Firebase Auth a working keychain without a developer team.
XC := xcodebuild -project iosApp/Ehon.xcodeproj -scheme Ehon -sdk iphonesimulator CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=

PLIST := iosApp/Ehon/Info.plist
ARCHIVE := build/Ehon.xcarchive

# Team for signed device builds: the environment first, else whatever Xcode last wrote into
# the generated project. Expanded immediately (`:=`), because `make xcodeproj` replaces that
# literal with an unexpandable ${EHON_DEVELOPMENT_TEAM} reference partway through the run.
TEAM := $(or $(EHON_DEVELOPMENT_TEAM),$(shell sed -n \
          's/^[[:space:]]*DEVELOPMENT_TEAM = \([A-Z0-9]\{10\}\);/\1/p' \
          iosApp/Ehon.xcodeproj/project.pbxproj 2>/dev/null | head -1))

.PHONY: help
help:
	@grep -hE '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | sed -E 's/:.*##/\t/' | expand -t22

.PHONY: check
check: test ios-test ## Everything: shared tests, both painters, iOS tests

.PHONY: test
test: ## Shared tests on JVM, Node and headless Chrome + Compose painter
	./gradlew :shared:jvmTest :shared:jsTest :painter-compose:compileKotlinJvm

.PHONY: web-core
web-core: ## Build and stage the typed Kotlin/JS library for Vite, and assemble the story templates
	./gradlew :shared:assembleTemplates :shared:jsBrowserProductionLibraryDistribution
	node tools/stage-web-core.mjs

.PHONY: templates-upload
templates-upload: ## Publish the assembled story templates to the assets bucket (BUCKET=ehon-assets-dev)
	./gradlew :shared:assembleTemplates
	cd backend && pnpm templates --wrangler --bucket $(or $(BUCKET),ehon-assets-dev)

.PHONY: web
web: web-core ## Run the web app at http://localhost:5173/ (shelf; /app is the composer harness)
	cd web && pnpm install --frozen-lockfile && pnpm dev

.PHONY: web-build
web-build: web-core ## Type-check and build the web harness
	cd web && pnpm install --frozen-lockfile && pnpm build

.PHONY: web-test
web-test: web-build ## Test the browser facade and painter with Playwright
	cd web && pnpm test

.PHONY: web-fonts
web-fonts: ## Slice the body fonts into woff2; FETCH=1 downloads the five downloadable faces first
	cd web && pnpm install --frozen-lockfile && node tools/slice-fonts.mjs $(if $(FETCH),--fetch)

.PHONY: web-budget
web-budget: web-build ## Lighthouse byte budgets (plan §11) on a gzip-served production build
	cd web && pnpm exec lhci autorun

.PHONY: web-sync-test
web-sync-test: web-core backend-build ## Test web accounts, sync, leases, guest links and uploads against the emulators
	cd web && pnpm install --frozen-lockfile
	cd backend && pnpm exec firebase emulators:exec --project demo-ehon --only auth,firestore,functions \
	  'cd ../web && pnpm exec playwright test -c playwright.emulator.config.ts'

.PHONY: framework
.PHONY: backend-build emulators rules-test sync-test functions-deploy
backend-build: ## Install and compile the Firebase functions and asset worker
	cd backend && pnpm install --frozen-lockfile && pnpm build

emulators: backend-build ## Start local Auth, Firestore and Functions (demo-ehon)
	cd backend && pnpm emulators

rules-test: backend-build ## Run ownership, upload and maintenance tests against Firestore
	cd backend && pnpm rules-test

sync-test: xcodeproj backend-build ## Test two iOS clients against Auth and Firestore emulators
	cd backend && pnpm exec firebase emulators:exec --project demo-ehon --only auth,firestore \
	  'cd .. && xcodebuild -project iosApp/Ehon.xcodeproj -scheme EhonSync -sdk iphonesimulator CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= -destination "platform=iOS Simulator,name=$(SIM)" -only-testing:EhonTests/SyncIntegrationTests test'

functions-deploy: backend-build ## Deploy rules/indexes/functions; requires FIREBASE_PROJECT explicitly
	@test -n "$(FIREBASE_PROJECT)" || { echo 'Set FIREBASE_PROJECT to your provisioned Firebase project ID.' >&2; exit 1; }
	cd backend && pnpm exec firebase deploy --project "$(FIREBASE_PROJECT)" --only firestore,functions

framework: ## Link the KMP framework for the iOS simulator
	./gradlew :shared:linkDebugFrameworkIosX64 :shared:linkDebugFrameworkIosSimulatorArm64

.PHONY: xcodeproj
xcodeproj: ## Regenerate Ehon.xcodeproj from project.yml (needs `brew install xcodegen`)
	cd iosApp && xcodegen generate

.PHONY: ios
ios: xcodeproj ## Build the iOS app for the simulator
	$(XC) -destination 'generic/platform=iOS Simulator' -configuration Debug build

.PHONY: ios-test
ios-test: xcodeproj ## Run the iOS painter tests on a simulator
	$(XC) -destination 'platform=iOS Simulator,name=$(SIM)' -configuration Debug test

.PHONY: run
run: ios ## Build, install and launch on the simulator
	@xcrun simctl boot "$(SIM)" 2>/dev/null || true
	@xcrun simctl bootstatus "$(SIM)" -b >/dev/null
	@APP=$$(find ~/Library/Developer/Xcode/DerivedData/Ehon-*/Build/Products/Debug-iphonesimulator \
	          -maxdepth 1 -name 'Ehon.app' | head -1); \
	  xcrun simctl install "$(SIM)" "$$APP" && \
	  xcrun simctl launch "$(SIM)" $(BUNDLE) --args -templateIndex $${TEMPLATE:-0}
	@open -a Simulator

.PHONY: fonts
fonts: ## Subset the UI font to shipped strings and stage the bundled set
	@test -d tools/fonts-src || { \
	  echo "fetching upstream Google Fonts into tools/fonts-src/"; \
	  mkdir -p tools/fonts-src; \
	  for f in ofl/yomogi/Yomogi-Regular.ttf \
	           ofl/zenmarugothic/ZenMaruGothic-Regular.ttf \
	           ofl/zenmarugothic/ZenMaruGothic-Medium.ttf \
	           ofl/zenmarugothic/ZenMaruGothic-Bold.ttf \
	           ofl/zenmarugothic/ZenMaruGothic-Black.ttf \
	           ofl/caprasimo/Caprasimo-Regular.ttf; do \
	    curl -sfL -o "tools/fonts-src/$$(basename $$f)" \
	      "https://github.com/google/fonts/raw/main/$$f"; \
	  done; }
	./gradlew -q :shared:dumpShippedText
	./tools/subset-fonts.sh

.PHONY: shots
shots: ios ## Screenshot every screen (Japanese) into build/shots/
	@mkdir -p build/shots
	@xcrun simctl boot "$(SIM)" 2>/dev/null || true
	@xcrun simctl bootstatus "$(SIM)" -b >/dev/null
	@APP=$$(ls -dt ~/Library/Developer/Xcode/DerivedData/Ehon-*/Build/Products/Debug-iphonesimulator/Ehon.app \
	          | head -1); xcrun simctl install "$(SIM)" "$$APP"
	@for s in shelf templates editor read done; do \
	  xcrun simctl terminate "$(SIM)" $(BUNDLE) 2>/dev/null || true; \
	  xcrun simctl launch "$(SIM)" $(BUNDLE) \
	    -AppleLanguages "(ja)" -AppleLocale ja_JP -startScreen $$s >/dev/null; \
	  sleep 6; \
	  xcrun simctl io "$(SIM)" screenshot build/shots/$$s.png >/dev/null 2>&1; \
	  echo "  build/shots/$$s.png"; \
	done
	@for m in draw text; do \
	  xcrun simctl terminate "$(SIM)" $(BUNDLE) 2>/dev/null || true; \
	  xcrun simctl launch "$(SIM)" $(BUNDLE) \
	    -AppleLanguages "(ja)" -AppleLocale ja_JP -startScreen editor -mode $$m >/dev/null; \
	  sleep 6; \
	  xcrun simctl io "$(SIM)" screenshot build/shots/editor-$$m.png >/dev/null 2>&1; \
	  echo "  build/shots/editor-$$m.png"; \
	done

# sed, not PlistBuddy: PlistBuddy rewrites the whole file and drops the XML comments,
# which is also what Xcode's plist editor does to it.
.PHONY: bump
bump: ## Increment CFBundleVersion; App Store Connect rejects a duplicate
	@n=$$(sed -n '/<key>CFBundleVersion<\/key>/{n;s/.*<string>\(.*\)<\/string>.*/\1/p;}' $(PLIST)); \
	  m=$$((n + 1)); \
	  sed -i '' "/<key>CFBundleVersion<\/key>/{n;s|<string>$$n</string>|<string>$$m</string>|;}" $(PLIST); \
	  echo "CFBundleVersion $$n -> $$m"

.PHONY: archive
archive: xcodeproj ## Signed device archive, Release Kotlin/Native
	@test -n "$(TEAM)" || { echo "error: no team. export EHON_DEVELOPMENT_TEAM=<10-char id>" >&2; exit 1; }
	xcodebuild -project iosApp/Ehon.xcodeproj -scheme Ehon \
	  -destination 'generic/platform=iOS' -configuration Release \
	  -archivePath $(ARCHIVE) DEVELOPMENT_TEAM=$(TEAM) -allowProvisioningUpdates archive

.PHONY: testflight
testflight: archive ## Archive and upload to TestFlight. Run `make bump` first
	@printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' \
	  '<plist version="1.0"><dict>' \
	  '<key>method</key><string>app-store-connect</string>' \
	  '<key>teamID</key><string>$(TEAM)</string>' \
	  '<key>destination</key><string>upload</string>' \
	  '<key>uploadSymbols</key><true/>' \
	  '<key>signingStyle</key><string>automatic</string>' \
	  '</dict></plist>' > build/ExportOptions.plist
	xcodebuild -exportArchive -archivePath $(ARCHIVE) \
	  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export \
	  -allowProvisioningUpdates

.PHONY: clean
clean: ## Remove Gradle and Xcode build output
	./gradlew clean
	rm -rf iosApp/Ehon.xcodeproj build/shots
