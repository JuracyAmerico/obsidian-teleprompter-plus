/**
 * One symbol per teleprompter action, shared by every surface that shows the action: the toolbar
 * (through icon-vocabulary.ts), the phone remote (held to it by src/action-icons.test.ts) and the
 * Stream Deck keys (scripts/streamdeck-profile.ts draws them from lucide-static in the deck's own
 * style). Change a symbol here and every surface follows; a test fails if one of them drifts.
 *
 * Keys are the WebSocket command names (see docs/websocket-api.md), so the deck, the remote and
 * the toolbar name an action the same way. `badge` is a second, smaller Lucide icon the deck puts
 * beside the symbol for a key that is one step of a control the toolbar shows as one button (the
 * speed button is a gauge; the deck's Speed Up key is the gauge with an up arrow). `on` is the
 * symbol of the action's second state.
 */

export interface ActionIcon {
	/** Lucide icon name; for a two-state action, the picture of its first state (paused, off). */
	readonly lucide: string
	/** Lucide icon name of the second state, where the symbol changes with it. */
	readonly on?: string
	/** Lucide icon name drawn small beside the symbol on a Stream Deck key. */
	readonly badge?: string
}

const step = (lucide: string, badge: string): ActionIcon => ({ lucide, badge })

/** The symbol of each toolbar control, by the toolbar's own icon name. */
export const CONTROL_ICONS = {
	play: { lucide: 'play', on: 'pause' },
	resetToTop: { lucide: 'arrow-up-to-line' },
	speed: { lucide: 'gauge' },
	countdown: { lucide: 'timer' },
	fontSize: { lucide: 'a-large-small' },
	lineHeight: { lucide: 'list-chevrons-up-down' },
	letterSpacing: { lucide: 'move-horizontal' },
	opacity: { lucide: 'blend' },
	padding: { lucide: 'square-dashed' },
	flipHorizontal: { lucide: 'flip-horizontal-2' },
	flipVertical: { lucide: 'flip-vertical-2' },
	minimap: { lucide: 'map' },
	float: { lucide: 'picture-in-picture-2' },
	openInWindow: { lucide: 'app-window' },
	autoPause: { lucide: 'circle-pause' },
	refreshPinned: { lucide: 'refresh-cw' },
	fullscreen: { lucide: 'maximize' },
	navigationPanel: { lucide: 'panel-left' },
	eyeline: { lucide: 'scan-line' },
	focusMode: { lucide: 'scan-text' },
	pin: { lucide: 'pin' },
	keepAwake: { lucide: 'coffee' },
	voice: { lucide: 'mic-off', on: 'mic' },
	progressIndicator: { lucide: 'loader' },
	alignment: { lucide: 'align-center' },
	timeDisplay: { lucide: 'clock' },
	nextSection: { lucide: 'chevrons-right' },
	previousSection: { lucide: 'chevrons-left' },
} as const satisfies Record<string, ActionIcon>

const C = CONTROL_ICONS

/** Every action, by command, that shows a symbol shared with the toolbar or the remote. */
export const ACTION_ICONS = {
	'toggle-play': C.play,
	'reset-to-top': C.resetToTop,
	'increase-speed': step(C.speed.lucide, 'arrow-up'),
	'decrease-speed': step(C.speed.lucide, 'arrow-down'),
	'cycle-speed-preset': step(C.speed.lucide, 'refresh-cw'),
	'next-speed-preset': step(C.speed.lucide, 'chevron-right'),
	'prev-speed-preset': step(C.speed.lucide, 'chevron-left'),
	'start-countdown': step(C.countdown.lucide, 'play'),
	'countdown-increase': step(C.countdown.lucide, 'plus'),
	'countdown-decrease': step(C.countdown.lucide, 'minus'),
	'font-size-up': step(C.fontSize.lucide, 'arrow-up'),
	'font-size-down': step(C.fontSize.lucide, 'arrow-down'),
	'line-height-increase': step(C.lineHeight.lucide, 'arrow-up'),
	'line-height-decrease': step(C.lineHeight.lucide, 'arrow-down'),
	'letter-spacing-increase': step(C.letterSpacing.lucide, 'arrow-up'),
	'letter-spacing-decrease': step(C.letterSpacing.lucide, 'arrow-down'),
	'opacity-increase': step(C.opacity.lucide, 'arrow-up'),
	'opacity-decrease': step(C.opacity.lucide, 'arrow-down'),
	'padding-vertical-increase': step(C.padding.lucide, 'unfold-vertical'),
	'padding-vertical-decrease': step(C.padding.lucide, 'fold-vertical'),
	'padding-horizontal-increase': step(C.padding.lucide, 'unfold-horizontal'),
	'padding-horizontal-decrease': step(C.padding.lucide, 'fold-horizontal'),
	'toggle-flip-horizontal': C.flipHorizontal,
	'toggle-flip-vertical': C.flipVertical,
	'toggle-minimap': C.minimap,
	// The deck's "Detach Window" key sends detach-window, which the plugin runs as toggleFloating:
	// the toolbar's "Float over other apps" button, not its "Open in new window" button.
	'detach-window': C.float,
	'toggle-auto-pause': C.autoPause,
	'refresh-pinned': C.refreshPinned,
	'toggle-fullscreen': C.fullscreen,
	'toggle-navigation': C.navigationPanel,
	'toggle-eyeline': C.eyeline,
	'toggle-focus-mode': C.focusMode,
	'toggle-pin': C.pin,
	'toggle-keep-awake': C.keepAwake,
	'voice-toggle': C.voice,
	'cycle-progress-indicator': step(C.progressIndicator.lucide, 'refresh-cw'),
	'cycle-alignment': step(C.alignment.lucide, 'refresh-cw'),
	// The Clock key sends get-state; its live picture comes from the deck plugin, this is its resting symbol.
	'get-state': C.timeDisplay,
	// No toolbar twin; a symbol here so it no longer looks like Refresh Pinned (refresh-cw).
	'toggle-scroll-sync': { lucide: 'link-2' },
	'next-section': C.nextSection,
	'previous-section': C.previousSection,
} as const satisfies Record<string, ActionIcon>

export type ActionIconKey = keyof typeof ACTION_ICONS

export function actionIcon(command: string): ActionIcon | undefined {
	return Object.hasOwn(ACTION_ICONS, command) ? ACTION_ICONS[command as ActionIconKey] : undefined
}
