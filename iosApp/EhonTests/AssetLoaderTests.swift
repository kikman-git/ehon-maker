import XCTest
import UIKit
@testable import Ehon

final class AssetLoaderTests: XCTestCase {
    func testDownloadedMasterSurvivesOfflineRelaunchAndInvalidRefsNeverFetch() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let data = UIGraphicsImageRenderer(size: CGSize(width: 12, height: 18), format: format).pngData { context in
            UIColor.red.setFill(); context.fill(CGRect(x: 0, y: 0, width: 12, height: 18))
        }
        AssetProtocol.bytes = data
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AssetProtocol.self]
        let session = URLSession(configuration: configuration)
        let ref = "a/\(AccountSession.hash(data))"
        let loader = AssetLoader(directory: folder, baseURL: { URL(string: "https://assets.example.invalid") }, session: session)
        let image = await loader.load(ref, master: true)
        XCTAssertEqual(image?.size, CGSize(width: 12, height: 18))
        AssetProtocol.bytes = nil
        let offline = AssetLoader(directory: folder, baseURL: { nil }, session: session)
        XCTAssertEqual(offline.image(ref, master: true)?.size, image?.size)
        let invalid = await offline.load("a/../../private", master: true)
        XCTAssertNil(invalid)
    }

    func testMasterChecksumMismatchIsNeverCached() async {
        AssetProtocol.bytes = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).pngData { _ in }
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [AssetProtocol.self]
        let loader = AssetLoader(baseURL: { URL(string: "https://assets.example.invalid") }, session: URLSession(configuration: configuration))
        let result = await loader.load("a/\(String(repeating: "0", count: 64))", master: true)
        XCTAssertNil(result)
    }
}

private final class AssetProtocol: URLProtocol, @unchecked Sendable {
    static var bytes: Data?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let bytes = Self.bytes else { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)); return }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "image/png"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: bytes)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
