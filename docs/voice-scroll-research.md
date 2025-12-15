# Voice Scroll Research Log

**Date:** 2025-12-15
**Status:** Feature removed (incompatible with Obsidian/Electron)

## Summary

Voice scroll functionality was researched and implemented but ultimately removed due to fundamental incompatibilities with Obsidian's Electron environment.

## Approaches Attempted

### 1. Web Speech API (Cloud)
- **Result:** Partially works but unreliable
- **Issue:** Network errors in Electron environment, requires internet connection
- **Error:** `network` error type in SpeechRecognition API

### 2. Whisper via transformers.js (Local AI)
- **Result:** Failed - incompatible with Electron
- **Issue:** transformers.js incorrectly detects Electron as Node.js environment
- **Error:** `Unsupported device: "webgpu". Should be one of: cpu.` then `Cannot read properties of undefined (reading 'create')`
- **GitHub Issue:** https://github.com/huggingface/transformers.js/issues/1240

### 3. Audio Detection (Offline fallback)
- **Result:** Works but limited functionality
- **Issue:** Only responds to volume, not speech content - not true voice control

## Technical Details

### transformers.js in Electron Issue

The library's environment detection sets `IS_NODE_ENV` to true in Electron apps, which causes it to use `onnxruntime-node` (CPU-only) instead of `onnxruntime-web`. This results in:

1. WebGPU device unavailable
2. WASM device unavailable
3. CPU device fails with undefined runtime

From GitHub Issue #1240:
> "Currently, the library is detecting Electron apps as Node.js. This generates a situation where the frontend of the application tries to use ORT for Node, which is CPU-only."

### Bundle Size Impact

- With `@huggingface/transformers`: ~64MB
- Without: ~1.6MB

## Future Options

If voice control is desired in the future:

1. **Whisper via local server** - Run whisper.cpp as a separate server process
2. **Wait for transformers.js fix** - Issue #1240 tracks Electron support
3. **Vosk with proper setup** - Has Node.js bindings but requires model downloads
4. **Native Electron speech** - Use Electron's native speech recognition APIs

## Decision

Voice scroll removed from v0.7.0 to keep the plugin stable and lightweight. Can be reconsidered when transformers.js properly supports Electron environments.

## Files Removed

- `src/whisper-service.ts`
- `src/whisper-worker.ts`
- `@huggingface/transformers` dependency
