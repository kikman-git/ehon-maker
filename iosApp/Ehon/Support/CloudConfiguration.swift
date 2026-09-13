import Foundation
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions
import FirebaseAppCheck

/// A checkout without cloud configuration is a fully usable local book maker.
enum CloudConfiguration {
    static var emulatorHost: String? {
        #if DEBUG
        return ProcessInfo.processInfo.environment["EHON_EMULATOR_HOST"]
            ?? UserDefaults.standard.string(forKey: "emulatorHost")
        #else
        return nil
        #endif
    }

    static var assetsURL: URL? {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["EHON_ASSETS_URL"]
            ?? UserDefaults.standard.string(forKey: "assetsURL"), let url = URL(string: raw),
           url.scheme == "https" || (url.scheme == "http" && ["127.0.0.1", "localhost"].contains(url.host ?? "")) { return url }
        #endif
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "EhonAssetsURL") as? String,
              let url = URL(string: raw), url.scheme == "https", url.host != nil else { return nil }
        return url
    }

    /** The web app's origin; guest links live at `<origin>/g/<token>`. */
    static var webURL: URL? {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["EHON_WEB_URL"]
            ?? UserDefaults.standard.string(forKey: "webURL"), let url = URL(string: raw),
           url.scheme == "https" || (url.scheme == "http" && ["127.0.0.1", "localhost"].contains(url.host ?? "")) { return url }
        #endif
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "EhonWebURL") as? String,
              let url = URL(string: raw), url.scheme == "https", url.host != nil else { return nil }
        return url
    }

    @MainActor static func configure() {
        guard FirebaseApp.app() == nil else { return }
        let options: FirebaseOptions
        if emulatorHost != nil {
            options = FirebaseOptions(googleAppID: "1:1234567890:ios:0123456789abcdef", gcmSenderID: "1234567890")
            options.projectID = "demo-ehon"
            options.apiKey = "AIzaSyDemoEhonLocalEmulatorOnly00000000000"
        } else if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
                  let configured = FirebaseOptions(contentsOfFile: path) {
            options = configured
        } else { return }
        #if DEBUG
        if emulatorHost != nil { AppCheck.setAppCheckProviderFactory(EmulatorAppCheckFactory()) }
        else { AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory()) }
        #else
        AppCheck.setAppCheckProviderFactory(EhonAppCheckFactory())
        #endif
        FirebaseApp.configure(options: options)
        if let host = emulatorHost {
            Auth.auth().useEmulator(withHost: host, port: 9099)
            let settings = Firestore.firestore().settings
            settings.host = "\(host):8080"
            settings.isSSLEnabled = false
            settings.cacheSettings = MemoryCacheSettings()
            Firestore.firestore().settings = settings
            Functions.functions(region: "asia-northeast1").useEmulator(withHost: host, port: 5001)
        }
    }

    static var available: Bool { FirebaseApp.app() != nil }
}

private final class EhonAppCheckFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? { DeviceCheckProvider(app: app) }
}

#if DEBUG
/// Emulator-only tokens keep local tests from contacting production attestation services.
final class EmulatorAppCheckFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? { EmulatorAppCheckProvider() }
}
private final class EmulatorAppCheckProvider: NSObject, AppCheckProvider {
    func getToken(completion: @escaping (AppCheckToken?, Error?) -> Void) {
        completion(AppCheckToken(token: "local-emulator", expirationDate: Date().addingTimeInterval(3600)), nil)
    }
}
#endif
