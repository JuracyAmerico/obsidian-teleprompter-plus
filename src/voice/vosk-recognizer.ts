/**
 * Vosk Recognizer
 *
 * Wrapper around vosk-browser for speech recognition.
 * Handles microphone access, audio processing, and recognition events.
 */

import type { VoiceTrackingStatus, VoiceTrackingError } from './types'
import { VOICE_LANGUAGES } from './types'
import { requestUrl } from 'obsidian'

// Import types from vosk-browser
import type { Model, KaldiRecognizer } from 'vosk-browser'

/**
 * Subscriber function type for recognition results.
 */
type ResultSubscriber = (text: string, isFinal: boolean) => void
type StatusSubscriber = (status: VoiceTrackingStatus) => void
type ErrorSubscriber = (error: VoiceTrackingError, message: string) => void
type ProgressSubscriber = (loaded: number, total: number) => void

/**
 * VoskRecognizer class - wraps vosk-browser for speech recognition.
 */
export class VoskRecognizer {
  private model: Model | null = null
  private recognizer: KaldiRecognizer | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  private language: string = 'en-US'
  private isListening: boolean = false
  private isInitialized: boolean = false

  // Subscribers
  private resultSubscribers: ResultSubscriber[] = []
  private statusSubscribers: StatusSubscriber[] = []
  private errorSubscribers: ErrorSubscriber[] = []
  private progressSubscribers: ProgressSubscriber[] = []

