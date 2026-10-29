/**
 * What the teleprompter UI believes about voice tracking, derived from what the speech engine
 * actually reports. "Active" used to be set the moment start() returned, which is before the
 * microphone is open, so a helper that never came up still showed "Voice Active".
 */

export type VoiceUiStatus = 'off' | 'initializing' | 'listening' | 'error'

export interface VoiceUiState {
  /** True only while the engine reports it is listening. */
  active: boolean
  status: VoiceUiStatus
}

export const VOICE_SETTINGS_PATH =
  'System Settings → Privacy & Security → Microphone and Speech Recognition'

export function nextVoiceUiState(status: VoiceUiStatus): VoiceUiState {
  return { active: status === 'listening', status }
}

/** A start is in flight or running: pressing the mic button should stop it, not start another. */
export function isVoiceEngaged(state: VoiceUiState): boolean {
  return state.active || state.status === 'initializing'
}

/** The text of the persistent notice shown when voice tracking cannot start or dies. */
export function voiceFailureText(message: string): string {
  const base = message.trim() || 'Voice tracking could not start.'
  if (base.includes('Privacy & Security')) return base
  return `${base} If a permission is missing, open ${VOICE_SETTINGS_PATH}, allow Teleprompter Plus (or Obsidian), then retry.`
}
