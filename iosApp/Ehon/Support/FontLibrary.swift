import UIKit
import CoreText
import EhonCore

/// The five downloadable body faces (decision 2a): fetched on first use, kept in
/// Application Support, loaded through `CGFont` rather than registered by name.
///
/// Loading by `CGFont` matters for まるまる: the bundle already registers a *subset* Zen Maru
/// Gothic for chrome under the same PostScript name, and `CTFontManagerRegisterFontsForURL`
/// would refuse the complete one as a duplicate. A `CGFont` bypasses the registry entirely.
///
/// `font(for:)` is deliberately not main-actor bound: the painter and measurer call it from
/// export tasks off the main thread, so the CGFont cache sits behind a lock and only the
/// published UI state is confined to main.
final class FontLibrary: ObservableObject, @unchecked Sendable {

    static let shared = FontLibrary()

    enum State: Equatable { case bundled, ready, downloading, failed, missing }

    @MainActor @Published private(set) var states: [String: State] = [:]

    private var loaded: [String: CGFont] = [:]
    private let lock = NSLock()
    private let directory: URL

    /// Upstream Google Fonts release paths, mirroring `make fonts`. OFL licences ship in
    /// the bundle already (`OFL-*.txt`); the downloaded files are the same releases.
    private static let sources: [String: String] = [
        "maru": "zenmarugothic/ZenMaruGothic-Medium.ttf",
        "kiwi": "kiwimaru/KiwiMaru-Regular.ttf",
        "pop": "hachimarupop/HachiMaruPop-Regular.ttf",
        "marker": "yuseimagic/YuseiMagic-Regular.ttf",
        "futo": "rocknrollone/RocknRollOne-Regular.ttf",
    ]
    private static let base = URL(string: "https://github.com/google/fonts/raw/main/ofl/")!

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Fonts", isDirectory: true)
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
        var initial: [String: State] = [:]
        for face in FontFace.companion.selectable {
            initial[face.id] = face.bundled ? .bundled : (loadFromDisk(face) ? .ready : .missing)
        }
        let snapshot = initial
        Task { @MainActor in self.states = snapshot }
    }

    @MainActor func state(of face: FontFace) -> State { states[face.id] ?? .missing }

    /// Nil while the face is bundled or not yet downloaded; `EhonFonts` then falls back.
    nonisolated func font(for face: FontFace, size: CGFloat) -> UIFont? {
        lock.lock(); let cg = loaded[face.id]; lock.unlock()
        guard let cg else { return nil }
        return CTFontCreateWithGraphicsFont(cg, size, nil, nil) as UIFont
    }

    /// Idempotent: a second tap while downloading is a no-op.
    @MainActor func download(_ face: FontFace) {
        guard !face.bundled, state(of: face) != .ready, state(of: face) != .downloading,
              let path = Self.sources[face.id] else { return }
        states[face.id] = .downloading
        let url = Self.base.appendingPathComponent(path)
        let target = fileURL(face)
        Task {
            let result: State
            do {
                let (tmp, response) = try await URLSession.shared.download(from: url)
                guard (response as? HTTPURLResponse).map({ 200..<300 ~= $0.statusCode }) ?? true else {
                    throw URLError(.badServerResponse)
                }
                try? FileManager.default.removeItem(at: target)
                try FileManager.default.moveItem(at: tmp, to: target)
                result = loadFromDisk(face) ? .ready : .failed
            } catch {
                result = .failed
            }
            await MainActor.run { self.states[face.id] = result }
        }
    }

    private func fileURL(_ face: FontFace) -> URL {
        directory.appendingPathComponent(face.fileName)
    }

    private func loadFromDisk(_ face: FontFace) -> Bool {
        guard let provider = CGDataProvider(url: fileURL(face) as CFURL),
              let cg = CGFont(provider) else { return false }
        lock.lock(); loaded[face.id] = cg; lock.unlock()
        return true
    }
}
