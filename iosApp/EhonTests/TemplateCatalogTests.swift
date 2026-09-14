import XCTest
import EhonCore
@testable import Ehon

/// A Debug build carries the assembled stories (iosApp/scripts/bundle-templates.sh), so the templates
/// screen lists them without the assets Worker (decision #61).
@MainActor
final class TemplateCatalogTests: XCTestCase {
    func testDebugBuildListsTheBundledStoriesWithoutNetwork() async throws {
        let bundled = try XCTUnwrap(CloudConfiguration.bundledTemplatesURL, "the Debug bundle carries templates/index.json")
        let scratch = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: scratch) }
        let offline = URLSessionConfiguration.ephemeral
        offline.protocolClasses = [RefusingProtocol.self]
        let catalog = TemplateCatalog(directory: scratch, session: URLSession(configuration: offline), bundled: bundled)

        await catalog.load()

        XCTAssertEqual(catalog.state, .ready)
        XCTAssertGreaterThanOrEqual(catalog.entries.count, 5)
        XCTAssertEqual(catalog.entries.first?.id, "doc-love-letter")
        XCTAssertEqual(Set(catalog.entries.map(\.id)).count, catalog.entries.count, "story ids repeat")
        for entry in catalog.entries {
            XCTAssertFalse(entry.title.isEmpty, entry.id)
            XCTAssertGreaterThan(entry.pageCount, 0, entry.id)
            XCTAssertEqual(Int(entry.book.pageCount), entry.pageCount, entry.id)
        }
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: scratch.path), [], "a bundled copy is not cached again")
    }
}

/// Fails every request, so a test that reaches the network fails loudly instead of silently passing.
private final class RefusingProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
    override func stopLoading() {}
}
