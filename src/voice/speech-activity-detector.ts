/**
 * Speech Activity Detector (VAD)
 *
 * A lightweight, engine-agnostic voice-activity detector. It opens its OWN microphone
 * stream and watches energy in the 85–3400 Hz band — the human-voice band (telephone band):
 * fundamentals ~85–255 Hz, consonant/formant energy up to ~3400 Hz. HVAC hum, key clatter,
 * music, and notification chimes mostly fall outside that band, so they don't read as speech.
 *
 * Why it exists: the Apple sidecar path emits only TEXT (no WebAudio graph), so the tracker
 * can't tell "the reader paused and Apple is re-emitting a stale partial" from "the reader ran
 * ahead and Apple fell behind". Both look like no-forward-progress. This detector supplies the
 * missing signal: is a human speaking RIGHT NOW? The tracker consults it to freeze during real
 * silence (so a pause never triggers a spurious catch-up leap) and to only re-sync when speech
 * is genuinely active.
 *
 * FAIL-OPEN by contract: if the mic can't be opened (denied, no device, unsupported), every
 * query returns `true` (= "assume speaking"), so gating NEVER blocks tracking — worst case is
 * exactly today's behavior. It runs parallel to the Apple sidecar's own capture; on macOS
 * multiple processes/contexts can read the mic simultaneously.
 */

export class SpeechActivityDetector {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private freqData: Float32Array<ArrayBuffer> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null

  /** True once a mic graph is live. While false, isSpeechActive() fails OPEN (returns true). */
  private available = false
  /** Latest raw decision after hangover smoothing. */
  private speaking = true
  /** Adaptive quiet-floor estimate (dB), tracks the room's noise floor. */
  private noiseFloorDb = -100
  /** Timestamp (ms) of the last frame whose band energy cleared the speech threshold. */
  private lastSpeechMs = 0

  // --- Tuning ---
  private readonly BAND_LOW_HZ = 85
  private readonly BAND_HIGH_HZ = 3400
  /** dB above the adaptive noise floor that counts as speech. Higher = stricter. */
  private readonly MARGIN_DB = 10
  /** Keep "speaking" latched this long after energy drops, so trailing partials aren't clipped. */
  private readonly HANGOVER_MS = 350
  /** How fast the noise floor is allowed to drift UP per poll (dB). Snaps DOWN instantly. */
  private readonly FLOOR_RISE_DB = 0.5
  private readonly POLL_MS = 50

  static isSupported(): boolean {
    return (
      typeof AudioContext !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    )
  }

  /** Open the mic + analyser and begin polling. Resolves even on failure (fail-open). */
  async start(): Promise<void> {
    if (this.available) return
    if (!SpeechActivityDetector.isSupported()) {
      this.available = false
      return
    }
    try {
      // Raw signal for energy detection: turn OFF processing that would mask true band energy.
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.3
      // Explicit ArrayBuffer backing so the type is Float32Array<ArrayBuffer> (what getFloatFrequencyData wants).
      this.freqData = new Float32Array(new ArrayBuffer(this.analyser.frequencyBinCount * 4))
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.source.connect(this.analyser)
      // NOTE: analyser is intentionally NOT connected to destination — no playback, just analysis.

      this.noiseFloorDb = -100
      this.lastSpeechMs = 0
      this.speaking = true
      this.available = true
      this.pollTimer = setInterval(() => this.poll(), this.POLL_MS)
    } catch {
      // Denied / no device / blocked — fail open. Tracking proceeds as if no gate exists.
      this.cleanup()
      this.available = false
    }
  }

  /**
   * Is a human speaking right now? Fail-open: returns true whenever the detector is unavailable,
   * so a missing/denied mic can never freeze the tracker.
   */
  isSpeechActive(): boolean {
    return this.available ? this.speaking : true
  }

  /** Whether a live mic graph is actually running (for diagnostics). */
  getIsAvailable(): boolean {
    return this.available
  }

  private poll(): void {
    if (!this.analyser || !this.freqData || !this.audioContext) return
    this.analyser.getFloatFrequencyData(this.freqData)

    const nyquist = this.audioContext.sampleRate / 2
    const binHz = nyquist / this.freqData.length
    const loBin = Math.max(0, Math.floor(this.BAND_LOW_HZ / binHz))
    const hiBin = Math.min(this.freqData.length - 1, Math.ceil(this.BAND_HIGH_HZ / binHz))

    let sum = 0
    let n = 0
    for (let i = loBin; i <= hiBin; i++) {
      const v = this.freqData[i]
      if (Number.isFinite(v)) { sum += v; n++ }
    }
    if (n === 0) return
    const bandDb = sum / n

    // Track the quiet floor: snap down to any lower reading, drift up slowly otherwise.
    this.noiseFloorDb = bandDb < this.noiseFloorDb
      ? bandDb
      : Math.min(bandDb, this.noiseFloorDb + this.FLOOR_RISE_DB)

    const now = Date.now()
    if (bandDb > this.noiseFloorDb + this.MARGIN_DB) this.lastSpeechMs = now
    this.speaking = now - this.lastSpeechMs < this.HANGOVER_MS
  }

  stop(): void {
    this.cleanup()
    this.available = false
    this.speaking = true
  }

  dispose(): void {
    this.stop()
  }

  private cleanup(): void {
    if (this.pollTimer !== null) { clearInterval(this.pollTimer); this.pollTimer = null }
    try { this.source?.disconnect() } catch { /* ignore */ }
    try { this.mediaStream?.getTracks().forEach(t => t.stop()) } catch { /* ignore */ }
    try { void this.audioContext?.close() } catch { /* ignore */ }
    this.source = null
    this.analyser = null
    this.freqData = null
    this.mediaStream = null
    this.audioContext = null
  }
}
