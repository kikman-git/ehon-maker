import UIKit
import ImageIO
import CryptoKit
import EhonCore

/// A bounded decoded-image cache backed by content-addressed disk files.
final class AssetLoader: @unchecked Sendable {
    static let shared = AssetLoader()
    private let memory = NSCache<NSString, UIImage>()
    private let lock = NSLock()
    private var requests: [String: Task<UIImage?, Never>] = [:]
    private var retryAfter: [String: Date] = [:]
    private let directory: URL
    private let baseURL: () -> URL?
    private let session: URLSession

    init(directory: URL? = nil, baseURL: @escaping () -> URL? = { CloudConfiguration.assetsURL }, session: URLSession = .shared) {
        self.directory = directory ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("assets", isDirectory: true)
        self.baseURL = baseURL; self.session = session
        memory.totalCostLimit = 64 * 1024 * 1024
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }

    static func validRef(_ ref: String) -> Bool { ref.range(of: "^a/[0-9a-f]{64}$", options: .regularExpression) != nil }

    func image(_ ref: String, master: Bool = false) -> UIImage? {
        guard Self.validRef(ref) else { return nil }
        let key = "\(ref)/\(master ? "m.png" : "1024.webp")"
        if let ready = cached(key) { return ready }
        _ = request(key)
        return cached("\(ref)/256.webp") ?? (master ? cached("\(ref)/1024.webp") : nil)
    }

    @discardableResult func load(_ ref: String, master: Bool = false) async -> UIImage? {
        guard Self.validRef(ref) else { return nil }
        let key = "\(ref)/\(master ? "m.png" : "1024.webp")"
        if let ready = cached(key) { return ready }
        return await request(key).value
    }

    @MainActor func prefetch(_ book: Book) {
        Task { await prepare(book, master: false) }
    }

    @MainActor func prepare(_ book: Book, master: Bool) async {
        await PartRegistry.shared.ensure(book)
        let ids = Set((0..<Int(book.pageCount)).flatMap { book.page(index: Int32($0)).items.compactMap { ($0 as? PartItem)?.partId.value } })
        for id in ids {
            if let raster = PartRegistry.shared.find(id: PartId(value: id))?.def as? PartDefRaster {
                _ = await load(raster.assetRef, master: master)
            }
        }
    }

    private func request(_ key: String) -> Task<UIImage?, Never> {
        lock.lock(); defer { lock.unlock() }
        if let running = requests[key] { return running }
        if let retry = retryAfter[key], retry > Date() { return Task { nil } }
        let task = Task.detached { [self] () -> UIImage? in
            defer { finish(key) }
            guard let base = baseURL() else { return nil }
            do {
                let (tmp, response) = try await session.download(from: base.appendingPathComponent(key))
                defer { try? FileManager.default.removeItem(at: tmp) }
                guard (response as? HTTPURLResponse)?.statusCode == 200,
                      (try tmp.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 25 * 1024 * 1024 else { return nil }
                let data = try Data(contentsOf: tmp)
                if key.hasSuffix("/m.png"), Self.hash(data) != key.split(separator: "/")[1] { return nil }
                guard let image = decode(data) else { return nil }
                try data.write(to: disk(key), options: .atomic)
                remember(image, key: key)
                DispatchQueue.main.async { NotificationCenter.default.post(name: .ehonAssetsChanged, object: nil) }
                return image
            } catch { return nil }
        }
        requests[key] = task
        return task
    }

    private func finish(_ key: String) {
        lock.lock(); requests[key] = nil; retryAfter[key] = Date().addingTimeInterval(30); lock.unlock()
    }
    private func cached(_ key: String) -> UIImage? {
        if let image = memory.object(forKey: key as NSString) { return image }
        guard let data = try? Data(contentsOf: disk(key)), let image = decode(data) else { return nil }
        remember(image, key: key)
        return image
    }
    private func remember(_ image: UIImage, key: String) {
        memory.setObject(image, forKey: key as NSString, cost: (image.cgImage?.bytesPerRow ?? 0) * (image.cgImage?.height ?? 0))
    }
    private func decode(_ data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) == 1,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= 2048, height <= 2048,
              let cg = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
    private func disk(_ key: String) -> URL { directory.appendingPathComponent(Self.hash(Data(key.utf8))) }
    private static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
}
