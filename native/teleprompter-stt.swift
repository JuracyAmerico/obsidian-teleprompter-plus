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
//   authorizing carries "prompt":true when macOS will show a dialog the user must answer.
//   error codes: no-recognizer, speech-denied|restricted|undetermined, mic-denied|restricted,
//   auth-timeout (a permission request got no answer; the helper then exits 1), audio-start, recognition.
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

// Scripts and rehearsals stay on this machine. Without on-device support the Speech framework
// would send the audio to Apple's servers, so refuse and let the plugin use its offline engine.
guard recognizer.supportsOnDeviceRecognition else {
    emit(["type": "error", "code": "no-on-device", "message": "On-device recognition is not available for \(localeId)"])
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
    req.requiresOnDeviceRecognition = true   // offline + private; no audio leaves the machine
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
    emit(["type": "status", "value": "listening", "onDevice": true])

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

// Permission requests can hang with no callback (observed 2026-07-12: an auth hang in the
// disclaimed launcher context), and a hung request used to leave the plugin waiting forever. Every
// request is therefore bounded by a watchdog that reports "auth-timeout" and exits non-zero.
// When macOS will show a dialog the user has to answer (status .notDetermined) the bound is long;
// otherwise the answer is immediate and a short bound catches the hang.
let promptWatchdogSeconds = 90.0
let silentWatchdogSeconds = 10.0
var watchdog: DispatchWorkItem?

func armWatchdog(prompt: Bool, what: String) {
    watchdog?.cancel()
    let item = DispatchWorkItem {
        emit(["type": "error", "code": "auth-timeout",
              "message": "\(what) permission request got no answer from macOS"])
        exit(1)
    }
    watchdog = item
    DispatchQueue.main.asyncAfter(deadline: .now() + (prompt ? promptWatchdogSeconds : silentWatchdogSeconds), execute: item)
}

func disarmWatchdog() {
    watchdog?.cancel()
    watchdog = nil
}

// Microphone access is requested explicitly. Leaving it to audioEngine.start() meant a denial
// surfaced as silence (or a kill) instead of a message.
func requestMicrophoneThenListen() {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
        DispatchQueue.main.async { startRecognition() }
    case .denied:
        emit(["type": "error", "code": "mic-denied", "message": "Microphone permission denied (System Settings → Privacy & Security → Microphone)"])
        exit(1)
    case .restricted:
        emit(["type": "error", "code": "mic-restricted", "message": "Microphone access is restricted on this device"])
        exit(1)
    case .notDetermined:
        emit(["type": "status", "value": "authorizing", "prompt": true])
        armWatchdog(prompt: true, what: "Microphone")
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            disarmWatchdog()
            if granted {
                DispatchQueue.main.async { startRecognition() }
            } else {
                emit(["type": "error", "code": "mic-denied", "message": "Microphone permission denied (System Settings → Privacy & Security → Microphone)"])
                exit(1)
            }
        }
    @unknown default:
        emit(["type": "error", "code": "mic-denied", "message": "Unknown microphone authorization status"])
        exit(1)
    }
}

let speechNeedsPrompt = SFSpeechRecognizer.authorizationStatus() == .notDetermined
emit(["type": "status", "value": "authorizing", "prompt": speechNeedsPrompt])
armWatchdog(prompt: speechNeedsPrompt, what: "Speech Recognition")
SFSpeechRecognizer.requestAuthorization { status in
    disarmWatchdog()
    switch status {
    case .authorized:
        emit(["type": "status", "value": "ready"])
        requestMicrophoneThenListen()
    case .denied:
        emit(["type": "error", "code": "speech-denied", "message": "Speech Recognition permission denied (System Settings → Privacy & Security → Speech Recognition)"])
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
