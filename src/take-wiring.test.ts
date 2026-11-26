import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { obsidianStub } from './test-support/obsidian-stub'
import { commandHandlerSource } from './test-support/command-handler-source'
import { LISTENED_COMMAND_EVENTS, parseCommand } from './commands'

void mock.module('obsidian', () => obsidianStub)

/**
 * Takes, section targets and words per minute are tested as behaviour in takes.test.ts,
 * take-log.test.ts, take-store.test.ts, reading-rate.test.ts and parser/section-targets.test.ts.
 * TeleprompterApp.svelte cannot be mounted under bun, so these source guards fail if the component
 * stops routing through those modules; the setting is checked through the real defaults and validator.
 */
const read = (file: string): string => readFileSync(join(import.meta.dir, file), 'utf8')
const app = read('TeleprompterApp.svelte')
const remote = read('remote-interface.ts')

function functionBody(name: string): string {
	const start = app.search(new RegExp(`\\n {2}(async )?function ${name}\\(`))
	expect(start).toBeGreaterThan(-1)
	const rest = app.slice(start + 1)
	const end = rest.search(/\n {2}(async )?function /)
	return end === -1 ? rest : rest.slice(0, end)
}

describe('section targets never render', () => {
	test('the render pipeline strips heading targets before marked parses the note', () => {
		const strip = app.indexOf('processedContent = stripHeadingTargets(processedContent)')
		expect(strip).toBeGreaterThan(-1)
		expect(strip).toBeLessThan(app.indexOf('const parsed = md.parse(processedContent) as string'))
	})

	test('targets are matched to rendered headings by title, through the parser module', () => {
		expect(app).toContain('assignSectionTargets(headersList.map(h => h.text), parseSectionTargets(content))')
	})

	test('the word count does not count the targets as words', () => {
		expect(functionBody('updateWordCount')).toContain('countWords(stripHeadingTargets(content))')
	})
})

describe('a take runs with the scroll', () => {
	test('every play start begins (or resumes) the take; every frame steps it with the stop mode', () => {
		expect(app).toContain('takeTracker.begin(takeFrame(area))')
		expect(app).toContain("const crossed = takeTracker.step(takeFrame(area), plugin.settings.sectionStopMode ?? 'targeted')")
		expect(app).toContain('if (crossed && endSectionTake(crossed)) return')
	})

	test('a section end that stops pauses through stopPlayback, so the clock freezes, and shows the card', () => {
		const end = functionBody('endSectionTake')
		expect(end).toContain("stopPlayback('section end')")
		expect(end).toContain('showTake(takeCard(end.result))')
		expect(end).toContain('keepTakes([end.result])')
	})

	test('the end of the script closes the take: whole script or last section, logged and shown', () => {
		const finish = functionBody('finishPlayback')
		expect(finish).toContain('finishSession()')
		expect(finish).toContain('closeScriptTake(crossed)')
		const close = functionBody('closeScriptTake')
		expect(close).toContain('if (crossed) keepTakes([crossed.result])')
		expect(close).toContain('takeTracker.finish(takeFrame(contentArea), targetSeconds)')
		expect(close).toContain('keepTakes([end.section, end.script])')
		expect(close).toContain('scriptEndCard(end)')
	})

	test('jumps, seeks, resets and a restarted clock drop the open take', () => {
		expect(functionBody('bumpProgressEpoch')).toContain('takeTracker.discard()')
		expect(functionBody('resetSession')).toContain('takeTracker.discard()')
		expect(functionBody('startSession')).toContain('takeTracker.discard()')
	})

	test('only whole takes reach the log, for the prompted note', () => {
		const keep = functionBody('keepTakes')
		expect(keep).toContain('currentSourcePath()')
		expect(keep).toContain('loggableTakes(results)')
		expect(keep).toContain('plugin.recordTake(notePath, take)')
	})
})

/**
 * Voice tracking and read-aloud never run the scroll loop, so a take under them is fed by the place
 * each reports. The tracker rules for those places are behaviour-tested in takes.test.ts
 * (TakeTracker.follow), the reports themselves in voice/reading-move.test.ts and
 * tts/tts-service.test.ts; these guards hold the two call sites to them.
 */
