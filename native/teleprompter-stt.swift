// Teleprompter Plus — on-device speech-to-text sidecar (macOS).
//
// Why this exists: the plugin's voice tracking ran on Vosk (a 40 MB offline model) whose
// accuracy is the limiting factor — it mis-hears, which makes the scroll lag/jump. Apple's
// Speech framework (SFSpeechRecognizer) does on-device recognition that is dramatically more
// accurate, the same engine purpose-built Mac teleprompters (e.g. Textream) use.
//
// This is a tiny long-running CLI: it captures the microphone, streams transcripts from
// SFSpeechRecognizer, and prints one JSON object per line to stdout. The Obsidian plugin
// spawns it with child_process (the same pattern Kokoro TTS already uses) and feeds the
// transcripts into the existing speech-matcher to scroll the teleprompter.
//
// Protocol (one JSON object per line on stdout):
//   {"type":"status","value":"authorizing|ready|listening|stopped"}
//   {"type":"partial","text":"..."}     // live, updates as you speak
//   {"type":"final","text":"..."}       // committed segment
//   {"type":"error","code":"...","message":"..."}
//
// Usage:  teleprompter-stt [locale]      e.g.  teleprompter-stt en-US   |   pt-BR
// Stop:   SIGINT / SIGTERM (clean exit).

import Foundation
import AVFoundation
import Speech

// Serialize stdout writes; flush each line so the parent sees events immediately.
let stdoutQueue = DispatchQueue(label: "teleprompter-stt.stdout")
func emit(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          var line = String(data: data, encoding: .utf8) else { return }
    line += "\n"
    stdoutQueue.sync {
        if let bytes = line.data(using: .utf8) {
            FileHandle.standardOutput.write(bytes)
        }
    }
}

let localeId = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "en-US"

// Optional contextual strings (the script's salient words) to bias recognition toward the words
// you're actually reading — Apple's `contextualStrings`, the same trick Textream uses to cut
// mis-hears of uncommon words. Passed as a newline-separated file path in argv[2].
var contextWords: [String] = []
if CommandLine.arguments.count > 2 {
    if let text = try? String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8) {
        contextWords = text.split(whereSeparator: { $0 == "\n" || $0 == "\r" })
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if contextWords.count > 100 { contextWords = Array(contextWords.prefix(100)) }
    }
}

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)) else {
    emit(["type": "error", "code": "no-recognizer", "message": "No speech recognizer for locale \(localeId)"])
    exit(1)
}

let audioEngine = AVAudioEngine()
var request: SFSpeechAudioBufferRecognitionRequest?
var task: SFSpeechRecognitionTask?
var restarting = false

func startRecognition() {
    task?.cancel()
    task = nil

    let req = SFSpeechAudioBufferRecognitionRequest()
    req.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition {
        req.requiresOnDeviceRecognition = true   // offline + private; no audio leaves the machine
    }
    if !contextWords.isEmpty {
        req.contextualStrings = contextWords   // bias toward the script's words
    }
    request = req

    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        req.append(buffer)
    }

    audioEngine.prepare()
    do {
        try audioEngine.start()
    } catch {
        emit(["type": "error", "code": "audio-start", "message": error.localizedDescription])
        exit(1)
    }
    restarting = false
    emit(["type": "status", "value": "listening"])

    task = recognizer.recognitionTask(with: req) { result, error in
        if let result = result {
            let text = result.bestTranscription.formattedString
            if result.isFinal {
                emit(["type": "final", "text": text])
                scheduleRestart()   // fresh segment for continuous dictation
            } else {
                emit(["type": "partial", "text": text])
            }
        }
        if let error = error {
            emit(["type": "error", "code": "recognition", "message": error.localizedDescription])
            scheduleRestart()
        }
    }
}

// SFSpeech finalizes/stops after a segment or on error; restart to stay continuous.
// Debounced so a burst of final+error can't spin a tight restart loop.
func scheduleRestart() {
    if restarting { return }
    restarting = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
        request?.endAudio()
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning { audioEngine.stop() }
        startRecognition()
    }
}

signal(SIGINT)  { _ in emit(["type": "status", "value": "stopped"]); exit(0) }
signal(SIGTERM) { _ in emit(["type": "status", "value": "stopped"]); exit(0) }

emit(["type": "status", "value": "authorizing"])
SFSpeechRecognizer.requestAuthorization { status in
    switch status {
    case .authorized:
        emit(["type": "status", "value": "ready"])
        DispatchQueue.main.async { startRecognition() }
    case .denied:
        emit(["type": "error", "code": "speech-denied", "message": "Speech Recognition permission denied (System Settings → Privacy → Speech Recognition)"])
        exit(1)
    case .restricted:
        emit(["type": "error", "code": "speech-restricted", "message": "Speech Recognition is restricted on this device"])
        exit(1)
    case .notDetermined:
        emit(["type": "error", "code": "speech-undetermined", "message": "Speech Recognition authorization not determined"])
        exit(1)
    @unknown default:
        emit(["type": "error", "code": "speech-unknown", "message": "Unknown authorization status"])
        exit(1)
    }
}

RunLoop.main.run()
