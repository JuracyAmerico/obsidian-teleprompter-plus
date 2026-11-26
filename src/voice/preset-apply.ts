/**
 * Applying a voice pace preset.
 *
 * The matcher reads its tuning from the service config on every recognition result, so a preset
 * takes effect by updating that config in place. It must NOT stop and restart the recognizer:
 * a restart respawns the speech helper (re-entering the permission-hang window) and resets the
 * reader's position to the top of the script.
 */

import type { VoiceTrackingConfig } from './types'
import {
  VOICE_TRACKING_PRESETS,
  type VoiceTrackingPacePreset,
  type VoiceTrackingPresetConfig,
} from '../settings'

export type ConcretePreset = Exclude<VoiceTrackingPacePreset, 'custom'>

/** The preset fields the service reads. A preset's jump and animation fields are read by nothing. */
export type PresetTuning = Pick<VoiceTrackingConfig, 'confidenceThreshold' | 'windowSize' | 'updateFrequencyMs'>

/** The service-config fields a preset controls. */
export function presetToTuning(preset: VoiceTrackingPresetConfig): PresetTuning {
  return {
    confidenceThreshold: preset.confidenceThreshold,
    windowSize: preset.windowSize,
    updateFrequencyMs: preset.updateFrequencyMs,
  }
}

/** Push a preset's tuning into a live voice service without touching the recognizer. */
export function applyPresetLive(
  service: { updateConfig(config: Partial<VoiceTrackingConfig>): void } | null | undefined,
  presetName: ConcretePreset,
): void {
  const preset = VOICE_TRACKING_PRESETS[presetName]
  if (!preset || !service) return
  service.updateConfig(presetToTuning(preset))
}
