# ElevenLabs Cloud TTS Setup

**Version:** 1.0.0
**Last Updated:** 2026-06-02

Teleprompter Plus can read your script aloud with **ElevenLabs** neural voices. This is an
**optional, cloud, paid** engine that sits alongside the built-in offline engines (Kokoro,
macOS `say`, Web Speech). It is **bring-your-own-key** and is **never selected automatically** —
you must turn it on explicitly.

---

## Table of Contents

1. [When to use it](#when-to-use-it)
2. [Get an API key](#get-an-api-key)
3. [Enable it (the two-part step)](#enable-it-the-two-part-step)
4. [Models](#models)
5. [Voice ID](#voice-id)
6. [Privacy & cost](#privacy--cost)
7. [How to verify it's actually being used](#how-to-verify-its-actually-being-used)
8. [Gotchas](#gotchas)
9. [Troubleshooting](#troubleshooting)

---

## When to use it

Use ElevenLabs when you want the highest-quality, most natural narration and you're online and
fine spending API credits. For fully offline, free, private narration, stay on **Kokoro**
(Apple Silicon), **macOS `say`**, or **Web Speech** — those remain the defaults.

## Get an API key

1. Sign in at [elevenlabs.io](https://elevenlabs.io).
2. Profile → **API Keys** → create a key.
3. Copy it. The free tier covers light testing; heavier use needs a paid plan.

## Enable it (the two-part step)

ElevenLabs has **two** controls, and both must be set — this trips people up:

1. **Pick the engine.** Settings → Teleprompter Plus → **Text-to-speech** → **Speech engine**
   card → **Engine** dropdown → choose **"ElevenLabs (cloud, paid — needs API key)"**.
   A one-time cloud/paid notice appears.
2. **Fill the ElevenLabs card.** In the same Text-to-speech section, open the
   **"ElevenLabs (cloud, paid)"** card and paste your **API key**, pick a **Model**, and set a
   **Voice ID** (defaults to Rachel).

> Filling the ElevenLabs card alone is **not** enough — if the **Engine** dropdown is still on
> `auto`, ElevenLabs is skipped (auto only ever picks offline engines). This is the #1 reason
> "it's not using ElevenLabs."

After setting the key, **reload Obsidian** (Cmd/Ctrl+R) so the engine rebuilds with the key
(see [Gotchas](#gotchas)).

## Models

| Model | When |
|-------|------|
| `eleven_flash_v2_5` | Fastest (~75 ms), cheapest — great default for a teleprompter |
| `eleven_turbo_v2_5` | Low latency, higher quality than Flash |
| `eleven_multilingual_v2` | Best quality, non-English support |

## Voice ID

Paste any ElevenLabs voice ID. Default is **Rachel** (`21m00Tcm4TlvDq8ikWAM`). Find more — or
your own cloned voices — in your ElevenLabs **Voice Library**.

## Privacy & cost

- **Cloud:** when this engine is active, the **text of the script you read is sent to
  ElevenLabs servers** to synthesize audio.
- **Paid:** playback consumes credits on **your** ElevenLabs account (per character).
- **Opt-in only:** no key ships with the plugin, and nothing is sent unless you select the
  engine. Per-sentence audio is cached so re-reading the same script doesn't re-bill it.
- Prefer everything local and free? Use Kokoro, macOS `say`, or Web Speech.

## How to verify it's actually being used

- When playback starts, a **Notice** shows "TTS: Using **ElevenLabs** engine". If it says
  Kokoro or macOS Say, the engine fell back (usually the `auto`/key issue above).
- The voice itself: ElevenLabs "Rachel" is clearly more natural than macOS `say`.
- **Definitive:** open [elevenlabs.io → Usage](https://elevenlabs.io), play a paragraph, refresh
  — your character credits will have decremented.
- **Do NOT rely on the DevTools Network tab.** The plugin calls the API through Obsidian's
  `requestUrl`, which runs in the main process — so these requests are **invisible** to the
  renderer's Network panel even when working correctly.

## Gotchas

- **Engine selector is separate from the ElevenLabs card.** Set both (see above).
- **Changing the key/voice while ElevenLabs is already active doesn't re-initialize the
  engine.** After editing the key or voice, **reload Obsidian** (or toggle the Engine dropdown
  away and back) so the engine is rebuilt with the new values.
- **`requestUrl` traffic doesn't appear in DevTools → Network.** Verify via the ElevenLabs
  Usage dashboard instead.

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| Hear an offline voice, not ElevenLabs | Engine dropdown is on `auto` or another engine — set it to ElevenLabs, reload. |
| Console shows HTTP **401** | Invalid API key — re-paste it. |
| Console shows HTTP **422** | Bad voice ID — check the Voice ID field. |
| Console shows HTTP **429** | Rate limit / out of credits — check your ElevenLabs plan. |
| Set the key but still falls back | Engine initialized before the key was saved — reload Obsidian so it rebuilds with the key. |
| No requests in DevTools Network | Expected — `requestUrl` bypasses it. Confirm via elevenlabs.io → Usage. |
