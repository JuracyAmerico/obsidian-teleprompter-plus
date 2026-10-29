import { describe, expect, test } from 'bun:test'
import { isVoiceEngaged, nextVoiceUiState, voiceFailureText, VOICE_SETTINGS_PATH } from './voice-ui-state'

describe('voice UI state', () => {
	test('active on listening: only the listening status marks tracking active', () => {
		expect(nextVoiceUiState('listening').active).toBe(true)
		expect(nextVoiceUiState('initializing').active).toBe(false)
		expect(nextVoiceUiState('error').active).toBe(false)
		expect(nextVoiceUiState('off').active).toBe(false)
	})

	test('an in-flight start counts as engaged so the button stops it instead of starting twice', () => {
		expect(isVoiceEngaged(nextVoiceUiState('initializing'))).toBe(true)
		expect(isVoiceEngaged(nextVoiceUiState('listening'))).toBe(true)
		expect(isVoiceEngaged(nextVoiceUiState('error'))).toBe(false)
		expect(isVoiceEngaged(nextVoiceUiState('off'))).toBe(false)
	})

	test('failure text names the System Settings privacy path', () => {
		const text = voiceFailureText('The speech helper exited before it started listening (exit code 9).')
		expect(text).toContain('exit code 9')
		expect(text).toContain(VOICE_SETTINGS_PATH)
	})

	test('failure text does not repeat a path the message already carries', () => {
		const message = 'No answer. Open System Settings → Privacy & Security, allow Microphone.'
		expect(voiceFailureText(message)).toBe(message)
	})

	test('failure text never comes out empty', () => {
		expect(voiceFailureText('   ').length).toBeGreaterThan(0)
	})
})
