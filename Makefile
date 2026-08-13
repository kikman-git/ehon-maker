SHELL := /bin/bash

# openjdk@21 is keg-only, so builds need JAVA_HOME set explicitly. Overridable:
#   make test JAVA_HOME=/path/to/jdk
JAVA_HOME ?= $(shell for d in /usr/local/opt/openjdk@21 /opt/homebrew/opt/openjdk@21 \
                              /usr/local/opt/openjdk /opt/homebrew/opt/openjdk; do \
                       [[ -x "$$d/bin/java" ]] && echo "$$d" && break; done)
export JAVA_HOME

SIM ?= iPhone 16
BUNDLE := app.ehon.petapeta
XC := xcodebuild -project iosApp/Ehon.xcodeproj -scheme Ehon -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO

.PHONY: help
help:
	@grep -hE '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | sed -E 's/:.*##/\t/' | expand -t22

.PHONY: check
check: test ios-test ## Everything: shared tests, both painters, iOS tests

.PHONY: test
test: ## Shared-module golden tests + Compose painter (JVM, no simulator)
	./gradlew :shared:jvmTest :painter-compose:compileKotlinJvm

.PHONY: framework
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

.PHONY: clean
clean: ## Remove Gradle and Xcode build output
	./gradlew clean
	rm -rf iosApp/Ehon.xcodeproj build/shots
