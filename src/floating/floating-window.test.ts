import { describe, expect, test } from 'bun:test'
import {
	centeredOnPrompter,
	canFloat,
	clampSeeThrough,
	electronWindowOf,
	findPrompterDisplay,
	floatingPlacement,
	placementAfterPrompterLost,
	FloatingSession,
	FloatingWindowController,
	restorableBounds,
	type ElectronWindowLike,
	type WindowBounds,
} from './floating-window'

type Call = [string, ...unknown[]]

function fakeWindow(destroyed = false): ElectronWindowLike & { calls: Call[] } {
	const calls: Call[] = []
	return {
		calls,
		setAlwaysOnTop: (...a) => void calls.push(['setAlwaysOnTop', ...a]),
		setVisibleOnAllWorkspaces: (...a) => void calls.push(['setVisibleOnAllWorkspaces', ...a]),
		setIgnoreMouseEvents: (...a) => void calls.push(['setIgnoreMouseEvents', ...a]),
		setOpacity: (...a) => void calls.push(['setOpacity', ...a]),
		setBackgroundThrottling: (...a) => void calls.push(['setBackgroundThrottling', ...a]),
		getBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }),
		setBounds: (...a) => void calls.push(['setBounds', ...a]),
		isDestroyed: () => destroyed,
	}
}

const named = (win: { calls: Call[] }, name: string) => win.calls.filter(call => call[0] === name)
const last = (win: { calls: Call[] }, name: string) => named(win, name).at(-1)

describe('FloatingWindowController', () => {
	test('on top: enter raises it over full-screen apps on macOS, exit undoes both', () => {
		const win = fakeWindow()
		const controller = new FloatingWindowController(win, { isMac: true })
		controller.enter()
		expect(named(win, 'setAlwaysOnTop')[0]).toEqual(['setAlwaysOnTop', true, 'floating'])
		expect(named(win, 'setVisibleOnAllWorkspaces')[0]).toEqual([
			'setVisibleOnAllWorkspaces',
			true,
			{ visibleOnFullScreen: true },
		])
		controller.exit()
		expect(last(win, 'setAlwaysOnTop')).toEqual(['setAlwaysOnTop', false])
		expect(last(win, 'setVisibleOnAllWorkspaces')).toEqual(['setVisibleOnAllWorkspaces', false])
	})

	test('on top: Windows skips the macOS-only call', () => {
		const win = fakeWindow()
		new FloatingWindowController(win, { isMac: false }).enter()
		expect(named(win, 'setVisibleOnAllWorkspaces')).toEqual([])
	})

	test('click-through: lock forwards the mouse, unlock stops, exit unlocks first', () => {
		const win = fakeWindow()
		const controller = new FloatingWindowController(win, { isMac: true })
		controller.enter()
		controller.lock()
		expect(last(win, 'setIgnoreMouseEvents')).toEqual(['setIgnoreMouseEvents', true, { forward: true }])
		controller.unlock()
		expect(last(win, 'setIgnoreMouseEvents')).toEqual(['setIgnoreMouseEvents', false])
		controller.lock()
		controller.exit()
		expect(controller.isLocked).toBe(false)
		expect(last(win, 'setIgnoreMouseEvents')).toEqual(['setIgnoreMouseEvents', false])
		const unlockAt = win.calls.findLastIndex(call => call[0] === 'setIgnoreMouseEvents')
		const topAt = win.calls.findLastIndex(call => call[0] === 'setAlwaysOnTop')
		expect(unlockAt).toBeLessThan(topAt)
	})

	test('click-through: hovering the handle lets it take the click, leaving it restores pass-through', () => {
		const win = fakeWindow()
		const controller = new FloatingWindowController(win, { isMac: true })
		controller.enter()
		controller.lock()
		controller.setHandleHovered(true)
		expect(last(win, 'setIgnoreMouseEvents')).toEqual(['setIgnoreMouseEvents', false])
		expect(controller.isLocked).toBe(true)
		controller.setHandleHovered(false)
		expect(last(win, 'setIgnoreMouseEvents')).toEqual(['setIgnoreMouseEvents', true, { forward: true }])
	})

	test('never starts locked: enter clears pass-through', () => {
		const win = fakeWindow()
		const controller = new FloatingWindowController(win, { isMac: true })
		controller.enter()
		expect(controller.isLocked).toBe(false)
		expect(named(win, 'setIgnoreMouseEvents')[0]).toEqual(['setIgnoreMouseEvents', false])
	})

	test('clamped: see-through stays within 30-100 before it reaches the window', () => {
		expect(clampSeeThrough(5)).toBe(30)
		expect(clampSeeThrough(250)).toBe(100)
		expect(clampSeeThrough(70)).toBe(70)
		expect(clampSeeThrough(Number.NaN)).toBe(85)
		const win = fakeWindow()
		const controller = new FloatingWindowController(win, { isMac: true, seeThroughPercent: 1 })
		controller.enter()
		expect(last(win, 'setOpacity')).toEqual(['setOpacity', 0.3])
		controller.setSeeThrough(1000)
		expect(last(win, 'setOpacity')).toEqual(['setOpacity', 1])
	})

	test('throttling: off on both windows while floating, back on at exit', () => {
		const win = fakeWindow()
		const main = fakeWindow()
		const controller = new FloatingWindowController(win, { isMac: true, mainWindow: main })
		controller.enter()
		expect(last(win, 'setBackgroundThrottling')).toEqual(['setBackgroundThrottling', false])
		expect(last(main, 'setBackgroundThrottling')).toEqual(['setBackgroundThrottling', false])
		controller.exit()
		expect(last(win, 'setBackgroundThrottling')).toEqual(['setBackgroundThrottling', true])
		expect(last(main, 'setBackgroundThrottling')).toEqual(['setBackgroundThrottling', true])
	})

	test('exit on a closed window touches nothing there but still restores the main window', () => {
		const win = fakeWindow()
		const main = fakeWindow()
		const controller = new FloatingWindowController(win, { isMac: true, mainWindow: main })
		controller.enter()
		win.calls.length = 0
		win.isDestroyed = () => true
		controller.exit()
		expect(win.calls).toEqual([])
		expect(last(main, 'setBackgroundThrottling')).toEqual(['setBackgroundThrottling', true])
	})

	test('a throwing window call does not escape', () => {
		const win = fakeWindow()
		win.setAlwaysOnTop = () => {
			throw new Error('Object has been destroyed')
		}
		expect(() => new FloatingWindowController(win, { isMac: true }).enter()).not.toThrow()
	})
})

