import Foundation
import EhonCore

/// Chrome strings, resolved from the shared catalogue by the device's language.
///
/// Decision #2: the *device* locale drives chrome, while a book's own `contentLocale`
/// drives furigana, the read-aloud voice and the body font. Those are deliberately not the
/// same thing — a parent switching their phone to English must not change how their
/// child's Japanese book reads.
enum Localized {
    static let strings: Strings = {
        let preferred = Locale.preferredLanguages.first ?? "en"
        return Strings.companion.forLocale(deviceLocale: preferred)
    }()

    static var isJapaneseUI: Bool { strings.locale.hasPrefix("ja") }

    static func s(_ key: String) -> String { strings.get(key: key) }

    /// The shared catalogue substitutes %s positionally, so everything arrives as text.
    static func s(_ key: String, _ args: Any...) -> String {
        strings.format(key: key, args: args.map { "\($0)" })
    }

    static func partName(_ part: Part) -> String { s("part.\(part.nameKey)") }

    static func categoryName(_ category: String) -> String {
        switch category {
        case PartCatalog.shared.CAT_SHAPES: return s("cat.shapes")
        case PartCatalog.shared.CAT_CREATURES: return s("cat.creatures")
        case PartCatalog.shared.CAT_SEA_SKY: return s("cat.seaSky")
        case PartCatalog.shared.CAT_NATURE: return s("cat.nature")
        case PartCatalog.shared.CAT_MAGIC: return s("cat.magic")
        default: return category
        }
    }

    static func shapeName(_ shape: PageShape) -> String {
        switch shape {
        case .landscape: return s("shape.landscape")
        case .portrait: return s("shape.portrait")
        default: return s("shape.square")
        }
    }
}
