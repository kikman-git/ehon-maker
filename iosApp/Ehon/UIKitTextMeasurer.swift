import UIKit
import EhonCore

/// Platform text metrics for the shared `SceneBuilder`.
///
/// Measures through exactly the same UIKit call the painter draws with, so a string's
/// measured width and its drawn width cannot disagree. That matters because group-ruby
/// centring is `(baseWidth - rubyWidth) / 2` computed in shared code — if measurement and
/// drawing diverge, the annotation lands off-centre and nothing catches it.
final class UIKitTextMeasurer: TextMeasurer {
    func width(text: String, fontSizePx: Float, font: FontRole) -> Float {
        let attributes = [NSAttributedString.Key.font: EhonFonts.font(for: font, size: CGFloat(fontSizePx))]
        return Float((text as NSString).size(withAttributes: attributes).width)
    }
}
