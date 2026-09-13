import AuthenticationServices
import CryptoKit
import FirebaseAuth
import FirebaseCore
import GoogleSignIn
import SwiftUI

@MainActor
final class AccountSession: ObservableObject {
    static let shared = AccountSession()
    @Published private(set) var uid: String?
    @Published private(set) var isSignedIn = false
    @Published private(set) var displayName = ""
    @Published private(set) var isBusy = false
    @Published var errorMessage: String?
    private var listener: AuthStateDidChangeListenerHandle?
    private var nonce: String?

    init() {
        guard CloudConfiguration.available else { return }
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.uid = user?.uid
                self?.isSignedIn = user != nil && user?.isAnonymous == false
                self?.displayName = user?.displayName ?? user?.email ?? ""
            }
        }
        Task {
            do { if Auth.auth().currentUser == nil { _ = try await Auth.auth().signInAnonymously() } }
            catch { errorMessage = Localized.s("account.offline") }
        }
    }

    func prepareApple(_ request: ASAuthorizationAppleIDRequest) {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            errorMessage = Localized.s("account.retry"); return
        }
        let raw = Data(bytes).map { String(format: "%02x", $0) }.joined()
        nonce = raw
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.hash(Data(raw.utf8))
    }

    func finishApple(_ result: Result<ASAuthorization, Error>) {
        guard CloudConfiguration.available else { return }
        switch result {
        case .success(let authorization):
            guard let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let token = apple.identityToken.flatMap({ String(data: $0, encoding: .utf8) }), let nonce else { return }
            self.nonce = nil
            let credential = OAuthProvider.appleCredential(withIDToken: token, rawNonce: nonce, fullName: apple.fullName)
            Task { await signIn(credential) }
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled { errorMessage = error.localizedDescription }
        }
    }

    func google() async {
        guard CloudConfiguration.available, !isBusy,
              let clientID = FirebaseApp.app()?.options.clientID,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              var presenter = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return }
        let expectedScheme = clientID.split(separator: ".").reversed().joined(separator: ".")
        let types = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
        guard types.contains(where: { ($0["CFBundleURLSchemes"] as? [String])?.contains(expectedScheme) == true }) else {
            errorMessage = Localized.s("account.cloudUnavailable"); return
        }
        while let presented = presenter.presentedViewController { presenter = presented }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let token = result.user.idToken?.tokenString else { return }
            await signIn(GoogleAuthProvider.credential(withIDToken: token, accessToken: result.user.accessToken.tokenString))
        } catch {
            if (error as NSError).code != GIDSignInError.canceled.rawValue { errorMessage = error.localizedDescription }
        }
    }

    private func signIn(_ credential: AuthCredential) async {
        guard !isBusy else { return }
        isBusy = true; errorMessage = nil
        defer { isBusy = false }
        do {
            if let user = Auth.auth().currentUser, user.isAnonymous {
                do { _ = try await user.link(with: credential) }
                catch {
                    guard (error as NSError).code == AuthErrorCode.credentialAlreadyInUse.rawValue else { throw error }
                    let fresh = (error as NSError).userInfo[AuthErrorUserInfoUpdatedCredentialKey] as? AuthCredential ?? credential
                    _ = try await Auth.auth().signIn(with: fresh)
                }
            } else { _ = try await Auth.auth().signIn(with: credential) }
        } catch { errorMessage = error.localizedDescription }
    }

    func signOut() {
        guard CloudConfiguration.available else { return }
        do {
            try Auth.auth().signOut()
            GIDSignIn.sharedInstance.signOut()
            Task { _ = try? await Auth.auth().signInAnonymously() }
        } catch { errorMessage = error.localizedDescription }
    }

    nonisolated static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
}