describe('bounds', () => {
	const display: WindowBounds = { x: 0, y: 0, width: 1512, height: 982 }

	test('bounds on a connected display are restored', () => {
		const saved = { x: 100, y: 100, width: 600, height: 400 }
		expect(restorableBounds(saved, [display])).toEqual(saved)
	})

	test('bounds on a display that is gone are rejected', () => {
		expect(restorableBounds({ x: 3000, y: 100, width: 600, height: 400 }, [display])).toBeNull()
	})

	test('bounds with only a sliver showing are rejected', () => {
		expect(restorableBounds({ x: 1500, y: 100, width: 600, height: 400 }, [display])).toBeNull()
	})

	test('bounds with nothing saved or no display list fall back to the default', () => {
		expect(restorableBounds(null, [display])).toBeNull()
		expect(restorableBounds({ x: 1, y: 1, width: 600, height: 400 }, [])).toBeNull()
	})
})

describe('Elgato Prompter', () => {
	const laptop = { label: 'Built-in Retina Display', bounds: { x: 0, y: 0, width: 1512, height: 982 } }
	const prompter = { label: 'Elgato Prom.', bounds: { x: 209, y: -1680, width: 1024, height: 600 } }
	const sameSize = { label: 'Some Field Monitor', bounds: { x: 2000, y: 0, width: 1024, height: 600 } }
	const saved = { x: 100, y: 100, width: 600, height: 400 }

	test('prompter display: found by name, never by size', () => {
		expect(findPrompterDisplay([laptop, prompter])).toBe(prompter)
		expect(findPrompterDisplay([laptop, sameSize])).toBeNull()
		expect(findPrompterDisplay([{ bounds: sameSize.bounds }])).toBeNull()
	})

	test('prompter lost: unplugged under the window, it moves to the saved place and see-through', () => {
		const prefs = { savedBounds: saved, seeThroughPercent: 60 }
		expect(placementAfterPrompterLost([laptop], true, prefs)).toEqual({ bounds: saved, onPrompter: false, seeThroughPercent: 60 })
	})

	test('prompter lost: nothing moves while it is connected or the window is elsewhere', () => {
		const prefs = { savedBounds: saved, seeThroughPercent: 60 }
		expect(placementAfterPrompterLost([laptop, prompter], true, prefs)).toBeNull()
		expect(placementAfterPrompterLost([laptop], false, prefs)).toBeNull()
	})

	test('placement: Prompter connected and preferred fills it at full opacity', () => {
		const placement = floatingPlacement([laptop, prompter], { preferPrompter: true, savedBounds: saved, seeThroughPercent: 60 })
		expect(placement).toEqual({ bounds: prompter.bounds, onPrompter: true, seeThroughPercent: 100 })
	})

	test('placement: on the Prompter the reader own see-through applies, clamped, and the main-screen value never leaks in (ISC-145)', () => {
		expect(floatingPlacement([laptop, prompter], { preferPrompter: true, savedBounds: saved, seeThroughPercent: 60, prompterSeeThroughPercent: 70 }).seeThroughPercent).toBe(70)
		expect(floatingPlacement([laptop, prompter], { preferPrompter: true, savedBounds: saved, seeThroughPercent: 60, prompterSeeThroughPercent: 5 }).seeThroughPercent).toBe(30)
		expect(floatingPlacement([laptop], { preferPrompter: true, savedBounds: saved, seeThroughPercent: 60, prompterSeeThroughPercent: 70 }).seeThroughPercent).toBe(60)
	})

	test('placement: not preferred uses the saved place and see-through', () => {
		const placement = floatingPlacement([laptop, prompter], { preferPrompter: false, savedBounds: saved, seeThroughPercent: 60 })
		expect(placement).toEqual({ bounds: saved, onPrompter: false, seeThroughPercent: 60 })
	})

	test('placement: no Prompter connected uses the saved place', () => {
		const placement = floatingPlacement([laptop], { preferPrompter: true, savedBounds: saved, seeThroughPercent: 60 })
		expect(placement.onPrompter).toBe(false)
		expect(placement.bounds).toEqual(saved)
	})
})

