/**
 * Model Manager
 *
 * Handles downloading, caching, and loading Vosk speech recognition models.
 */

import type { App } from 'obsidian'
import type { VoiceLanguage, ModelDownloadProgress } from './types'
import { VOICE_LANGUAGES } from './types'

// Base URL for Vosk models
const VOSK_MODEL_BASE_URL = 'https://alphacephei.com/vosk/models'

/**
 * Model Manager class for handling Vosk model downloads and caching.
 */
export class ModelManager {
  private basePath: string
  private app: App
  private downloadProgress: ModelDownloadProgress = {
    downloading: false,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0
  }

  // Callbacks
  onProgressUpdate?: (progress: ModelDownloadProgress) => void
  onError?: (error: string) => void

  /**
   * Create a new ModelManager.
   *
   * @param basePath - Base path for storing models (plugin data folder)
   * @param app - Obsidian App instance for localStorage access
   */
  constructor(basePath: string, app: App) {
    this.basePath = basePath
    this.app = app
  }

  /**
   * Get the language configuration for a language code.
   */
  getLanguageConfig(languageCode: string): VoiceLanguage | undefined {
    return VOICE_LANGUAGES.find(lang => lang.code === languageCode)
  }

  /**
   * Get the path where a model should be stored.
   */
  getModelPath(languageCode: string): string {
    const config = this.getLanguageConfig(languageCode)
    if (!config) {
      throw new Error(`Unsupported language: ${languageCode}`)
    }
    return `${this.basePath}/models/${config.voskModel}`
  }

  /**
   * Get the download URL for a model.
   */
  getModelUrl(languageCode: string): string {
    const config = this.getLanguageConfig(languageCode)
    if (!config) {
      throw new Error(`Unsupported language: ${languageCode}`)
    }
    return `${VOSK_MODEL_BASE_URL}/${config.voskModel}.zip`
  }

  /**
   * Check if a model is downloaded and available.
   * Note: Uses Obsidian's localStorage API.
   */
  isModelDownloaded(languageCode: string): boolean {
    const config = this.getLanguageConfig(languageCode)
    if (!config) return false

    // Use Obsidian's localStorage API
    const key = `vosk-model-${config.voskModel}`
    return this.app.loadLocalStorage(key) === 'downloaded'
  }

  /**
   * Mark a model as downloaded.
   */
  markModelDownloaded(languageCode: string): void {
    const config = this.getLanguageConfig(languageCode)
    if (config) {
      const key = `vosk-model-${config.voskModel}`
      this.app.saveLocalStorage(key, 'downloaded')
    }
  }

  /**
   * Get the current download progress.
   */
  getProgress(): ModelDownloadProgress {
    return { ...this.downloadProgress }
  }

  /**
   * Download a model for the specified language.
   * vosk-browser handles model loading internally, so this primarily
   * tracks the download state for UI purposes.
   *
   * @param languageCode - Language code (e.g., 'en-US')
   * @returns Promise that resolves when download is complete
   */
  async downloadModel(languageCode: string): Promise<void> {
    const config = this.getLanguageConfig(languageCode)
    if (!config) {
      throw new Error(`Unsupported language: ${languageCode}`)
    }

    // Check if already downloaded
    if (await this.isModelDownloaded(languageCode)) {
      return
    }

    // Update progress state
    this.downloadProgress = {
      downloading: true,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: config.modelSizeMB * 1024 * 1024
    }
    this.onProgressUpdate?.(this.downloadProgress)

    try {
      // vosk-browser will download the model when createModel is called
      // This method is primarily for UI state management
      // The actual download happens in VoskRecognizer.initialize()

      // Simulate progress for UI (actual progress comes from vosk-browser)
      // In production, vosk-browser's createModel provides progress callbacks

      // Mark as downloaded (vosk-browser will cache it)
      this.markModelDownloaded(languageCode)

      this.downloadProgress = {
        downloading: false,
        progress: 100,
        downloadedBytes: config.modelSizeMB * 1024 * 1024,
        totalBytes: config.modelSizeMB * 1024 * 1024
      }
      this.onProgressUpdate?.(this.downloadProgress)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.downloadProgress = {
        ...this.downloadProgress,
        downloading: false,
        error: errorMessage
      }
      this.onProgressUpdate?.(this.downloadProgress)
      this.onError?.(errorMessage)
      throw error
    }
  }

  /**
   * Delete a downloaded model.
   */
  deleteModel(languageCode: string): void {
    const config = this.getLanguageConfig(languageCode)
    if (config) {
      const key = `vosk-model-${config.voskModel}`
      this.app.saveLocalStorage(key, null)
    }
  }

  /**
   * Get list of downloaded models.
   */
  getDownloadedModels(): VoiceLanguage[] {
    return VOICE_LANGUAGES.filter(lang => {
      const key = `vosk-model-${lang.voskModel}`
      return this.app.loadLocalStorage(key) === 'downloaded'
    })
  }
}

/**
 * Create a singleton ModelManager instance.
 */
let modelManagerInstance: ModelManager | null = null

export function getModelManager(basePath?: string, app?: App): ModelManager {
  if (!modelManagerInstance && basePath && app) {
    modelManagerInstance = new ModelManager(basePath, app)
  }
  if (!modelManagerInstance) {
    throw new Error('ModelManager not initialized. Call with basePath and app first.')
  }
  return modelManagerInstance
}
