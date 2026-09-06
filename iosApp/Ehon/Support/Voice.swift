import AVFoundation
import EhonCore

/// Records a family member's voice for one page (model 3b) and plays it back.
///
/// v1 keeps the audio on this device under Application Support/Replies. The `PageReply`
/// in the document carries only the file id, so a book stays small (decision #14) and the
/// transport can move to Firestore Storage later without touching the model.
@MainActor
final class VoiceRecorder: NSObject, ObservableObject {
    static let shared = VoiceRecorder()

    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: Double = 0

    private var recorder: AVAudioRecorder?
    private var startedAt: Date?
    private var ticker: Task<Void, Never>?
    private let directory: URL

    /// Below this a hold reads as a mis-tap: 「もう すこし ながく おしてね」.
    static let minimumSeconds = 0.5

    private override init() {
        directory = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Replies", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        super.init()
    }

    static func url(for ref: String) -> URL {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Replies", isDirectory: true)
            .appendingPathComponent(ref)
    }

    func requestPermission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    /// Starts writing `<ref>.m4a`. Returns false when the mic is unavailable.
    func start(ref: String) -> Bool {
        stopTicker()
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let r = try AVAudioRecorder(url: directory.appendingPathComponent(ref), settings: [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 22_050,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
            ])
            guard r.record() else { return false }
            recorder = r
        } catch {
            return false
        }
        startedAt = Date()
        elapsed = 0
        isRecording = true
        ticker = Task { @MainActor in
            while !Task.isCancelled, let started = startedAt {
                elapsed = Date().timeIntervalSince(started)
                try? await Task.sleep(for: .milliseconds(90))
            }
        }
        return true
    }

    /// Stops and returns the duration; the caller decides whether it was long enough.
    func stop() -> Double {
        stopTicker()
        let seconds = startedAt.map { Date().timeIntervalSince($0) } ?? 0
        recorder?.stop()
        recorder = nil
        startedAt = nil
        isRecording = false
        return seconds
    }

    func discard(ref: String) {
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(ref))
    }

    private func stopTicker() {
        ticker?.cancel()
        ticker = nil
    }
}

/// Plays a `PageReply`'s audio. One at a time, like the book it belongs to.
@MainActor
final class ReplyPlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {
    static let shared = ReplyPlayer()

    @Published private(set) var isPlaying = false
    private var player: AVAudioPlayer?
    private var onFinish: (() -> Void)?

    func play(_ reply: PageReply, onFinish: (() -> Void)? = nil) -> Bool {
        stop()
        guard let ref = reply.audioRef,
              let p = try? AVAudioPlayer(contentsOf: VoiceRecorder.url(for: ref)) else { return false }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        p.delegate = self
        self.onFinish = onFinish
        player = p
        isPlaying = p.play()
        return isPlaying
    }

    func stop() {
        onFinish = nil
        player?.stop()
        player = nil
        isPlaying = false
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlaying = false
            let done = self.onFinish
            self.onFinish = nil
            done?()
        }
    }
}
