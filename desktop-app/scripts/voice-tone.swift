import Foundation
import AVFoundation
import SoundAnalysis

// Local-only, serial JSON-lines helper. No microphone access or network.
final class Observer: NSObject, SNResultsObserving {
    var laughter = 0.0
    var failed = false
    let done = DispatchSemaphore(value: 0)
    func request(_ request: SNRequest, didProduce result: SNResult) {
        guard let result = result as? SNClassificationResult else { return }
        for id in ["laughter", "belly_laugh", "giggling", "snicker", "chuckle_chortle"] {
            laughter = max(laughter, result.classification(forIdentifier: id)?.confidence ?? 0)
        }
    }
    func request(_ request: SNRequest, didFailWithError error: Error) { failed = true; done.signal() }
    func requestDidComplete(_ request: SNRequest) { done.signal() }
}

while let line = readLine() {
    autoreleasepool {
        var response: [String: Any] = ["confidence": 0.0]
        do {
            guard let json = line.data(using: .utf8),
                  let message = try JSONSerialization.jsonObject(with: json) as? [String: Any],
                  let id = message["id"] as? Int else { return }
            response["id"] = id
            guard let encoded = message["audio"] as? String,
                  let data = Data(base64Encoded: encoded), data.count >= 16000, data.count <= 1280000,
                  data.count % 4 == 0,
                  let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1),
                  let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(data.count / 4)) else {
                throw NSError(domain: "VocaLumeVoiceTone", code: 1)
            }
            buffer.frameLength = buffer.frameCapacity
            data.copyBytes(to: UnsafeMutableRawBufferPointer(start: buffer.floatChannelData![0], count: data.count))
            let analyzer = SNAudioStreamAnalyzer(format: format)
            let request = try SNClassifySoundRequest(classifierIdentifier: .version1)
            request.windowDuration = CMTime(seconds: 1.5, preferredTimescale: 16000)
            request.overlapFactor = 0.5
            let observer = Observer()
            try analyzer.add(request, withObserver: observer)
            analyzer.analyze(buffer, atAudioFramePosition: 0)
            analyzer.completeAnalysis()
            if observer.done.wait(timeout: .now() + 2) == .timedOut { observer.failed = true }
            response["confidence"] = observer.failed ? 0 : observer.laughter
        } catch { response["confidence"] = 0.0 }
        if let data = try? JSONSerialization.data(withJSONObject: response), let value = String(data: data, encoding: .utf8) {
            print(value)
            fflush(stdout)
        }
    }
}
