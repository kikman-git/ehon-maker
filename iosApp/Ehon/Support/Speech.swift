import AVFoundation
import EhonCore

/// よみあげ — read-aloud.
///
/// The voice follows the *book's* `contentLocale`, not the device's. That is the whole
/// reason the field exists (decision #2): a Japanese book read on an English phone must
/// still be read in Japanese, or every word comes out mangled.
@MainActor
final class Speech: NSObject, ObservableObject {
    static let shared = Speech()

    @Published private(set) var isSpeaking = false

    private let synthesizer = AVSpeechSynthesizer()
    private var onFinish: (() -> Void)?

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// Reads a page's text items in order, falling back to its prompt when it has none.
    /// `onFinish` runs only when the utterance completes — never on `stop()`, so a chained
    /// action (the next bedtime page, a family voice) cannot fire after the child left.
    func speak(page: Page, locale: String, fallback: String?, onFinish: (() -> Void)? = nil) {
        speak(text: Self.text(of: page, locale: locale, fallback: fallback), locale: locale, onFinish: onFinish)
    }

    /// A page's spoken text: its text items in order, or its prompt when it has none.
    static func text(of page: Page, locale: String, fallback: String?) -> String {
        let text = page.items
            .compactMap { ($0 as? TextItem)?.text }
            .joined(separator: locale.hasPrefix("ja") ? "。" : ". ")
        return text.isEmpty ? (fallback ?? "") : text
    }

    func speak(text spoken: String, locale: String, onFinish: (() -> Void)? = nil) {
        stop()
        self.onFinish = onFinish
        guard !spoken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            let done = onFinish; self.onFinish = nil; done?()
            return
        }

        let utterance = AVSpeechUtterance(string: spoken)
        utterance.voice = AVSpeechSynthesisVoice(language: bcp47(locale))
        // The prototype's 0.85: slow enough for a child to follow along on the page.
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    func stop() {
        onFinish = nil
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        isSpeaking = false
    }

    fileprivate func finished() {
        isSpeaking = false
        let done = onFinish
        onFinish = nil
        done?()
    }

    /// `ja-JP` / `en-US` are already BCP-47; a bare `ja` needs a region to pick a voice.
    private func bcp47(_ locale: String) -> String {
        if locale.contains("-") { return locale }
        return locale.hasPrefix("ja") ? "ja-JP" : "en-US"
    }
}

extension Speech: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in self.finished() }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in self.isSpeaking = false }
    }
}
