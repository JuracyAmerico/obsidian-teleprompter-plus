/**
 * How far the voice-follow scroll moves in one animation frame. The smoothness setting was tuned
 * as a share of the distance per 60 Hz frame; applied per frame as is, a 120 Hz iPhone screen
 * finishes the same glide in half the time, and short phone lines turn it into a jump every line.
 * This keeps the glide's duration the same at any refresh rate.
 */
export const REFERENCE_FRAME_MS = 1000 / 60

export function followShare(factorPer60HzFrame: number, elapsedMs: number): number {
	const factor = Math.min(1, Math.max(0, factorPer60HzFrame))
	// A frame after a long stall (tab hidden, slow phone) should not leap the whole way at once
	const elapsed = Math.min(Math.max(0, elapsedMs), REFERENCE_FRAME_MS * 4)
	return 1 - Math.pow(1 - factor, elapsed / REFERENCE_FRAME_MS)
}
