import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Source-text guards that TeleprompterApp.svelte (which bun cannot mount) routes playback through
 * ./playback. What each piece does is tested as behaviour in playback.test.ts; these fail if the
 * component goes back to its own copy of a rule.
 */
const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')

function functionBody(name: string): string {
	const start = app.search(new RegExp(`\\n {2}(async )?function ${name}\\(`))
	expect(start).toBeGreaterThan(-1)
	const rest = app.slice(start + 1)
	const end = rest.search(/\n {2}(async )?function /)
	return end === -1 ? rest : rest.slice(0, end)
}

function eventCase(type: string): string {
	const start = app.indexOf(`case 'teleprompter:${type}':`)
	expect(start).toBeGreaterThan(-1)
	const rest = app.slice(start + 1)
	return rest.slice(0, rest.search(/\n {6}case '/))
}

describe('B1: one cancellable countdown', () => {
	test('the countdown is the playback Countdown on this view\'s window, not a local interval', () => {
		expect(app).toContain('const countdown = new Countdown(() => getActualWindow())')
		expect(functionBody('startCountdown')).toContain('countdown.start(countdownSeconds, {')
		expect(app).not.toContain('const countdownInterval = setInterval(')
	})

	test('cancelling clears the playback countdown, not only the number on screen', () => {
		const cancel = functionBody('cancelCountdown')
		expect(cancel).toContain('countdown.cancel()')
		expect(cancel).toContain('isCountingDown = false')
		expect(functionBody('stopPlayback')).toContain('cancelCountdown(reason)')
	})

	test('every jump or seek goes through stopPlayback; the pasted cancel blocks are gone', () => {
		expect(functionBody('jumpToHeader')).toContain("stopPlayback('section jump')")
		expect(functionBody('seekToFraction')).toContain('stopPlayback(')
		expect(functionBody('handleMinimapClick')).toContain("seekToFraction(fraction, 'Minimap')")
		expect(functionBody('handleProgressBarClick')).toContain("seekToFraction(fraction, 'ProgressBar')")
		expect(functionBody('resetToTop')).toContain("stopPlayback('reset to top')")
		expect(eventCase('pause')).toContain("stopPlayback('pause command')")
		expect(eventCase('set-scroll-percentage')).toContain("seekToFraction(customEvent.detail.percentage / 100, 'Forwarded')")
		expect(app).not.toContain('Cancelled countdown due to manual')
	})

	test('Space or the button during the countdown cancels it before anything else', () => {
		const toggle = functionBody('togglePlay')
		expect(toggle.indexOf('if (isCountingDown) {')).toBeGreaterThan(-1)
		expect(toggle.indexOf('if (isCountingDown) {')).toBeLessThan(toggle.indexOf('} else if (isPlaying) {'))
		expect(toggle).toContain("cancelCountdown('play pressed during the countdown')")
	})

	test('a remote play skips the countdown; a remote start-countdown never runs two', () => {
		expect(eventCase('play')).toContain("cancelCountdown('play command')")
		expect(eventCase('start-countdown')).toContain("stopPlayback('start-countdown command')")
	})

	test('closing the view cancels a running countdown', () => {
		expect(app).toContain('countdown.cancel()\n\n      // Cleanup keep awake')
	})
})

describe('B2: one speed rule', () => {
	test('hotkeys, toolbar and remote step through stepSpeed within the settings', () => {
		expect(app).not.toContain('speed++')
		expect(app).not.toContain('speed--')
		expect(app).not.toContain('speed < 50')
		expect(functionBody('increaseSpeed')).toContain('applySpeed(stepSpeed(speed, 1, speedLimits(settings)))')
		expect(functionBody('decreaseSpeed')).toContain('applySpeed(stepSpeed(speed, -1, speedLimits(settings)))')
		const hotkeys = functionBody('executeHotkeyAction')
		expect(hotkeys).toContain("case 'speedUp':\n        increaseSpeed()")
		expect(hotkeys).toContain("case 'speedDown':\n        decreaseSpeed()")
		expect(eventCase('increase-speed')).toContain('increaseSpeed()')
		expect(eventCase('decrease-speed')).toContain('decreaseSpeed()')
	})

	test('every speed change is sent to the other window', () => {
		expect(functionBody('applySpeed')).toContain('broadcastState({ speed })')
	})
})

describe('B3/B4: the scroll loop', () => {
	test('frames advance through AutoScroller; the 16.67 ms gate and pixel accumulator are gone', () => {
		expect(app).toContain('const frame = autoScroller.step(timestamp, area, speed)')
		expect(app).toContain('autoScroller.start()')
		expect(app).not.toContain('delta >= 16.67')
		expect(app).not.toContain('accumulatedScroll')
	})

	test('the end of the script stops scrolling and freezes the clock as finished', () => {
		expect(app).toContain('if (frame.finished) {')
		const finish = functionBody('finishPlayback')
		expect(finish).toContain('isPlaying = false')
		expect(finish).toContain('finishSession()')
		const session = functionBody('finishSession')
		expect(session).toContain('rehearsalClock.pause()')
		expect(session).toContain("sessionState = 'finished'")
		expect(session).toContain('broadcastClockState()')
	})

	test('play at the end of the script is refused, so the final time is kept', () => {
		expect(functionBody('beginPlayback')).toContain('if (contentArea && isAtScriptEnd(contentArea)) {')
		expect(functionBody('togglePlay')).toContain('beginPlayback(true)')
		expect(eventCase('play')).toContain('beginPlayback(false)')
	})
})

describe('sections stop at the ends', () => {
	test('next and previous use stepSection and never wrap', () => {
		expect(functionBody('jumpToNextSection')).toContain('stepSection(currentHeaderIndex, headerList.length, 1)')
		expect(functionBody('jumpToPreviousSection')).toContain('stepSection(currentHeaderIndex, headerList.length, -1)')
		expect(functionBody('jumpToNextSection')).not.toContain('currentHeaderIndex = 0')
		expect(functionBody('jumpToPreviousSection')).not.toContain('currentHeaderIndex = headerList.length - 1')
	})
})

describe('B7: word count', () => {
	test('the component counts with countWords and guards the 0/0 share', () => {
		expect(functionBody('updateWordCount')).toContain('countWords(content)')
		expect(functionBody('calculateWordsRemaining')).toContain('scrollFraction(contentArea.scrollTop, maxScrollOf(contentArea))')
		expect(app).not.toContain(".replace(/\\[.*?\\]\\(.*?\\)/g, '$1')")
	})
})
