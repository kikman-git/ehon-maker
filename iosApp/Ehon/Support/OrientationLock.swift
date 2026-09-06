import UIKit

/// Per-screen orientation lock — iPhone only.
///
/// iOS asks the app delegate which orientations are allowed; we answer with whatever the
/// current screen wants and ask the scene to rotate right away, so よむ turns the interface
/// landscape even while the phone is held upright.
///
/// The iPad is deliberately left free: iPadOS 26 honours an orientation the device is not
/// in by moving the app into a floating window, which is worse than no lock. There, reading
/// simply shows the spread in whichever orientation the iPad is held.
@MainActor
enum OrientationLock {
    static var mask: UIInterfaceOrientationMask =
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait

    /// What a screen gets when it asks for nothing in particular.
    static var free: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }

    static func set(_ newMask: UIInterfaceOrientationMask) {
        guard UIDevice.current.userInterfaceIdiom != .pad, mask != newMask else { return }
        mask = newMask
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows {
                window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
            }
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: newMask))
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        OrientationLock.mask
    }
}
