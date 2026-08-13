import UIKit
import EhonCore

/// Resolves the two bundled faces.
///
/// Zen Maru Gothic is subset to shipped UI strings; Yomogi ships complete because users
/// type arbitrary text into it. Neither TTF is in the repo yet, so both fall back to the
/// system face — which keeps the app buildable and runnable, and means dropping the real
/// files in is the only change needed later.
enum EhonFonts {
    static let bodyFamily = "Yomogi"
    static let uiFamily = "ZenMaruGothic-Medium"

    static func font(for role: FontRole, size: CGFloat) -> UIFont {
        let name = role.ordinal == FontRole.body.ordinal ? bodyFamily : uiFamily
        if let custom = UIFont(name: name, size: size) {
            return custom
        }
        // Rounded is the closest system stand-in for Organic's voice.
        let system = UIFont.systemFont(ofSize: size, weight: .medium)
        guard let descriptor = system.fontDescriptor.withDesign(.rounded) else { return system }
        return UIFont(descriptor: descriptor, size: size)
    }

    /// True once the real faces are bundled — both painters depend on identical metrics,
    /// so a build where only one platform has the fonts would silently misplace ruby.
    static var bundledFacesPresent: Bool {
        UIFont(name: bodyFamily, size: 12) != nil && UIFont(name: uiFamily, size: 12) != nil
    }
}
