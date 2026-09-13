import SwiftUI
import EhonCore

/// かぞくに おくる — pick who gets the book and what travels with it. Model 2a.
///
/// With an account, each chosen person gets their own read-only web link (decision 41), so
/// any one of them can be stopped later. The `.ehon` archive (and the PDF when asked) still
/// rides along in the system share sheet for family who have the app.
struct ShareView: View {
    @EnvironmentObject var app: AppModel
    @ObservedObject private var account = AccountSession.shared
    @ObservedObject private var repository = BookRepository.shared
    @StateObject private var links = ShareLinks()
    let book: Book

    @State private var chosen: Set<String> = ["grandma", "grandpa"]
    @State private var withVoice = true
    @State private var withPrintFile = false
    @State private var sent = false
    @State private var busy = false
    @State private var share: ShareItems?
    @State private var toast: String?

    private var canLink: Bool { ShareLinks.available && !repository.hasPendingChanges }

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
        .sheet(item: $share) { items in ShareSheet(items: items.items) }
        .onAppear { links.watch(bookId: book.id.value) }
        .onDisappear { links.stop() }
        .onChange(of: account.isSignedIn) { _, _ in links.watch(bookId: book.id.value) }
        .onChange(of: links.error) { _, error in if let error { show(error); links.error = nil } }
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

                section(Localized.s("share.link"), hint: Localized.s("share.linkHint")) { linkSection }

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
                .disabled(busy || links.busy)
                .overlay { if busy { ProgressView().tint(Color.ehSurface) } }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 40)
        }
    }

    @ViewBuilder private var linkSection: some View {
        if !CloudConfiguration.available || CloudConfiguration.webURL == nil {
            Text(Localized.s("account.cloudUnavailable")).font(.ehUI(12.5, .medium)).foregroundStyle(Color.ehMuted)
        } else if !account.isSignedIn {
            SignInCard()
            Text(Localized.s("share.linkSignIn")).font(.ehUI(12.5, .medium)).foregroundStyle(Color.ehMuted)
        } else if repository.hasPendingChanges {
            Label(Localized.s("share.linkPending"), systemImage: "icloud.and.arrow.up")
                .font(.ehUI(12.5, .medium)).foregroundStyle(Color.ehMuted)
        } else if links.links.isEmpty {
            Text(Localized.s("share.linkNone")).font(.ehUI(12.5, .medium)).foregroundStyle(Color.ehMuted)
        } else {
            VStack(spacing: 6) {
                ForEach(links.links) { link in
                    HStack(spacing: 10) {
                        Image(systemName: "link").foregroundStyle(Color.ehAccent)
                        Text(Localized.s("share.linkFor", link.label.isEmpty ? "—" : link.label))
                            .font(.ehUI(13.5)).foregroundStyle(Color.ehText).lineLimit(1)
                        Spacer(minLength: 4)
                        if let url = link.url {
                            ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                                .font(.ehUI(13)).foregroundStyle(Color.ehAccentDeep)
                        }
                        Button(Localized.s("share.linkRevoke")) { Task { await links.revoke(link) } }
                            .font(.ehUI(12.5)).foregroundStyle(Color.ehMuted)
                            .disabled(links.busy)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Color.ehSurface))
                }
            }
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
        let recipients = FamilyMember.all.filter { chosen.contains($0.id) }
        Task {
            var items: [Any] = []
            if canLink {
                for member in recipients {
                    do { items.append(try await links.create(bookId: book.id.value, label: member.name)) }
                    catch { show(Localized.s("share.linkFailed")); break }
                }
                if !items.isEmpty { items.insert(Localized.s("share.linkOpens", book.title), at: 0) }
            }
            if let archive = LocalBookStore.shared.exportArchive(book) { items.append(archive) }
            if withPrintFile {
                await AssetLoader.shared.prepare(book, master: true)
                let pdf = SceneRenderer.printablePdf(for: book)
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("\(book.title.isEmpty ? "ehon" : book.title).pdf")
                if (try? pdf.write(to: url)) != nil { items.append(url) }
            }
            busy = false
            if items.isEmpty { show(Localized.s("read.cannotSpeak")); return }
            share = ShareItems(items: items)
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
        let id = UUID()
        let items: [Any]
    }
}
