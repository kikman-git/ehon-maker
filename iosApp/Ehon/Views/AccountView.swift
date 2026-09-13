import SwiftUI
import AuthenticationServices

struct AccountView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var account = AccountSession.shared
    @ObservedObject private var repository = BookRepository.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if account.isSignedIn {
                        Text(Localized.s("settings.signedInAs", account.displayName)).font(.ehUI(17))
                        Label(status, systemImage: repository.hasPendingChanges ? "icloud.and.arrow.up" : "checkmark.icloud")
                            .font(.ehUI(14))
                        Text(Localized.s("sync.localCopy")).font(.ehUI(13)).foregroundStyle(Color.ehMuted)
                        Button(Localized.s("account.signOut")) {
                            // Persist before Firebase publishes the new identity.
                            repository.saveOpenBook()
                            account.signOut()
                        }.buttonStyle(.bordered)
                    } else {
                        Text(Localized.s("done.keepForever")).font(.ehUI(22, .black))
                        Text(Localized.s("done.keepForever.body")).font(.ehUI(15))
                        if CloudConfiguration.available {
                            SignInWithAppleButton(.continue, onRequest: account.prepareApple, onCompletion: account.finishApple)
                                .signInWithAppleButtonStyle(.black).frame(height: 50)
                            Button(Localized.s("account.google")) { Task { await account.google() } }
                                .font(.ehUI(16)).frame(maxWidth: .infinity).frame(height: 50)
                                .background(Color.ehSunken, in: RoundedRectangle(cornerRadius: 10))
                        } else { Text(Localized.s("account.cloudUnavailable")).font(.ehUI(14)) }
                        Text(Localized.s("account.localOnly")).font(.ehUI(13)).foregroundStyle(Color.ehMuted)
                    }
                    if let error = account.errorMessage { Text(error).font(.ehUI(13)).foregroundStyle(.red) }
                    if account.isBusy { ProgressView() }
                }
                .disabled(account.isBusy)
                .padding(24)
            }
            .background(Color.ehBg)
            .navigationTitle(Localized.s("settings.title"))
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(Localized.s("account.close")) { dismiss() } } }
        }
    }

    private var status: String {
        Localized.s(repository.syncError != nil ? "sync.retrying" : repository.hasPendingChanges ? "sync.pending" : "sync.saved")
    }
}

struct SignInCard: View {
    @ObservedObject private var account = AccountSession.shared
    @State private var showingAccount = false
    var body: some View {
        if !account.isSignedIn {
            Button { showingAccount = true } label: {
                HStack {
                    Image(systemName: "icloud.and.arrow.up")
                    Text(Localized.s("done.keepForever")).font(.ehUI(13))
                    Spacer()
                    Image(systemName: "chevron.right")
                }
                .padding(14).foregroundStyle(Color.ehAccentDeep)
                .background(Color.ehAccentTint, in: RoundedRectangle(cornerRadius: 16))
            }.buttonStyle(.plain).sheet(isPresented: $showingAccount) { AccountView() }
        }
    }
}

struct LeaseNotice: View {
    @EnvironmentObject private var app: AppModel
    @ObservedObject var model: EditorModel
    var body: some View {
        if model.isReadOnly {
            HStack {
                Label(Localized.s("sync.lease"), systemImage: "lock.fill").font(.ehUI(12))
                Spacer()
                Button(Localized.s("sync.read")) { app.openRead(model.book, page: model.pageIndex) }.font(.ehUI(12))
            }.padding(10).background(Color.ehAccentTint)
        }
    }
}
