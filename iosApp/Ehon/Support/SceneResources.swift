import Combine
import Foundation

/// Static pages and thumbnails also repaint when a bitmap, resolver entry, or font arrives.
@MainActor
final class SceneResources: ObservableObject {
    static let shared = SceneResources()
    @Published private(set) var revision = 0
    private var watches: Set<AnyCancellable> = []
    private init() {
        NotificationCenter.default.publisher(for: .ehonAssetsChanged).receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.revision &+= 1 }.store(in: &watches)
        FontLibrary.shared.$states.dropFirst().receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.revision &+= 1 }.store(in: &watches)
    }
}
