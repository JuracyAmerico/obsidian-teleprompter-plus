# Text-to-Speech (TTS) Setup Guide

**Version:** 1.0.0
**Last Updated:** 2026-03-04

Teleprompter Plus includes built-in text-to-speech that reads your documents aloud while synchronizing the teleprompter scroll with the current sentence.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [TTS Engines](#tts-engines)
3. [Kokoro Setup (Recommended)](#kokoro-setup-recommended)
4. [Voice Presets](#voice-presets)
5. [Settings Reference](#settings-reference)
6. [Citation Resolution](#citation-resolution)
7. [Troubleshooting](#troubleshooting)
8. [Architecture](#architecture)

---

## Quick Start

1. Open Teleprompter Plus with any note
2. Click the **TTS** button in the toolbar (speaker icon)
3. The teleprompter reads your document aloud and scrolls in sync
4. Use **pause/resume** to control playback
5. Change voice and speed in Settings > Text-to-Speech

By default, TTS uses **auto-detect** to select the best available engine on your system.

---

## TTS Engines

Teleprompter Plus supports three TTS engines, listed in quality order:

| Engine | Quality | Setup | Platform | Pause/Resume |
|--------|---------|-------|----------|--------------|
| **Kokoro** (MLX neural TTS) | Excellent | Python venv required | macOS (Apple Silicon) | SIGSTOP/SIGCONT via `afplay` |
| **macOS Say** | Good | None | macOS only | SIGSTOP/SIGCONT on `say` process |
| **Web Speech API** | Basic | None | All platforms | `speechSynthesis.pause()/resume()` |

### Auto-detect Order

When set to "Auto-detect," the plugin tries engines in this order:

1. **Kokoro** — if Python venv with `mlx-audio` is found
2. **macOS Say** — if running on macOS
3. **Web Speech** — always available (fallback)

A Notice appears telling you which engine was selected.

---

## Kokoro Setup (Recommended)

Kokoro uses the [mlx-community/Kokoro-82M-bf16](https://huggingface.co/mlx-community/Kokoro-82M-bf16) model running locally on Apple Silicon via MLX. It produces natural-sounding neural speech with 22 voice presets.

### Requirements

- macOS with Apple Silicon (M1/M2/M3/M4)
- Python 3.12 (Python 3.14 is incompatible with `spacy`)
- ~500MB disk space (model + venv)

### Installation

```bash
# 1. Install Python 3.12 if needed
brew install python@3.12

# 2. Install espeak-ng (phonemizer backend)
brew install espeak-ng

# 3. Create virtual environment
python3.12 -m venv ~/.local/share/mlx-tts-venv

# 4. Activate and install packages
source ~/.local/share/mlx-tts-venv/bin/activate
pip install mlx-audio 'misaki==0.7.4' num2words spacy phonemizer espeakng_loader

# 5. Download spaCy English model
python -m spacy download en_core_web_sm

# 6. Deactivate venv
deactivate
```

### Verify Installation

```bash
~/.local/share/mlx-tts-venv/bin/python3 -c "
from mlx_audio.tts.generate import generate_audio
generate_audio(
    text='Hello, Kokoro is working.',
    model='mlx-community/Kokoro-82M-bf16',
    voice='af_heart',
    speed=1.0,
    output_path='/tmp',
    file_prefix='kokoro_test',
    verbose=False,
    play=False
)
print('Success!')
"
# Then play the test audio:
afplay /tmp/kokoro_test_000.wav
```

First run downloads the model (~200MB) from HuggingFace. Subsequent runs use the cached model.

### Performance

On Apple M4 Pro, Kokoro generates audio at approximately **0.5x real-time** (a 6-second sentence generates in ~3 seconds). The first sentence has additional model loading latency (~2-3 seconds).

---

## Voice Presets

Kokoro offers 22 high-quality neural voice presets:

### American English

| ID | Name | Gender |
|----|------|--------|
| `af_heart` | Heart | Female (default) |
| `af_alloy` | Alloy | Female |
| `af_aoede` | Aoede | Female |
| `af_bella` | Bella | Female |
| `af_jessica` | Jessica | Female |
| `af_kore` | Kore | Female |
| `af_nicole` | Nicole | Female |
| `af_nova` | Nova | Female |
| `af_river` | River | Female |
| `af_sarah` | Sarah | Female |
| `af_sky` | Sky | Female |
| `am_adam` | Adam | Male |
| `am_echo` | Echo | Male |
| `am_eric` | Eric | Male |
| `am_liam` | Liam | Male |
| `am_michael` | Michael | Male |
| `am_onyx` | Onyx | Male |

### British English

| ID | Name | Gender |
|----|------|--------|
| `bf_emma` | Emma | Female |
| `bf_isabella` | Isabella | Female |
| `bm_daniel` | Daniel | Male |
| `bm_george` | George | Male |
| `bm_lewis` | Lewis | Male |

### Changing Voices

- **Toolbar:** Right-click the TTS button for a quick voice picker
- **Settings:** Go to Settings > Text-to-Speech > Voice

---

## Settings Reference

All TTS settings are under **Settings > Text-to-Speech**:

| Setting | Default | Description |
|---------|---------|-------------|
| Engine | Auto-detect | TTS engine: Auto-detect, Kokoro, macOS Say, or Web Speech |
| Voice | Default | Voice preset (22 options for Kokoro, system voices for others) |
| Speed | 1.0 | Speech rate multiplier (0.5x to 2.0x) |
| Language | en | Language code for TTS |
| Resolve citations | On | Convert `[@key]` to APA format using .bib file |
| Skip code blocks | On | Don't read fenced code blocks aloud |
| Skip tables | On | Don't read tables aloud |

---

## Citation Resolution

When reading academic documents (`.qmd`, `.md` with bibliography), TTS can resolve Pandoc-style citations to spoken APA format:

| In Document | Spoken As |
|-------------|-----------|
| `[@ries2011]` | "(Ries, 2011)" |
| `[-@moore2014]` | "(2014)" |
| `[@a; @b]` | "(Author A, Year; Author B, Year)" |
| 3+ authors | "(First Author et al., Year)" |

### How It Works

1. TTS reads the `bibliography:` field from YAML frontmatter
2. Loads and parses the `.bib` file using `@retorquere/bibtex-parser`
3. Replaces citation keys with human-readable APA format before speaking

### Requirements

- Document must have `bibliography: path/to/file.bib` in frontmatter
- The `.bib` file must be accessible relative to the document
- "Resolve citations" must be enabled in settings

---

## Troubleshooting

### No Audio Output

**Symptom:** TTS status shows "Reading aloud 1/N" but no sound.

**Possible causes:**

1. **Electron blocks `file://` audio** — Fixed in v0.10.0. Kokoro now uses `afplay` (macOS native audio player) instead of HTML5 Audio.

2. **Wrong engine selected** — Check the Notice that appears when TTS starts. If it says "Web Speech" when you expected Kokoro, the Kokoro venv may not be properly set up.

3. **Engine didn't reinitialize** — After changing the engine in settings, press TTS play again. The engine reinitializes automatically when the setting changes.

### Metallic/Robotic Voice

**Symptom:** Voice sounds robotic and low-quality.

**Cause:** You're likely hearing Web Speech API (Electron's built-in speech synthesis), not Kokoro.

**Fix:**
1. Verify Kokoro is installed (see [Kokoro Setup](#kokoro-setup-recommended))
2. Set engine to "Kokoro" in Settings > Text-to-Speech > Engine
3. Press TTS play — check the Notice confirms "Using Kokoro engine"

### Kokoro Not Available

**Symptom:** Notice says "Kokoro not available, using macOS Say."

**Checks:**
1. Verify venv exists: `ls ~/.local/share/mlx-tts-venv/bin/python3`
2. Verify mlx-audio works: `~/.local/share/mlx-tts-venv/bin/python3 -c "import mlx_audio"`
3. If Python 3.14, downgrade to 3.12 (`brew install python@3.12` and recreate venv)
4. If `misaki` errors, pin version: `pip install 'misaki==0.7.4'`

### First Sentence Delay

**Symptom:** Several seconds of silence before first sentence plays.

**Cause:** Normal — Kokoro loads the model on first inference (~2-3 seconds). Subsequent sentences generate faster.

### Console Debugging

Open Developer Console (`Cmd+Opt+I`) and look for:
- `[TTS Factory]` — shows which engine was created
- `[Kokoro]` — shows availability check results
- `[TTS]` — shows initialization and state changes

---

## Architecture

### File Structure

```
src/tts/
├── tts-types.ts          # Interfaces: TTSEngine, TTSVoice, SpeakOptions, TTSState
├── tts-service.ts        # Main orchestrator: sentence queue, playback state, events
├── engine-factory.ts     # Engine detection and creation
├── kokoro-engine.ts      # MLX Kokoro via Python subprocess + afplay
├── mac-say-engine.ts     # macOS native `say` command
├── web-speech-engine.ts  # Web Speech API fallback
└── index.ts              # Public exports

src/parser/
├── text-cleaner.ts       # Strip YAML, code blocks, HTML → clean prose
└── citation-resolver.ts  # Parse .bib files, resolve [@key] → APA format
```

### Audio Playback Flow (Kokoro)

```
1. User presses Play
2. TTSService.play() → speakCurrentSentence()
3. KokoroEngine.speak(text, options)
   a. Spawn Python subprocess: generate_audio() → WAV file in /tmp/
   b. Python exits, stdout contains "DONE:filename.wav"
   c. Spawn `afplay` subprocess to play the WAV
   d. SIGSTOP/SIGCONT for pause/resume
   e. On playback complete → endCallback → next sentence
4. TTSService advances to next sentence → repeat from step 3
```

### Vite Configuration

Node.js modules used by TTS engines must be externalized in `vite.config.ts`:

```typescript
external: ['obsidian', 'ws', 'electron', 'fs', 'path', 'os', 'child_process', 'crypto']
```

Without this, Vite tries to bundle them → silently unavailable at runtime → engine falls back to Web Speech.