describe('a take runs under voice tracking', () => {
	test('every committed place reaches the tracker, measured at the word heard', () => {
		expect(functionBody('toggleVoiceTracking')).toContain('voiceTrackingService.onReadingMove = (move: VoiceReadingMove) => followVoiceTake(move)')
		const follow = functionBody('followVoiceTake')
		expect(follow).toContain('if (!area || !move.span || !ownsVoice() || !voiceTrackingActive) return')
		expect(follow).toContain('takeTracker.follow(readingFrame({')
		expect(follow).toContain('readingLine: takeContentTopOf(move.span, area)')
		expect(follow).toContain('viewTop: area.scrollTop')
		expect(follow).toContain('elapsedMs: rehearsalClock.elapsedMs')
		expect(follow).toContain("plugin.settings.sectionStopMode ?? 'targeted'")
		expect(follow).toContain('if (crossed) endVoiceSectionTake(crossed)')
	})

	test('his words run the rehearsal clock, idle after a jump or stopped on a card, before the place is timed', () => {
		const follow = functionBody('followVoiceTake')
		expect(follow).toContain("if (sessionState !== 'running') startSession()")
		expect(follow.indexOf('startSession()')).toBeLessThan(follow.indexOf('takeTracker.follow('))
	})

	test('his last words close the run as the end of a scroll does, once', () => {
		const follow = functionBody('followVoiceTake')
		expect(follow).toContain('const atEnd = voiceReachedScriptEnd(move.wordIndex, move.totalWords)')
		expect(follow).toContain("if (sessionState === 'finished' && atEnd) return")
		expect(follow).toMatch(/if \(atEnd\) \{\s+finishSession\(\)\s+closeScriptTake\(crossed\)\s+return\s+\}/)
	})

	test('a section end pauses the clock and shows the card, and never stops the microphone', () => {
		const end = functionBody('endVoiceSectionTake')
		expect(end).toContain('keepTakes([end.result])')
		expect(end).toContain('pauseSession()')
		expect(end).toContain('showTake(takeCard(end.result))')
		for (const stops of ['toggleVoiceTracking', 'voiceTrackingService', '.stop(', 'stopPlayback']) expect(end).not.toContain(stops)
	})
})

describe('a take runs while reading aloud', () => {
	test('every sentence started reaches the tracker, after the page has been sent to it', () => {
		const start = app.indexOf('ttsService.onSentenceStartEvent(')
		const handler = app.slice(start, app.indexOf('\n    })', start))
		expect(handler).toContain('followReadAloudTake(index)')
		expect(handler.indexOf('scrollToTTSSentence(index)')).toBeLessThan(handler.indexOf('followReadAloudTake(index)'))
		const follow = functionBody('followReadAloudTake')
		expect(follow).toContain("ttsService?.getState().playbackState !== 'playing') return")
		expect(follow).toContain("if (sessionState !== 'running') startSession()")
		expect(follow).toContain('const readingLine = takeContentTopOf(sentence, area)')
		expect(follow).toContain('takeTracker.follow(readingFrame({')
		expect(follow).toContain('viewTop: index === 0 ? 0 : Math.max(0, readingLine - readingOffset())')
		expect(follow).toContain('if (crossed) endReadAloudSectionTake(crossed)')
	})

	test('a section end pauses the reading before the next heading is spoken, with the clock, and shows the card', () => {
		const end = functionBody('endReadAloudSectionTake')
		expect(end).toContain('keepTakes([end.result])')
		expect(end).toContain('ttsService?.pauseBeforeSentence()')
		expect(end).toContain('pauseSession()')
		expect(end).toContain('showTake(takeCard(end.result))')
	})

	test('the last sentence read to its end closes the take; a loop never does', () => {
		expect(app).toContain('ttsService.onSentenceEndEvent(({ index }) => finishReadAloudTake(index))')
		const finish = functionBody('finishReadAloudTake')
		expect(finish).toContain('if (!ownsTTS() || ttsLoop || !ttsService) return')
		expect(finish).toContain('finishSession()')
		expect(finish).toContain('closeScriptTake(null)')
	})

	test('starting to read from the top or from a section drops the take open elsewhere', () => {
		const toggle = functionBody('toggleTTS')
		expect(toggle.indexOf('takeTracker.discard()')).toBeGreaterThan(-1)
		expect(toggle.indexOf('takeTracker.discard()')).toBeLessThan(toggle.indexOf('await ttsService.play()'))
		const fromSection = functionBody('startTTSFromSection')
		expect(fromSection.indexOf('takeTracker.discard()')).toBeGreaterThan(-1)
		expect(fromSection.indexOf('takeTracker.discard()')).toBeLessThan(fromSection.indexOf('await ttsService.jumpToSection(headerId)'))
	})
})