  /**
   * Check if vosk-browser is supported in this environment.
   */
  static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof WebAssembly !== 'undefined' &&
      typeof AudioContext !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia !== 'undefined'
    )
  }

  /**
   * Initialize the Vosk recognizer with a language model.
   *
   * @param language - Language code (e.g., 'en-US')
   */
  async initialize(language: string = 'en-US'): Promise<void> {
    if (!VoskRecognizer.isSupported()) {
      this.emitError('browser-not-supported', 'Voice recognition is not supported in this browser')
      throw new Error('Voice recognition not supported')
    }

    this.language = language
    this.emitStatus('initializing')

    const langConfig = VOICE_LANGUAGES.find(l => l.code === language)
    if (!langConfig) {
      this.emitError('model-not-found', `Language ${language} is not supported`)
      throw new Error(`Language ${language} not supported`)
    }

    try {
      // Dynamically import vosk-browser
      const vosk = await import('vosk-browser')

      // Download model using Obsidian's requestUrl to bypass CORS
      const modelUrl = `https://alphacephei.com/vosk/models/${langConfig.voskModel}.zip`

      // Check if model is cached in IndexedDB
      const cachedBlobUrl = await this.getCachedModel(langConfig.voskModel)
      let blobUrl: string

      if (cachedBlobUrl) {
        blobUrl = cachedBlobUrl
        this.emitProgress(100, 100)
      } else {
        // Download using Obsidian's requestUrl (bypasses CORS)
        this.emitProgress(0, 100)

        const response = await requestUrl({
          url: modelUrl,
          method: 'GET',
        })

        // Convert to blob and create URL
        const blob = new Blob([response.arrayBuffer], { type: 'application/zip' })
        blobUrl = URL.createObjectURL(blob)

        // Cache the model
        await this.cacheModel(langConfig.voskModel, response.arrayBuffer)
        this.emitProgress(100, 100)
      }

      // Create model from blob URL - second parameter is log level (0 = quiet)
      this.model = await vosk.createModel(blobUrl, 0)

      // Wait for model to be ready
      // The model emits a 'load' event when ready
      await new Promise<void>((resolve, reject) => {
        if (!this.model) {
          reject(new Error('Model not created'))
          return
        }

        // Check if already ready
        if (this.model.ready) {
          resolve()
          return
        }

        // Wait for load event
        this.model.on('load', (message) => {
          if (message.event === 'load' && message.result) {
            resolve()
          } else {
            reject(new Error('Failed to load model'))
          }
        })

        // Also listen for errors
        this.model.on('error', (message) => {
          const errorMsg = 'error' in message ? (message as any).error : 'Model loading error'
          reject(new Error(errorMsg))
        })
      })

      // Create recognizer with sample rate (browser audio is typically 48000Hz)
      // KaldiRecognizer is accessed as a property on the model instance
      const sampleRate = 48000
      this.recognizer = new this.model.KaldiRecognizer(sampleRate)

      // Set up result handlers
      this.recognizer.on('result', (message) => {
        if (message.event === 'result' && message.result) {
          const text = message.result.text
          if (text && text.trim()) {
            this.emitResult(text, true)
          }
        }
      })

      this.recognizer.on('partialresult', (message) => {
        if (message.event === 'partialresult' && message.result) {
          const partial = message.result.partial
          if (partial && partial.trim()) {
            this.emitResult(partial, false)
          }
        }
      })

      this.isInitialized = true

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize'
      this.emitError('model-download-failed', message)
      this.emitStatus('error')
      throw error
    }
  }

  /**
   * Start listening for speech.
   */
  async start(): Promise<void> {
    if (!this.isInitialized || !this.recognizer) {
      throw new Error('Recognizer not initialized. Call initialize() first.')
    }

    if (this.isListening) {
      return
    }

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // Create audio context with 48kHz sample rate
      this.audioContext = new AudioContext({ sampleRate: 48000 })

      // Create source from microphone
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream)

      // Create script processor for audio processing
      // Note: ScriptProcessorNode is deprecated but still widely supported
      // AudioWorklet would be better but requires more setup
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)

      // Process audio data
      this.processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (this.recognizer && this.isListening) {
          const audioData = event.inputBuffer.getChannelData(0)
          // Use acceptWaveformFloat for Float32Array data
          this.recognizer.acceptWaveformFloat(audioData, this.audioContext!.sampleRate)
        }
      }

      // Connect the audio graph
      this.source.connect(this.processor)
      this.processor.connect(this.audioContext.destination)

      this.isListening = true
      this.emitStatus('listening')

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microphone access failed'

      if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
        this.emitError('microphone-denied', 'Microphone access was denied')
      } else if (message.includes('NotFoundError')) {
        this.emitError('microphone-not-found', 'No microphone found')
      } else {
        this.emitError('recognition-failed', message)
      }

      this.emitStatus('error')
      throw error
    }
  }

  /**
   * Stop listening for speech.
   */
  stop(): void {
    this.isListening = false

    // Get final result before stopping
    if (this.recognizer) {
      this.recognizer.retrieveFinalResult()
    }

    // Disconnect audio processing
    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }

    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.emitStatus('off')
  }

  /**
   * Check if currently listening.
   */
  getIsListening(): boolean {
    return this.isListening
  }

  /**
   * Check if initialized.
   */
  getIsInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * Get current language.
   */
  getLanguage(): string {
    return this.language
  }

  /**
   * Subscribe to recognition results.
   */
  onResult(callback: ResultSubscriber): void {
    this.resultSubscribers.push(callback)
  }

  /**
   * Subscribe to status changes.
   */
  onStatus(callback: StatusSubscriber): void {
    this.statusSubscribers.push(callback)
  }

  /**
   * Subscribe to errors.
   */
  onError(callback: ErrorSubscriber): void {
    this.errorSubscribers.push(callback)
  }

  /**
   * Subscribe to download progress.
   */
  onProgress(callback: ProgressSubscriber): void {
    this.progressSubscribers.push(callback)
  }

  /**
   * Remove all subscribers.
   */
  clearSubscribers(): void {
    this.resultSubscribers = []
    this.statusSubscribers = []
    this.errorSubscribers = []
    this.progressSubscribers = []
  }

  /**
   * Emit a recognition result to subscribers.
   */
  private emitResult(text: string, isFinal: boolean): void {
    for (const subscriber of this.resultSubscribers) {
      subscriber(text, isFinal)
    }
  }

  /**
   * Emit a status change to subscribers.
   */
  private emitStatus(status: VoiceTrackingStatus): void {
    for (const subscriber of this.statusSubscribers) {
      subscriber(status)
    }
  }

  /**
   * Emit an error to subscribers.
   */
  private emitError(error: VoiceTrackingError, message: string): void {
    for (const subscriber of this.errorSubscribers) {
      subscriber(error, message)
    }
  }

  /**
   * Emit download progress to subscribers.
   */
  private emitProgress(loaded: number, total: number): void {
    for (const subscriber of this.progressSubscribers) {
      subscriber(loaded, total)
    }
  }

  /**
   * Get cached model from IndexedDB.
   */
  private async getCachedModel(modelName: string): Promise<string | null> {
    try {
      const db = await this.openModelDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['models'], 'readonly')
        const store = transaction.objectStore('models')
        const request = store.get(modelName)

        request.onsuccess = () => {
          if (request.result) {
            const blob = new Blob([request.result.data], { type: 'application/zip' })
            resolve(URL.createObjectURL(blob))
          } else {
            resolve(null)
          }
        }
        request.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  /**
   * Cache model in IndexedDB.
   */
  private async cacheModel(modelName: string, data: ArrayBuffer): Promise<void> {
    try {
      const db = await this.openModelDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['models'], 'readwrite')
        const store = transaction.objectStore('models')
        store.put({ name: modelName, data, timestamp: Date.now() })

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
    } catch (error) {
      console.warn('Failed to cache model:', error)
    }
  }

  /**
   * Open IndexedDB for model storage.
   */
  private openModelDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('teleprompter-vosk-models', 1)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'name' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stop()
    this.clearSubscribers()

    // Remove recognizer
    if (this.recognizer) {
      this.recognizer.remove()
      this.recognizer = null
    }

    // Terminate model
    if (this.model) {
      this.model.terminate()
      this.model = null
    }

    this.isInitialized = false
  }
}
