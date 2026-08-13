import SwiftUI
import EhonCore

/// The Organic design system, as SwiftUI. Tokens come from the shared `Organic` object so
/// the palette cannot drift between the painters and the chrome.
extension Color {
    static let ehBg = Color(Organic.shared.bg.uiColor)
    static let ehSurface = Color(Organic.shared.surface.uiColor)
    static let ehSunken = Color(Organic.shared.surfaceSunken.uiColor)
    static let ehEdge = Color(Organic.shared.surfaceEdge.uiColor)
    static let ehText = Color(Organic.shared.text.uiColor)
    static let ehMuted = Color(Organic.shared.textMuted.uiColor)
    static let ehInk = Color(Organic.shared.ink.uiColor)
    static let ehAccent = Color(Organic.shared.accent.uiColor)
    static let ehAccentDeep = Color(Organic.shared.accentDeep.uiColor)
    static let ehAccentTint = Color(Organic.shared.accentTint.uiColor)
    static let ehAccent2 = Color(Organic.shared.accent2.uiColor)
    static let ehAccent2Tint = Color(Organic.shared.accent2Tint.uiColor)
    static let ehAccent2Deep = Color(Organic.shared.accent2Deep.uiColor)
}

extension Font {
    /// UI chrome: Zen Maru Gothic, subset to shipped strings.
    static func ehUI(_ size: CGFloat, _ weight: UIFont.Weight = .bold) -> Font {
        let face: String
        switch weight {
        case .heavy, .black: face = "ZenMaruGothic-Black"
        case .bold, .semibold: face = "ZenMaruGothic-Bold"
        case .medium: face = "ZenMaruGothic-Medium"
        default: face = "ZenMaruGothic-Regular"
        }
        if UIFont(name: face, size: size) != nil { return .custom(face, size: size) }
        return .system(size: size, weight: weight == .black ? .heavy : .bold, design: .rounded)
    }

    /// Book body text: Yomogi, shipped complete.
    static func ehBody(_ size: CGFloat) -> Font {
        UIFont(name: "Yomogi-Regular", size: size) != nil
            ? .custom("Yomogi-Regular", size: size)
            : .system(size: size, design: .rounded)
    }

    /// Logo only. Caprasimo has no kana, so it is never used for Japanese copy.
    static func ehDisplay(_ size: CGFloat) -> Font {
        UIFont(name: "Caprasimo-Regular", size: size) != nil
            ? .custom("Caprasimo-Regular", size: size)
            : .system(size: size, weight: .black, design: .serif)
    }
}

/// A pill button. Organic's primary action is a solid accent fill; radius is always 999.
struct PillButton: View {
    let title: String
    var filled = false
    var tinted = false
    var big = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.ehUI(big ? 15.5 : 13.5))
                .foregroundStyle(filled ? Color.ehSurface : .ehText)
                .padding(.horizontal, big ? 20 : 16)
                .frame(height: big ? 58 : 42)
                .frame(maxWidth: big ? .infinity : nil)
                .background(
                    Capsule().fill(
                        filled ? Color.ehAccent : (tinted ? Color.ehSunken : .clear)
                    )
                )
                .overlay(
                    Capsule().strokeBorder(
                        filled || tinted ? .clear : Color.ehEdge, lineWidth: 1
                    )
                )
        }
        .buttonStyle(.plain)
    }
}

/// Circular icon button, used for back and for the drawer's compact controls.
struct CircleIconButton: View {
    let systemName: String
    var diameter: CGFloat = 42
    var background: Color = .ehSunken
    var foreground: Color = .ehText
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: diameter * 0.44, weight: .bold))
                .foregroundStyle(foreground)
                .frame(width: diameter, height: diameter)
                .background(Circle().fill(background))
        }
        .buttonStyle(.plain)
    }
}

/// A selectable chip, as used by the category and filter rows.
struct Chip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.ehUI(12.5, selected ? .bold : .medium))
                .foregroundStyle(selected ? Color.ehSurface : .ehMuted)
                .padding(.horizontal, 13)
                .padding(.vertical, 7)
                .background(Capsule().fill(selected ? Color.ehInk : Color.ehSunken))
        }
        .buttonStyle(.plain)
    }
}

/// Brief confirmation, matching the prototype's toast.
struct ToastView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.ehUI(13))
            .foregroundStyle(Color.ehSurface)
            .padding(.horizontal, 20)
            .padding(.vertical, 11)
            .background(Capsule().fill(Color.ehInk))
            .shadow(color: .black.opacity(0.22), radius: 16, y: 8)
            .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

extension View {
    /// Organic's elevation steps, tuned against the warm ground rather than pure black.
    func ehElevation(_ level: Int = 1) -> some View {
        let radius: CGFloat = [3, 10, 32][min(level, 2)]
        let y: CGFloat = [1, 3, 12][min(level, 2)]
        return shadow(color: Color(red: 0.18, green: 0.17, blue: 0.145).opacity(0.18),
                      radius: radius, x: 0, y: y)
    }
}
