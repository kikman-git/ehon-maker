import SwiftUI
import EhonCore

struct RetiredMaterialsNotice: View {
    @ObservedObject var model: EditorModel
    @State private var presented = false

    var body: some View {
        let retired = PartCatalog.shared.retiredIn(book: model.book)
        if !retired.isEmpty {
            Button {
                presented = true
            } label: {
                Text("以前の素材 \(retired.count) 点は表示されません。新しい絵に置きかえる")
                    .font(.ehUI(12))
                    .frame(maxWidth: .infinity)
                    .padding(10)
                    .background(Color.ehSunken)
            }
            .disabled(model.isReadOnly)
            .sheet(isPresented: $presented) {
                MaterialReplacementSheet(model: model)
            }
        }
    }
}

private struct MaterialReplacementSheet: View {
    @ObservedObject var model: EditorModel
    @Environment(\.dismiss) private var dismiss
    @State private var selectedKey = ""
    @State private var query = ""

    private func key(_ item: RetiredMaterial) -> String { item.pageId + "\u{0}" + item.itemId }

    var body: some View {
        let retired = PartCatalog.shared.retiredIn(book: model.book)
        let target = retired.first { key($0) == selectedKey }
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if retired.isEmpty {
                        Text("すべての素材を置きかえました。")
                    } else {
                        Picker("置きかえる素材", selection: $selectedKey) {
                            Text("選んでください").tag("")
                            ForEach(retired.indices, id: \.self) { index in
                                let item = retired[index]
                                Text("\(item.pageNumber) ページ · \(item.name)").tag(key(item))
                            }
                        }
                        Text("新しい絵を選ぶと、位置と大きさを保って置きかえます。元に戻すこともできます。")
                            .font(.ehUI(13))
                        TextField("素材をさがす", text: $query)
                            .textFieldStyle(.roundedBorder)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                            ForEach(PartCatalog.shared.search(category: "", query: query), id: \.id.value) { part in
                                PartTile(part: part) {
                                    guard let target else { return }
                                    model.apply {
                                        $0.replaceRetiredMaterial(pageId: target.pageId, itemId: target.itemId, partId: part.id)
                                    }
                                    selectedKey = ""
                                }
                                .disabled(target == nil || model.isReadOnly)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("素材を置きかえる")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("とじる") { dismiss() } } }
        }
    }
}
