import UIKit
import EhonCore

/// Resolves a `FontFace` to a `UIFont`.
///
/// Only Yomogi (てがき) and the Zen Maru Gothic UI subset ship in the bundle. The other five
/// selectable faces download on first use through `FontLibrary`; until one has arrived its
/// text is laid out in Yomogi, so the page never reflows when the download lands mid-edit —
/// it only changes glyphs.
enum EhonFonts {
    static let bodyFamily = "Yomogi-Regular"
    static let uiFamily = "ZenMaruGothic-Medium"

    static func font(for face: FontFace, size: CGFloat) -> UIFont {
        if face == .ui {
            return UIFont(name: uiFamily, size: size) ?? systemStandIn(size)
        }
        if let downloaded = FontLibrary.shared.font(for: face, size: size) {
            return downloaded
        }
        return UIFont(name: bodyFamily, size: size) ?? systemStandIn(size)
    }

    /// Rounded is the closest system stand-in for Organic's voice.
    private static func systemStandIn(_ size: CGFloat) -> UIFont {
        let system = UIFont.systemFont(ofSize: size, weight: .medium)
        guard let descriptor = system.fontDescriptor.withDesign(.rounded) else { return system }
        return UIFont(descriptor: descriptor, size: size)
    }

    /// True once the bundled faces are registered. Both painters depend on identical
    /// metrics, so a build where only one platform has the fonts would silently misplace ruby.
    static var bundledFacesPresent: Bool {
        UIFont(name: bodyFamily, size: 12) != nil && UIFont(name: uiFamily, size: 12) != nil
    }
}
