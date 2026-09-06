import SwiftUI
import EhonCore

/// What ばあば sees when she opens the link: just the book, and one big button to hold
/// while she talks. Model 3b. Nothing to learn, no account, no chrome beyond this.
///
/// In v1 the recording lands on this device and is attached to the book directly — the
/// same `PageReply` the child's read screen plays after よみあげ. The web version of this
/// screen (アプリ 不要) is the piece that needs a server, and is out of this repo's scope.
struct GuestView: View {
    @EnvironmentObject var app: AppModel
    @StateObject private var speech = Speech.shared
    @StateObject private var recorder = VoiceRecorder.shared

    let book: Book
    @State private var index = 0
    @State private var pressing = false
    @State private var toast: String?
    @State private var recRef: String?

    private var childName: String {
        UserDefaults.standard.string(forKey: "childName") ?? (Localized.isJapaneseUI ? "みお" : "friend")
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            GeometryReader { geo in
                let box = Size(w: Float(max(geo.size.width - 40, 1)), h: Float(max(geo.size.height - 24, 1)))
                let pageSize = book.shape.fitInto(box: box)
                let size = CGSize(width: CGFloat(pageSize.w), height: CGFloat(pageSize.h))
                HStack(spacing: 0) {
                    turnZone(-1)
                    GuestPage(book: book, index: index, size: size)
                        .frame(width: size.width, height: size.height)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .ehElevation(2)
                    turnZone(+1)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
            dots
            recordButton
        }
        .background(Color.ehInk)
        .overlay(alignment: .bottom) {
            if let toast { ToastView(text: toast).padding(.bottom, 150) }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .onDisappear { speech.stop(); if recorder.isRecording { _ = recorder.stop() } }
    }

    private var currentPage: Page { book.page(index: Int32(index)) }

    private var topBar: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Localized.s("guest.arrived", childName))
                    .font(.ehUI(11.5, .medium))
                    .foregroundStyle(Color.ehBg.opacity(0.6))
                Text(book.title)
                    .font(.ehUI(15.5))
                    .foregroundStyle(Color.ehSurface)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            Button {
                if speech.isSpeaking { speech.stop() } else {
                    speech.speak(page: currentPage, locale: book.contentLocale,
                                 fallback: currentPage.promptKey.map { Localized.s($0) })
                }
            } label: {
                Text(speech.isSpeaking ? Localized.s("read.stop") : Localized.s("read.aloud"))
                    .font(.ehUI(13.5))
                    .foregroundStyle(Color.ehSurface)
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(Capsule().fill(speech.isSpeaking ? Color.ehAccent : Color.ehSurface.opacity(0.14)))
            }
            .buttonStyle(.plain)
            // Debug/route convenience: back to the child's side.
            CircleIconButton(systemName: "xmark", diameter: 44,
                             background: Color.ehSurface.opacity(0.14), foreground: .ehSurface) {
                app.openShelf()
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 4)
    }

    /// Tap either margin to turn — the spec's よこ の あき.
    private func turnZone(_ delta: Int) -> some View {
        Color.clear
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .onTapGesture {
                let next = index + delta
                guard next >= 0, next < Int(book.pageCount) else { return }
                speech.stop()
                withAnimation(.easeOut(duration: 0.22)) { index = next }
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.7)
            }
    }

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(0..<Int(book.pageCount), id: \.self) { page in
                Circle()
                    .fill(page == index ? Color.ehBg : Color.ehBg.opacity(0.32))
                    .frame(width: page == index ? 9 : 6, height: page == index ? 9 : 6)
            }
        }
        .padding(.vertical, 12)
    }

    // MARK: - hold to record

    private var recordButton: some View {
        VStack(spacing: 10) {
            Text(recorder.isRecording
                 ? Localized.s("guest.recording", String(format: "%.1f", recorder.elapsed))
                 : (currentPage.reply != nil
                    ? Localized.replyChip(currentPage.reply!)
                    : Localized.s("guest.hint", childName)))
                .font(.ehUI(12, .medium))
                .foregroundStyle(Color.ehBg.opacity(0.7))
                .lineLimit(1)
            ZStack {
                Circle()
                    .fill(recorder.isRecording ? Color.ehAccent : Color.ehBg)
                    .frame(width: 84, height: 84)
                    .scaleEffect(recorder.isRecording ? 1.08 : 1)
                    .shadow(color: Color.ehAccent.opacity(recorder.isRecording ? 0.5 : 0), radius: 22)
                Image(systemName: recorder.isRecording ? "waveform" : "mic.fill")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(recorder.isRecording ? Color.ehSurface : Color.ehInk)
            }
            .animation(.spring(duration: 0.25), value: recorder.isRecording)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in if !pressing { pressing = true; beginRecording() } }
                    .onEnded { _ in pressing = false; endRecording() }
            )
            Text(recorder.isRecording ? Localized.s("guest.releaseToSend") : Localized.s("guest.holdToRecord"))
                .font(.ehUI(13))
                .foregroundStyle(Color.ehSurface)
        }
        .padding(.bottom, 28)
    }

    private func beginRecording() {
        Task { @MainActor in
            guard await recorder.requestPermission() else {
                show(Localized.s("read.cannotPlayVoice")); pressing = false; return
            }
            // The finger may already have lifted while the permission sheet was up.
            guard pressing else { return }
            let ref = "\(book.id.value)-p\(index)-\(Int(Date().timeIntervalSince1970)).m4a"
            recRef = ref
            speech.stop()
            if !recorder.start(ref: ref) { show(Localized.s("read.cannotPlayVoice")); recRef = nil }
        }
    }

    private func endRecording() {
        guard recorder.isRecording, let ref = recRef else { return }
        let seconds = recorder.stop()
        recRef = nil
        guard seconds >= VoiceRecorder.minimumSeconds else {
            recorder.discard(ref: ref)
            show(Localized.s("guest.tooShort"))
            return
        }
        let reply = PageReply(
            from: Localized.s("family.grandma"),
            seconds: Float(seconds),
            audioRef: ref,
            recordedAtEpochMs: Int64(Date().timeIntervalSince1970 * 1000)
        )
        app.attach(reply: reply, toPage: index, of: book)
        show(Localized.s("guest.sent"))
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func show(_ text: String) {
        toast = text
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1700))
            if toast == text { toast = nil }
        }
    }
}

/// Page rendering for the guest — the shared painter, plus paper.
private struct GuestPage: View {
    let book: Book
    let index: Int
    let size: CGSize

    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    private static let painter = ScenePainter()

    var body: some View {
        let target = RenderTarget.Companion.shared.screen(
            shape: book.shape, available: Size(w: Float(size.width), h: Float(size.height)), selectedItem: nil
        )
        let scene = Self.builder.build(page: book.page(index: Int32(index)), target: target, promptText: nil)
        Canvas { ctx, _ in
            ctx.withCGContext { Self.painter.draw(scene, into: $0) }
        }
        .frame(width: size.width, height: size.height)
        .background(Color(book.page(index: Int32(index)).background.uiColor))
        .paperGrain()
    }
}
