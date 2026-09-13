import SwiftUI
import VisionKit

/// パソコンで ぺたぺたを ひらく — scan the web page's QR code, or type its six-letter code, then approve.
struct WebLoginView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var login = WebLogin()
    @State private var typed = ""
    @State private var pending: WebLogin.Target?
    @State private var done: String?
    @State private var error: String?

    private var canScan: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let done {
                        Label(done, systemImage: "checkmark.circle.fill").font(.ehUI(16)).foregroundStyle(Color.ehAccentDeep)
                    } else {
                        Text(Localized.s("web.loginHint")).font(.ehUI(14)).foregroundStyle(Color.ehMuted)
                            .fixedSize(horizontal: false, vertical: true)
                        scanner
                        codeEntry
                    }
                    if let error { Text(error).font(.ehUI(13)).foregroundStyle(.red) }
                }
                .padding(24)
            }
            .background(Color.ehBg)
            .navigationTitle(Localized.s("web.login"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(Localized.s("account.close")) { dismiss() } } }
            .alert(Localized.s("web.loginApprove"), isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }), presenting: pending) { target in
                Button(Localized.s("web.loginApprove")) { approve(target) }
                Button(Localized.s("done.keepForever.later"), role: .cancel) { pending = nil }
            } message: { target in
                Text(Localized.s("web.loginConfirm", target.display))
            }
            .disabled(login.busy)
        }
    }

    @ViewBuilder private var scanner: some View {
        if canScan {
            QRScanner(paused: pending != nil || login.busy) { payload in
                guard pending == nil, let target = WebLogin.parse(payload) else { return }
                pending = target
            }
            .frame(height: 300)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .overlay(alignment: .bottom) {
                Text(Localized.s("web.loginScan")).font(.ehUI(12.5, .medium)).foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Capsule().fill(Color.black.opacity(0.45))).padding(12)
            }
        } else {
            Label(Localized.s("web.loginNoCamera"), systemImage: "camera.metering.unknown")
                .font(.ehUI(13)).foregroundStyle(Color.ehMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var codeEntry: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Localized.s("web.loginCode")).font(.ehUI(15, .black)).foregroundStyle(Color.ehText)
            Text(Localized.s("web.loginCodeHint")).font(.ehUI(12, .medium)).foregroundStyle(Color.ehMuted)
            HStack(spacing: 10) {
                TextField("ABC 123", text: $typed)
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                    .textInputAutocapitalization(.characters).autocorrectionDisabled().keyboardType(.asciiCapable)
                    .padding(.horizontal, 14).frame(height: 52)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Color.ehSurface))
                    .accessibilityLabel(Localized.s("web.loginCode"))
                Button {
                    guard let target = WebLogin.parse(typed) else { error = Localized.s("web.loginFailed"); return }
                    error = nil
                    pending = target
                } label: {
                    Image(systemName: "arrow.right").font(.system(size: 17, weight: .bold))
                        .frame(width: 52, height: 52)
                        .foregroundStyle(Color.ehSurface)
                        .background(Circle().fill(Color.ehAccent))
                }
                .accessibilityLabel(Localized.s("web.loginApprove"))
                .disabled(typed.filter { $0.isLetter || $0.isNumber }.count < 6)
            }
        }
    }

    private func approve(_ target: WebLogin.Target) {
        Task {
            do {
                _ = try await login.approve(target)
                done = Localized.s("web.loginDone")
                error = nil
            } catch {
                let code = (error as NSError).code
                self.error = Localized.s(code == URLError.notConnectedToInternet.rawValue ? "web.loginOffline" : "web.loginFailed")
            }
            pending = nil
        }
    }
}

/// VisionKit's live scanner, restricted to QR codes; unsupported on the Simulator, where the code field stands in.
private struct QRScanner: UIViewControllerRepresentable {
    let paused: Bool
    let onPayload: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        context.coordinator.onPayload = onPayload
        if paused { scanner.stopScanning() } else if !scanner.isScanning { try? scanner.startScanning() }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onPayload: onPayload) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onPayload: (String) -> Void
        init(onPayload: @escaping (String) -> Void) { self.onPayload = onPayload }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                if case .barcode(let barcode) = item, let payload = barcode.payloadStringValue { onPayload(payload) }
            }
        }
    }
}