describe('the result reaches every surface', () => {
	test('the other window receives the card', () => {
		expect(functionBody('showTake')).toContain('broadcastState({ takeCard: card })')
		expect(app).toContain('if (data.takeCard !== undefined) takeCardShown = data.takeCard')
	})

	test('remotes get the last take and the speed in words per minute with every state push', () => {
		const body = functionBody('broadcastStateToWebSocket')
		expect(body).toContain('lastTake: takeCardShown')
		expect(body).toContain('wordsPerMinute:')
		expect(app).toContain('take: takeCardShown,')
	})

	test('the phone remote shows the last take and the words per minute', () => {
		expect(remote).toContain('id="takeBanner"')
		expect(remote).toContain('if (newState.lastTake !== undefined) {')
		expect(remote).toContain('takeText.textContent = take.text;')
		expect(remote).toContain("newState.wordsPerMinute + ' wpm'")
	})
})

describe('fit to target and words per minute', () => {
	test('the speed control shows words per minute and offers Fit to target', () => {
		expect(app).toContain('formatWordsPerMinute(speedWordsPerMinute)')
		expect(app).toContain('onclick={fitSpeedToTarget}')
		expect(app).toContain('const speedWordsPerMinute = $derived(speedToWordsPerMinute(speed, wordsPerPx))')
	})

	test('fit plans with ./takes, keeps the settings range, and runs in the floating view while it floats', () => {
		const fit = functionBody('fitSpeedToTarget')
		expect(fit).toContain("if (forwardToFloating('teleprompter:fit-speed-to-target')) return")
		expect(fit).toContain('planFit({')
		expect(fit).toContain('speedForPlan(plan.pixelsPerSecond, speedLimits(settings))')
		expect(fit).toContain('applySpeed(fitted.speed)')
	})

	test('the command reaches the view as an event the view listens for', () => {
		expect(read('main.ts')).toContain("window.dispatchEvent(new CustomEvent('teleprompter:fit-speed-to-target'))")
		expect(LISTENED_COMMAND_EVENTS).toContain('teleprompter:fit-speed-to-target')
		expect(parseCommand('teleprompter:fit-speed-to-target', undefined)).toEqual({ kind: 'fitSpeedToTarget' })
		expect(commandHandlerSource(app, 'fit-speed-to-target')).toContain('fitSpeedToTarget()')
	})
})

describe('commands and the setting', () => {
	test('"Show recent takes" and "Fit speed to target" are commands', () => {
		const main = read('main.ts')
		expect(main).toContain("id: 'show-recent-takes'")
		expect(main).toContain("name: 'Show recent takes'")
		expect(main).toContain("id: 'fit-speed-to-target'")
	})

	test('the view tells the plugin which note it prompts, for the takes list', () => {
		expect(app).toContain('plugin.promptedNotePath = newPath')
	})

	async function loadedSettings(saved: Record<string, unknown> | null): Promise<{ sectionStopMode: string }> {
		const { default: TeleprompterPlusPlugin } = await import('./main')
		// The stubbed Plugin base takes no app or manifest; only the settings path runs here.
		const Constructor = TeleprompterPlusPlugin as unknown as new () => {
			loadData(): Promise<unknown>
			saveData(data: unknown): Promise<void>
			loadSettings(): Promise<void>
			settings: { sectionStopMode: string }
		}
		const plugin = new Constructor()
		plugin.loadData = async () => saved
		plugin.saveData = async () => {}
		await plugin.loadSettings()
		return plugin.settings
	}

	test('the stop mode defaults to targeted for a new and an existing install', async () => {
		expect((await loadedSettings(null)).sectionStopMode).toBe('targeted')
		expect((await loadedSettings({ fontSize: 30 })).sectionStopMode).toBe('targeted')
	})

	test('a saved choice survives the validator; a corrupt one goes back to the default', async () => {
		expect((await loadedSettings({ sectionStopMode: 'always' })).sectionStopMode).toBe('always')
		expect((await loadedSettings({ sectionStopMode: 'never' })).sectionStopMode).toBe('never')
		expect((await loadedSettings({ sectionStopMode: 'sometimes' })).sectionStopMode).toBe('targeted')
		expect((await loadedSettings({ sectionStopMode: 3 })).sectionStopMode).toBe('targeted')
	})
})
