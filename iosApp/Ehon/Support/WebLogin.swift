import Foundation
import FirebaseAuth
import FirebaseFunctions

/// Signs a browser in from this phone (decision 58): the web page shows a QR code (or a six-letter
/// code) for a login request; a signed-in account approves it here through `qrLoginApprove`, and
/// the browser then claims a token for the same account. Nothing about the account leaves the phone.
@MainActor
final class WebLogin: ObservableObject {
    enum Target: Equatable {
        case request(id: String)
        case code(String)

        var display: String {
            switch self {
            case .request: return "QR"
            case .code(let code): return "\(code.prefix(3)) \(code.suffix(3))"
            }
        }
    }

    @Published private(set) var busy = false

    static var available: Bool { CloudConfiguration.available && Auth.auth().currentUser?.isAnonymous == false }

    /// The QR code carries `<web origin>/login/<id>`; a typed code is six letters, spaces and hyphens allowed.
    nonisolated static func parse(_ raw: String) -> Target? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: text), url.scheme?.hasPrefix("http") == true {
            let parts = url.pathComponents.filter { $0 != "/" }
            guard parts.count == 2, parts[0] == "login", parts[1].range(of: "^[A-Za-z0-9_-]{22}$", options: .regularExpression) != nil else { return nil }
            return .request(id: parts[1])
        }
        let code = text.uppercased().filter { $0.isLetter || $0.isNumber }
        guard code.range(of: "^[A-HJ-NP-Z2-9]{6}$", options: .regularExpression) != nil else { return nil }
        return .code(code)
    }

    /// Returns the browser's description, as the web page reported it when the request began.
    func approve(_ target: Target) async throws -> String {
        guard Self.available else { throw SyncError.notConfigured }
        busy = true
        defer { busy = false }
        let data: [String: String]
        switch target {
        case .request(let id): data = ["id": id]
        case .code(let code): data = ["code": code]
        }
        let response = try await Functions.functions(region: "asia-northeast1").httpsCallable("qrLoginApprove").call(data)
        guard let fields = response.data as? [String: Any] else { throw SyncError.invalidResponse }
        return fields["client"] as? String ?? ""
    }
}
