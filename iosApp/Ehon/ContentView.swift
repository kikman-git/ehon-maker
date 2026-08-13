import SwiftUI
import EhonCore

/// A scaffold that exercises the whole shared pipeline end to end: template → book →
/// scene → painter → screen, plus PDF export. Not the shipping UI — the shipping editor
/// is model 1a (はる / かく / もじ). This exists so the architecture can be seen working.
struct ContentView: View {
    // iOS turns `-templateIndex 2` on the command line into a UserDefaults value, which
    // makes the scaffold drivable from `simctl launch --args` for screenshots.
    @State private var templateIndex = UserDefaults.standard.integer(forKey: "templateIndex")
    @State private var pageIndex = 0
    @State private var shapeOverride = PageShape.square
    @State private var exportedPageCount: Int?

    private var template: Template { Templates.shared.all[templateIndex] }

    private var book: Book {
        Templates.shared.instantiate(
            template: template,
            bookId: BookId(value: "preview"),
            title: "プレビュー",
            contentLocale: "ja-JP",
            nowEpochMs: 0,
            shapeOverride: shapeOverride,
            idSource: IdSource(prefix: "i")
        )
    }

    var body: some View {
        VStack(spacing: 14) {
            header

            PageCanvas(book: book, pageIndex: pageIndex, promptText: "だれが でてくる？")
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            controls
        }
        .padding(.vertical, 18)
        .background(Color(Organic.shared.bg.uiColor))
    }

    private var header: some View {
        VStack(spacing: 3) {
            Text(template.id + " · " + shapeLabel)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(Color(Organic.shared.textMuted.uiColor))
            Text("ページ \(pageIndex + 1) / \(book.pageCount)")
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .foregroundStyle(Color(Organic.shared.text.uiColor))
            if !EhonFonts.bundledFacesPresent {
                Text("Yomogi / Zen Maru Gothic not bundled — using system fallback")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var controls: some View {
        VStack(spacing: 10) {
            Picker("template", selection: $templateIndex) {
                ForEach(0..<Templates.shared.all.count, id: \.self) { index in
                    Text(Templates.shared.all[index].id).tag(index)
                }
            }
            .pickerStyle(.segmented)

            Picker("shape", selection: $shapeOverride) {
                Text("しかく").tag(PageShape.square)
                Text("よこなが").tag(PageShape.landscape)
                Text("たてなが").tag(PageShape.portrait)
            }
            .pickerStyle(.segmented)
            .disabled(!template.shapeIsUserChosen)

            HStack {
                Button("まえ") { pageIndex = max(0, pageIndex - 1) }
                    .disabled(pageIndex == 0)
                Spacer()
                Button("PDF を つくる") { exportPdf() }
                Spacer()
                Button("つぎ") { pageIndex = min(Int(book.pageCount) - 1, pageIndex + 1) }
                    .disabled(pageIndex >= Int(book.pageCount) - 1)
            }
            .font(.system(size: 15, weight: .bold, design: .rounded))

            if let count = exportedPageCount {
                Text("PDF: \(count) ページ")
                    .font(.system(size: 11))
                    .foregroundStyle(Color(Organic.shared.accentDeep.uiColor))
            }
        }
        .padding(.horizontal, 18)
        .onChange(of: templateIndex) { pageIndex = 0; exportedPageCount = nil }
        .onChange(of: shapeOverride) { pageIndex = 0; exportedPageCount = nil }
    }

    private var shapeLabel: String {
        switch book.shape {
        case .landscape: return "よこなが"
        case .portrait: return "たてなが"
        default: return "しかく"
        }
    }

    private func exportPdf() {
        let data = SceneRenderer.printablePdf(for: book)
        exportedPageCount = data.isEmpty ? 0 : Int(book.pageCount)
    }
}

extension Int32 {
    var uiColor: UIColor { UIColor(cgColor: cgColor) }
}
