import SwiftUI
import EhonCore

/// かぞくに おくる — pick who gets the book and what travels with it. Model 2a.
///
/// v1 has no backend, so "send" produces the `.ehon` archive (plus the PDF when asked) and
/// hands it to the system share sheet — LINE, Mail, AirDrop. The recipient picker and the
/// voice toggle are the real UI the link-based send will sit behind; only the transport
/// is a stand-in.
struct ShareView: View {
    @EnvironmentObject var app: AppModel
    let book: Book

    @State private var chosen: Set<String> = ["grandma", "grandpa"]
    @State private var withVoice = true
    @State private var withPrintFile = false
    @State private var sent = false
    @State private var busy = false
    @State private var share: [URL]?
    @State private var toast: String?

    var body: some View {
        VStack(spacing: 0) {
            header
            if sent { sentBody } else { form }
        }
        .background(Color.ehBg)
        .overlay(alignment: .bottom) {
            if let toast { ToastView(text: toast).padding(.bottom, 40) }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .sheet(item: Binding(
            get: { share.map { ShareItems(urls: $0) } },
            set: { share = $0?.urls }
        )) { items in
            ShareSheet(items: items.urls)
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            CircleIconButton(systemName: "arrow.left") { app.openDone(book) }
            Text(Localized.s("share.title"))
                .font(.ehUI(22, .black))
                .foregroundStyle(Color.ehText)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    // MARK: - form

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                section(Localized.s("share.who"), hint: Localized.s("share.whoHint")) {
                    LazyVGrid(columns: [GridItem(spacing: 10), GridItem(spacing: 10)], spacing: 10) {
                        ForEach(FamilyMember.all) { member in
                            memberTile(member)
                        }
                    }
                }

                section(Localized.s("share.include"), hint: nil) {
                    VStack(spacing: 8) {
                        toggleRow(Localized.s("share.voice"), sub: Localized.s("share.voiceHint"),
                                  systemName: "mic.fill", on: $withVoice)
                        toggleRow(Localized.s("share.printFile"), sub: Localized.s("share.printFileHint"),
                                  systemName: "printer.fill", on: $withPrintFile)
                    }
                }

                if app.uiLevel == .adult {
                    Text(Localized.s("share.adultNote"))
                        .font(.ehUI(11.5, .medium))
                        .foregroundStyle(Color.ehMuted)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)
                }

                PillButton(
                    title: chosen.isEmpty
                        ? Localized.s("share.send")
                        : Localized.s("share.sendCount", chosen.count),
                    filled: true, big: true
                ) { send() }
                .disabled(busy)
                .overlay { if busy { ProgressView().tint(Color.ehSurface) } }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 40)
        }
    }

    private func memberTile(_ member: FamilyMember) -> some View {
        let on = chosen.contains(member.id)
        return Button {
            if on { chosen.remove(member.id) } else { chosen.insert(member.id) }
        } label: {
            HStack(spacing: 12) {
                Text(member.initial)
                    .font(.ehUI(17))
                    .foregroundStyle(member.ink)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(member.tint))
                VStack(alignment: .leading, spacing: 2) {
                    Text(member.name).font(.ehUI(15)).foregroundStyle(Color.ehText)
                    Text(member.sub).font(.ehUI(11, .medium)).foregroundStyle(Color.ehMuted)
                }
                Spacer(minLength: 0)
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(on ? Color.ehAccent : Color.ehEdge)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 20).fill(Color.ehSurface))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(on ? Color.ehAccent : .clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
    }

    private func toggleRow(_ title: String, sub: String, systemName: String, on: Binding<Bool>) -> some View {
        Button { on.wrappedValue.toggle() } label: {
            HStack(spacing: 12) {
                Image(systemName: systemName)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(on.wrappedValue ? Color.ehSurface : .ehMuted)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(on.wrappedValue ? Color.ehAccent : Color.ehSunken))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.ehUI(14.5)).foregroundStyle(Color.ehText)
                    Text(sub).font(.ehUI(11, .medium)).foregroundStyle(Color.ehMuted)
                }
                Spacer(minLength: 0)
                Toggle("", isOn: on).labelsHidden().tint(Color.ehAccent)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 20).fill(Color.ehSurface))
        }
        .buttonStyle(.plain)
    }

    private func section<Content: View>(_ title: String, hint: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.ehUI(15, .black)).foregroundStyle(Color.ehText)
            if let hint {
                Text(hint).font(.ehUI(12, .medium)).foregroundStyle(Color.ehMuted)
            }
            content()
        }
    }

    // MARK: - sent

    private var sentBody: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "paperplane.fill")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(Color.ehSurface)
                .frame(width: 84, height: 84)
                .background(Circle().fill(Color.ehAccent))
                .padding(.bottom, 8)
            Text(Localized.s("share.sent")).font(.ehUI(26, .black)).foregroundStyle(Color.ehText)
            Text(Localized.s("share.sentHint")).font(.ehUI(13, .medium)).foregroundStyle(Color.ehMuted)
            HStack(spacing: -8) {
                ForEach(FamilyMember.all.filter { chosen.contains($0.id) }) { m in
                    Text(m.initial).font(.ehUI(14)).foregroundStyle(m.ink)
                        .frame(width: 40, height: 40).background(Circle().fill(m.tint))
                        .overlay(Circle().strokeBorder(Color.ehBg, lineWidth: 2))
                }
            }
            .padding(.top, 6)
            Spacer()
            PillButton(title: Localized.s("share.readMyself"), filled: true, big: true) {
                app.openRead(book)
            }
            Button {
                app.markFinished(book)
                app.openShelf()
            } label: {
                Text(Localized.s("share.backToShelf"))
                    .font(.ehUI(14)).foregroundStyle(Color.ehMuted).frame(height: 52)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 22)
        .padding(.bottom, 24)
    }

    // MARK: - send

    private func send() {
        guard !chosen.isEmpty else { show(Localized.s("share.pickSomeone")); return }
        busy = true
        Task {
            var urls: [URL] = []
            if let archive = LocalBookStore.shared.exportArchive(book) { urls.append(archive) }
            if withPrintFile {
                let pdf = SceneRenderer.printablePdf(for: book)
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("\(book.title.isEmpty ? "ehon" : book.title).pdf")
                if (try? pdf.write(to: url)) != nil { urls.append(url) }
            }
            busy = false
            if urls.isEmpty { show(Localized.s("read.cannotSpeak")); return }
            share = urls
            sent = true
        }
    }

    private func show(_ text: String) {
        toast = text
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1700))
            if toast == text { toast = nil }
        }
    }

    private struct ShareItems: Identifiable {
        let urls: [URL]
        var id: String { urls.map(\.absoluteString).joined() }
    }
}
