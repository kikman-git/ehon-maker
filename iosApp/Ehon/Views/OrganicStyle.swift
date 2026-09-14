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

/// Every symbol in the chrome: outline SF Symbols at one weight, the phone's counterpart of the web's
/// single line set. Filled variants are for state (a checked box), never for decoration.
struct EhIcon: View {
    let name: String
    var size: CGFloat = 18

    init(_ name: String, size: CGFloat = 18) { self.name = name; self.size = size }

    var body: some View { Image(systemName: name).font(.system(size: size, weight: .semibold)) }
}

/// A path in SVG `d` syntax, fitted to the rect it is asked for: M L H V C S Z, absolute and relative,
/// which is all the provider marks need. The phone draws the very paths the web draws (Brand.tsx).
struct SvgPath: Shape {
    let d: String
    let viewBox: CGFloat

    private enum Token { case command(Character), number(CGFloat) }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let scale = min(rect.width, rect.height) / viewBox
        let at = { (p: CGPoint) in CGPoint(x: rect.minX + p.x * scale, y: rect.minY + p.y * scale) }
        var current = CGPoint.zero, start = CGPoint.zero, control: CGPoint?
        var command: Character = "M", params: [CGFloat] = []
        for token in Self.tokens(d) {
            switch token {
            case .command(let next):
                command = next; params = []
                if next == "Z" || next == "z" { path.closeSubpath(); current = start; control = nil }
            case .number(let value):
                params.append(value)
                let needed: Int
                switch command {
                case "M", "m", "L", "l": needed = 2
                case "H", "h", "V", "v": needed = 1
                case "C", "c": needed = 6
                case "S", "s": needed = 4
                default: needed = 0
                }
                guard needed > 0, params.count == needed else { continue }
                let relative = command.isLowercase
                let origin = relative ? current : .zero
                switch command {
                case "M", "m":
                    current = CGPoint(x: origin.x + params[0], y: origin.y + params[1]); start = current; control = nil
                    path.move(to: at(current)); command = relative ? "l" : "L"
                case "L", "l":
                    current = CGPoint(x: origin.x + params[0], y: origin.y + params[1]); control = nil; path.addLine(to: at(current))
                case "H", "h":
                    current.x = origin.x + params[0]; control = nil; path.addLine(to: at(current))
                case "V", "v":
                    current.y = origin.y + params[0]; control = nil; path.addLine(to: at(current))
                case "C", "c", "S", "s":
                    let first: CGPoint, rest: ArraySlice<CGFloat>
                    if command == "C" || command == "c" {
                        first = CGPoint(x: origin.x + params[0], y: origin.y + params[1]); rest = params[2...]
                    } else {
                        // A smooth curve mirrors the previous control point through the current point.
                        first = control.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current; rest = params[0...]
                    }
                    let second = CGPoint(x: origin.x + rest[rest.startIndex], y: origin.y + rest[rest.startIndex + 1])
                    let end = CGPoint(x: origin.x + rest[rest.startIndex + 2], y: origin.y + rest[rest.startIndex + 3])
                    path.addCurve(to: at(end), control1: at(first), control2: at(second))
                    control = second; current = end
                default: break
                }
                params = []
            }
        }
        return path
    }

    private static func tokens(_ d: String) -> [Token] {
        var result: [Token] = []
        var number = ""
        func flush() { if let value = Double(number) { result.append(.number(CGFloat(value))) }; number = "" }
        for character in d {
            if character.isLetter {
                flush(); result.append(.command(character))
            } else if character == " " || character == "," || character.isNewline {
                flush()
            } else if character == "-" || character == "+" {
                if !number.isEmpty { flush() }
                number.append(character)
            } else if character == "." {
                if number.contains(".") { flush() }
                number.append(character)
            } else {
                number.append(character)
            }
        }
        flush()
        return result
    }
}

/// The Google mark on the sign-in button, the same four paths as the web's Brand.tsx; Apple's own
/// control paints the Apple mark.
struct GoogleMark: View {
    var size: CGFloat = 18

    private static let pieces: [(Color, String)] = [
        (Color(red: 234 / 255, green: 67 / 255, blue: 53 / 255), "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"),
        (Color(red: 66 / 255, green: 133 / 255, blue: 244 / 255), "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"),
        (Color(red: 251 / 255, green: 188 / 255, blue: 5 / 255), "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"),
        (Color(red: 52 / 255, green: 168 / 255, blue: 83 / 255), "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"),
    ]

    var body: some View {
        ZStack {
            ForEach(Array(Self.pieces.enumerated()), id: \.offset) { _, piece in
                SvgPath(d: piece.1, viewBox: 48).fill(piece.0)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
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
            EhIcon(systemName, size: diameter * 0.44)
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
