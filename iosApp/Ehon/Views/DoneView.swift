import SwiftUI
import EhonCore
import UIKit

/// できあがり — the finish screen, and the only place export happens.
///
/// v1 ships every export unlocked: the paywall is deferred (decision #11) but its seam is
/// intact, so switching it on later means passing `watermark: !entitled` to the scene
/// builder and gating these two buttons — not restructuring this screen.
struct DoneView: View {
    @EnvironmentObject var app: AppModel
    let book: Book

    @State private var share: ShareItem?
    @State private var busy = false

    private struct ShareItem: Identifiable {
        let id = UUID()
        let url: URL
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Localized.s("done.title"))
                    .font(.ehUI(29, .black))
                    .foregroundStyle(Color.ehText)
                Text(Localized.s("done.meta", book.pageCount))
                    .font(.ehUI(13, .medium))
                    .foregroundStyle(Color.ehMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 22)

            cover
                .padding(.vertical, 22)

            VStack(spacing: 10) {
                PillButton(title: Localized.s("done.sendToFamily"), filled: true, big: true) {
                    exportImage()
                }
                PillButton(title: Localized.s("done.print"), tinted: true, big: true) {
                    exportPdf()
                }
                // Print-on-demand is v2; it reuses this same PDF renderer plus a vendor spec.
                PillButton(title: Localized.s("done.makeRealBook"), big: true) {
                    exportPdf()
                }
                .opacity(0.55)
                .disabled(true)
            }
            .padding(.horizontal, 22)
            .overlay {
                if busy { ProgressView().tint(Color.ehAccent) }
            }

            Spacer()

            Button {
                app.markFinished(book)
                app.openShelf()
            } label: {
                Text(Localized.s("done.backToShelf"))
                    .font(.ehUI(14))
                    .foregroundStyle(Color.ehMuted)
                    .frame(height: 52)
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 18)
        .padding(.bottom, 24)
        .background(Color.ehBg)
        .sheet(item: $share) { item in
            ShareSheet(items: [item.url])
        }
    }

    /// The cover: page 1 at book proportions, tilted, with a spine.
    private var cover: some View {
        let width: CGFloat = 172
        let height = width / CGFloat(book.shape.aspect)
        return ZStack(alignment: .bottomLeading) {
            CoverPage(book: book, size: CGSize(width: width, height: height))
            HStack(spacing: 0) {
                Rectangle().fill(Color.ehInk.opacity(0.13)).frame(width: 10)
                Spacer()
            }
            Text(book.title)
                .font(.ehBody(15))
                .foregroundStyle(Color.ehInk)
                .padding(.leading, 16)
                .padding(.trailing, 12)
                .padding(.bottom, 14)
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .ehElevation(2)
        .rotationEffect(.degrees(-3))
    }

    // MARK: - export

    private func exportImage() {
        busy = true
        Task.detached {
            let data = await MainActor.run { SceneRenderer.shareImage(for: book) }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(book.title.isEmpty ? "ehon" : book.title).png")
            try? data?.write(to: url)
            await MainActor.run {
                busy = false
                if let data, !data.isEmpty { share = ShareItem(url: url) }
            }
        }
    }

    private func exportPdf() {
        busy = true
        Task.detached {
            let data = await MainActor.run { SceneRenderer.printablePdf(for: book) }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(book.title.isEmpty ? "ehon" : book.title).pdf")
            try? data.write(to: url)
            await MainActor.run {
                busy = false
                if !data.isEmpty { share = ShareItem(url: url) }
            }
        }
    }
}

private struct CoverPage: View {
    let book: Book
    let size: CGSize

    private static let builder = SceneBuilder(measurer: UIKitTextMeasurer())
    private static let painter = ScenePainter()

    var body: some View {
        let target = RenderTarget.Companion.shared.screen(
            shape: book.shape,
            available: Size(w: Float(size.width), h: Float(size.height)),
            selectedItem: nil
        )
        let scene = Self.builder.build(page: book.page(index: 0), target: target, promptText: nil)
        Canvas { ctx, _ in
            ctx.withCGContext { Self.painter.draw(scene, into: $0) }
        }
        .frame(width: CGFloat(scene.size.w), height: CGFloat(scene.size.h))
        .frame(width: size.width, height: size.height)
        .background(Color(book.page(index: 0).background.uiColor))
    }
}

/// UIActivityViewController, which is how a book leaves the app: LINE, Photos, Files, print.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