describe('window lookup', () => {
	test('no electron window: a missing or partial object gives null and does not throw', () => {
		expect(electronWindowOf({})).toBeNull()
		expect(electronWindowOf(null)).toBeNull()
		expect(electronWindowOf({ electronWindow: { setAlwaysOnTop: () => {} } })).toBeNull()
	})

	test('a complete electron window is returned', () => {
		const win = fakeWindow()
		expect(electronWindowOf({ electronWindow: win })).toBe(win)
	})

	test('canFloat: desktop only, not Linux', () => {
		expect(canFloat({ isDesktopApp: true, isLinux: false })).toBe(true)
		expect(canFloat({ isDesktopApp: true, isLinux: true })).toBe(false)
		expect(canFloat({ isDesktopApp: false, isLinux: false })).toBe(false)
	})
})

describe('FloatingSession', () => {
	test('a request is handed to one view, once', () => {
		const session = new FloatingSession()
		session.request({ notePath: 'a.md', scrollRatio: 0.5, anchor: null, startVoice: true })
		expect(session.takeRequest()?.notePath).toBe('a.md')
		expect(session.takeRequest()).toBeNull()
	})

	test('unlock reaches the attached window from anywhere and detach ends the session', () => {
		const session = new FloatingSession()
		const win = fakeWindow()
		const controller = new FloatingWindowController(win, { isMac: true })
		controller.enter()
		controller.lock()
		session.attach(controller, () => {})
		expect(session.locked).toBe(true)
		session.unlock()
		expect(session.locked).toBe(false)
		session.detach(controller)
		expect(session.active).toBe(false)
	})

	test('ISC-148: notePath is the floating note only while a window floats, and follows a rename', () => {
		const session = new FloatingSession()
		const controller = new FloatingWindowController(fakeWindow(), { isMac: true })
		session.setNote('Notes/answer.md')
		expect(session.notePath).toBeNull()
		session.attach(controller, () => {})
		expect(session.notePath).toBe('Notes/answer.md')
		session.renamed('Notes/other.md', 'Notes/x.md')
		session.renamed('Notes/answer.md', 'Notes/answer-v2.md')
		expect(session.notePath).toBe('Notes/answer-v2.md')
		session.detach(controller)
		expect(session.notePath).toBeNull()
		session.attach(controller, () => {})
		expect(session.notePath).toBeNull()
	})

	test('ISC-139: reportSection tells listeners each new section once, only while floating', () => {
		const session = new FloatingSession()
		const controller = new FloatingWindowController(fakeWindow(), { isMac: true })
		const seen: string[] = []
		const stop = session.onSection(title => seen.push(title))
		session.reportSection('Opening')
		session.attach(controller, () => {})
		session.reportSection('Cloud')
		session.reportSection('Cloud')
		session.reportSection('SQL')
		session.detach(controller)
		session.reportSection('Close')
		stop()
		expect(seen).toEqual(['Cloud', 'SQL'])
	})

	test('ISC-141/142: reportPosition reaches listeners only while floating, with the share toward the next word', () => {
		const session = new FloatingSession()
		const controller = new FloatingWindowController(fakeWindow(), { isMac: true })
		const seen: [number, number][] = []
		const stop = session.onPosition((anchor, within) => seen.push([anchor.wordIndex, within]))
		const at = (wordIndex: number) => ({ wordIndex, context: 'a b c', contextStart: wordIndex, fraction: 0 })
		session.reportPosition(at(1), 0.5)
		session.attach(controller, () => {})
		session.reportPosition(at(5), 0.25)
		session.reportPosition(at(9), 0)
		// A share outside 0-1, or not a number, never reaches the main view.
		session.reportPosition(at(10), 1.7)
		session.reportPosition(at(11), Number.NaN)
		session.detach(controller)
		session.reportPosition(at(12), 0.5)
		stop()
		expect(seen).toEqual([[5, 0.25], [9, 0], [10, 1], [11, 0]])
	})

	test('forward reaches the attached view and stops at detach', () => {
		const session = new FloatingSession()
		const controller = new FloatingWindowController(fakeWindow(), { isMac: true })
		const seen: [string, unknown][] = []
		session.attach(controller, () => {}, (type, detail) => seen.push([type, detail]))
		session.forward('teleprompter:play', { a: 1 })
		session.detach(controller)
		session.forward('teleprompter:pause')
		expect(seen).toEqual([['teleprompter:play', { a: 1 }]])
	})

	test('forward: an event delivered back during delivery does not loop', () => {
		const session = new FloatingSession()
		const controller = new FloatingWindowController(fakeWindow(), { isMac: true })
		let deliveries = 0
		session.attach(controller, () => {}, () => {
			deliveries++
			session.forward('teleprompter:play')
		})
		session.forward('teleprompter:play')
		expect(deliveries).toBe(1)
		session.forward('teleprompter:play')
		expect(deliveries).toBe(2)
	})

	test('a detach from an older controller leaves the current one attached', () => {
		const session = new FloatingSession()
		const older = new FloatingWindowController(fakeWindow(), { isMac: true })
		const current = new FloatingWindowController(fakeWindow(), { isMac: true })
		session.attach(current, () => {})
		session.detach(older)
		expect(session.active).toBe(true)
	})
})

