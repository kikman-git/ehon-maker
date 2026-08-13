import SwiftUI
import UIKit

/// A tileable paper speckle, generated once and reused.
///
/// Part of decision #6's materials half. A lot of "book feel" is material rather than
/// motion — grain, a spine gutter, an edge — and those are the cheap items on that list.
enum PaperGrain {

    static let tile: UIImage = makeTile(side: 128)

    /// Deterministic so the texture cannot shimmer between redraws.
    private static func makeTile(side: Int) -> UIImage {
        let size = CGSize(width: side, height: side)
        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            let ctx = context.cgContext
            var seed: UInt64 = 0x9E3779B97F4A7C15
            func next() -> Double {
                seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17
                return Double(seed % 10_000) / 10_000
            }
            for _ in 0..<(side * side / 5) {
                let x = next() * Double(side)
                let y = next() * Double(side)
                let dark = next() < 0.5
                ctx.setFillColor(
                    red: 0, green: 0, blue: 0,
                    alpha: dark ? 0.035 : 0.0
                )
                if dark {
                    ctx.fill(CGRect(x: x, y: y, width: 1, height: 1))
                }
            }
        }
    }
}

extension View {
    /// Overlays paper grain without tinting the page underneath.
    func paperGrain(opacity: Double = 0.55) -> some View {
        overlay(
            Image(uiImage: PaperGrain.tile)
                .resizable(resizingMode: .tile)
                .opacity(opacity)
                .allowsHitTesting(false)
                .blendMode(.multiply)
        )
    }

    /// The darkening near the spine that makes a flat page read as a bound leaf.
    func spineGutter(on edge: HorizontalAlignment, width: CGFloat = 26) -> some View {
        overlay(alignment: edge == .leading ? .leading : .trailing) {
            LinearGradient(
                colors: [Color.black.opacity(0.14), Color.black.opacity(0)],
                startPoint: edge == .leading ? .leading : .trailing,
                endPoint: edge == .leading ? .trailing : .leading
            )
            .frame(width: width)
            .allowsHitTesting(false)
        }
    }
}
