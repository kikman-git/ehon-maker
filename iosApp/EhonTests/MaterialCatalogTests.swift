import XCTest
import CryptoKit
import EhonCore
@testable import Ehon

@MainActor
final class MaterialCatalogTests: XCTestCase {
    func testRefreshVerifiesCatalogAndRestoresItOffline() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        var source = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(PartCatalog.shared.materialsJson().utf8)) as? [String: Any])
        var entries = try XCTUnwrap(source["assets"] as? [[String: Any]])
        var incoming = try XCTUnwrap(entries.first)
        incoming["id"] = "pack.storybook:catalog-test"
        incoming["name"] = "新しいことり"
        incoming["legacyIds"] = [] as [String]
        entries.append(incoming)
        source["assets"] = entries
        let json = try JSONSerialization.data(withJSONObject: source)
        let hash = SHA256.hash(data: json).map { String(format: "%02x", $0) }.joined()
        let pointer = try JSONSerialization.data(withJSONObject: ["version": 1, "revision": hash, "file": "catalogs/\(hash).json", "bytes": json.count])
        CatalogProtocol.files = ["/materials/index.json": pointer, "/materials/catalogs/\(hash).json": json]
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CatalogProtocol.self]
        let session = URLSession(configuration: configuration)
        let url = URL(string: "https://catalog.example.invalid")!
        let catalog = MaterialCatalog(directory: folder, baseURL: { url }, session: session)
        await catalog.refresh()
        XCTAssertEqual(catalog.revision, hash)
        XCTAssertEqual(PartCatalog.shared.find(id: PartId(value: "pack.storybook:catalog-test"))?.nameKey, "新しいことり")
        CatalogProtocol.files["/materials/catalogs/\(hash).json"] = Data("{}".utf8)
        await catalog.refresh()
        XCTAssertEqual(catalog.revision, hash)
        CatalogProtocol.files = [:]
        let offline = MaterialCatalog(directory: folder, baseURL: { url }, session: session)
        offline.restore()
        XCTAssertEqual(offline.revision, hash)
        XCTAssertNotNil(PartCatalog.shared.find(id: PartId(value: "pack.storybook:catalog-test")))
        await offline.refresh()
        XCTAssertEqual(offline.revision, hash)
    }

    func testUnsupportedCatalogDoesNotReplaceBundledMaterials() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        CatalogProtocol.files = ["/materials/index.json": Data("{\"version\":99}".utf8)]
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CatalogProtocol.self]
        let catalog = MaterialCatalog(directory: folder, baseURL: { URL(string: "https://invalid.example.invalid") }, session: URLSession(configuration: configuration))
        await catalog.refresh()
        XCTAssertNil(catalog.revision)
        XCTAssertNotNil(PartCatalog.shared.find(id: PartId(value: "pack.storybook:bird")))
    }
}

private final class CatalogProtocol: URLProtocol, @unchecked Sendable {
    static var files: [String: Data] = [:]
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let bytes = Self.files[request.url!.path] else { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)); return }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: bytes)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
