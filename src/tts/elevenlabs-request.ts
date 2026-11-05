/** The pure parts of an ElevenLabs request, kept apart from the engine so they can be tested. */

const CONTEXT_LIMIT = 300

export interface SpeechContext {
	previousText?: string
	nextText?: string
}

export interface SpeechRequest extends SpeechContext {
	text: string
	modelId: string
	stability: number
	similarity: number
}

export function buildSpeechBody(request: SpeechRequest): Record<string, unknown> {
	const body: Record<string, unknown> = {
		text: request.text,
		model_id: request.modelId,
		voice_settings: { stability: request.stability, similarity_boost: request.similarity },
	}
	if (request.previousText) body.previous_text = request.previousText
	if (request.nextText) body.next_text = request.nextText
	return body
}

/** The same words in another context or voice setting sound different, so they are not the same audio. */
export function speechCacheKey(
	modelId: string,
	voiceId: string,
	text: string,
	context: SpeechContext,
	stability = 0,
	similarity = 0
): string {
	return JSON.stringify([modelId, voiceId, stability, similarity, context.previousText ?? '', context.nextText ?? '', text])
}

/** The sentences on either side, in the form they will be spoken. */
export function contextAround(sentences: string[], index: number, spokenOf: (sentence: string) => string): SpeechContext {
	const previous = sentences[index - 1]
	const next = sentences[index + 1]
	return {
		previousText: previous === undefined ? undefined : spokenOf(previous).slice(-CONTEXT_LIMIT),
		nextText: next === undefined ? undefined : spokenOf(next).slice(0, CONTEXT_LIMIT),
	}
}

/** Everything that means the engine must be built again before the next read. */
export function engineSignature(settings: {
	ttsEngine: string
	elevenLabsApiKey: string
	elevenLabsVoiceId: string
	elevenLabsModelId: string
	elevenLabsStability: number
	elevenLabsSimilarity: number
}): string {
	return JSON.stringify([
		settings.ttsEngine,
		settings.elevenLabsApiKey,
		settings.elevenLabsVoiceId,
		settings.elevenLabsModelId,
		settings.elevenLabsStability,
		settings.elevenLabsSimilarity,
	])
}
