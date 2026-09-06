import SwiftUI

@main
struct EhonApp: App {
    // Only for the orientation mask; see OrientationLock.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