describe('float toggle', () => {
	test('one command acts once, whichever views hear it', () => {
		const session = new FloatingSession()
		const event = new Event('teleprompter:toggle-floating')
		expect(session.claim(event)).toBe(true)
		expect(session.claim(event)).toBe(false)
		expect(session.claim(new Event('teleprompter:toggle-floating'))).toBe(true)
	})
})

describe('hide from capture', () => {
	test('the controller asks the window, and a window without the call is fine', () => {
		const calls: boolean[] = []
		const win = { ...fakeWindowForHideTest(), setContentProtection: (hide: boolean) => calls.push(hide) }
		const controller = new FloatingWindowController(win as never, { main: null } as never)
		controller.setHideFromShare(true)
		controller.setHideFromShare(false)
		expect(calls).toEqual([true, false])
		const older = new FloatingWindowController(fakeWindowForHideTest() as never, { main: null } as never)
		expect(() => older.setHideFromShare(true)).not.toThrow()
	})
})

function fakeWindowForHideTest() {
	return {
		setAlwaysOnTop() {}, setVisibleOnAllWorkspaces() {}, setIgnoreMouseEvents() {}, setOpacity() {},
		setBackgroundThrottling() {}, getBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }), setBounds() {},
	}
}

describe('Prompter size kept and centred (ISC-146)', () => {
	const display = { x: 312, y: -570, width: 1024, height: 570 }
	test('no kept size fills the Prompter', () => {
		expect(centeredOnPrompter(display, null)).toEqual(display)
	})
	test('a kept size is centred on the Prompter', () => {
		expect(centeredOnPrompter(display, { width: 764, height: 570 })).toEqual({ x: 442, y: -570, width: 764, height: 570 })
		expect(centeredOnPrompter(display, { width: 600, height: 400 })).toEqual({ x: 524, y: -485, width: 600, height: 400 })
	})
	test('a size larger than the Prompter is capped to it', () => {
		expect(centeredOnPrompter(display, { width: 3000, height: 900 })).toEqual(display)
	})
})
