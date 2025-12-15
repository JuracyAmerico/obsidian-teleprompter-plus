# Speech-Based Scrolling Research & Analysis

**Date**: 2025-10-15
**Purpose**: Evaluate speech-based scrolling for Obsidian Teleprompter Plus
**Status**: Research & Planning Phase

---

## 🎯 What is Speech-Based Scrolling?

Speech-based scrolling automatically adjusts the teleprompter's scroll speed based on the user's speaking pace. Instead of constant-speed auto-scrolling, the script moves naturally with your voice.

### How It Works:
1. **Capture audio** from microphone
2. **Recognize speech** in real-time
3. **Track speaking position** in script
4. **Auto-scroll** to match current words
5. **Adapt speed** to speaking pace

---

## ✅ Benefits

### For Users:
- **Hands-free operation** - No Stream Deck, pedals, or manual control needed
- **Natural pacing** - Script follows your actual speaking speed
- **Adaptive** - Automatically slows when you pause, speeds up when flowing
- **Professional** - Used in broadcast studios worldwide
- **Accessibility** - Great for users who can't operate manual controls
- **Focus** - No need to think about scrolling, just read

### Use Cases:
- **Video recording** - Keep both hands free for gestures
- **Live presentations** - No visible equipment to distract audience
- **Podcasting** - Natural conversation flow
- **Accessibility** - Motor impairment support
- **Professional broadcasting** - TV studio quality

---

## ⚠️ Challenges

### Technical:
- **Accuracy** - Speech recognition must be highly reliable
- **Latency** - Real-time processing required (<100ms delay)
- **Privacy** - Audio processing raises privacy concerns
- **Resource usage** - CPU/memory intensive
- **Complexity** - Significant implementation and testing effort
- **Browser dependency** - Web Speech API not universally supported

### User Experience:
- **Noisy environments** - Background noise affects accuracy
- **Accents/dialects** - May not work well for all speakers
- **Off-script** - What happens when user deviates from script?
- **Mispronunciation** - Could cause scrolling to stop or jump
- **Learning curve** - Users need to understand how it works

---

## 🔍 Open Source Solutions Available

### 1. **Voice-Activated Teleprompter** (jlecomte)

**Repository**: https://github.com/jlecomte/voice-activated-teleprompter

**Tech Stack**:
- React + Redux
- Vite (build tool)
- Bulma (CSS framework)
- **Web Speech API** (browser-based)

**Features**:
- ✅ 6 languages supported (English, French, German, Italian, Portuguese, Spanish)
- ✅ Browser language auto-detection
- ✅ Click-to-reset for specific sections
- ✅ Robust error handling (handles off-script, mispronunciation)
- ✅ Web-based SPA (single-page application)

**Limitations**:
- ⚠️ Chrome only (Web Speech API)
- ⚠️ Not tested in other browsers
- ⚠️ Web-only (not Electron-specific)

**Pros for Us**:
- ✅ Open source (can study implementation)
- ✅ Proven solution that "actually works"
- ✅ Handles edge cases (off-script, errors)
- ✅ React architecture similar to our Svelte approach

**Cons for Us**:
- ⚠️ React-based (we use Svelte)
- ⚠️ Would need significant porting effort

---

### 2. **Echo-Prompter** (sherwinvishesh)

**Repository**: https://github.com/sherwinvishesh/Echo-Prompter

**Tech Stack**:
- HTML, CSS, JavaScript
- **Web Speech API**
- Apache-2.0 License

**Features**:
- ✅ Real-time speech recognition
- ✅ Voice command navigation
- ✅ Customizable (text size, speed, colors)
- ✅ Language selection
- ✅ Responsive design
- ✅ Modern web-based

**Limitations**:
- ⚠️ May have inaccuracies in noisy environments
- ⚠️ Background disturbances affect performance
- ⚠️ No explicit Electron compatibility mentioned

**Pros for Us**:
- ✅ Simple vanilla JavaScript (easier to port)
- ✅ Web Speech API (standard browser API)
- ✅ Lightweight implementation
- ✅ Apache-2.0 license (compatible with MIT)

**Cons for Us**:
- ⚠️ Less mature than jlecomte's solution
- ⚠️ May lack robust error handling

---

### 3. **TeleKast**

**Platform**: SourceForge
**License**: Open source

**Features**:
- Scripts creation and content generation
- Open source desktop application

**Status**:
- ⚠️ Less information available
- ⚠️ May be less actively maintained
- ⚠️ Not clear if speech-based scrolling is supported

---

## 🛠️ Technology Options

### Option 1: Web Speech API (Browser Native)

**What it is**: Built-in browser API for speech recognition

**Browser Support**:
- ✅ Chrome/Edge (excellent support)
- ✅ Safari (good support)
- ❌ Firefox (limited/experimental)

**Pros**:
- ✅ No external dependencies
- ✅ Works in Electron (Chromium-based)
- ✅ Free to use
- ✅ Real-time streaming
- ✅ Multiple languages supported
- ✅ Low latency

**Cons**:
- ❌ Chrome/Chromium only (limits Firefox users)
- ❌ Requires internet connection (sends to Google servers)
- ❌ Privacy concerns (audio sent to cloud)
- ❌ API can be unstable
- ❌ Limited customization

**Code Example**:
```javascript
const recognition = new webkitSpeechRecognition()
recognition.continuous = true
recognition.interimResults = true
recognition.lang = 'en-US'

recognition.onresult = (event) => {
  const transcript = event.results[event.results.length - 1][0].transcript
  // Match transcript to script and scroll
}

recognition.start()
```

**Works in Obsidian?** ✅ **YES** - Electron uses Chromium, supports Web Speech API

---

### Option 2: Whisper.cpp (Local Processing)

**What it is**: OpenAI's Whisper speech recognition, compiled to C++ for performance

**Tech Stack**:
- C++ core
- WebAssembly (WASM) for browser
- Node.js bindings for Electron
- Real-time streaming example available

**Pros**:
- ✅ Runs locally (privacy-friendly, no cloud)
- ✅ Works offline
- ✅ Very accurate (state-of-the-art)
- ✅ 99+ languages supported
- ✅ No API costs
- ✅ Full control over processing
- ✅ WASM version runs in browser (no server needed)
- ✅ Real-time streaming mode available

**Cons**:
- ❌ High resource usage (CPU/RAM intensive)
- ❌ Larger file size (~100MB+ models)
- ❌ More complex integration
- ❌ Moderate latency (2-3x real-time: 60s audio = ~20-30s processing)
- ❌ Requires WASM SIMD support in browser
- ❌ Performance varies by model size (tiny/base models faster)

**Real-Time Streaming Details (2024 Update)**:
- ✅ **Real-time streaming mode exists**: https://whisper.ggerganov.com/stream/
- ✅ Streams chunks of text as it processes
- ✅ Runs entirely in browser via WASM
- ✅ Audio stays local (privacy-friendly)
- ⚠️ Performance: 2-3x real-time (tiny/base models on modern CPU)
- ⚠️ Not as fast as Vosk for continuous recognition
- ⚠️ Best with tiny/base models for acceptable latency

**Live Demo**:
- Stream example: https://whisper.ggerganov.com/stream/
- Alternative: https://ggml.ai/whisper.cpp/stream.wasm/
- GitHub: https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm

**Works in Obsidian?** ⚠️ **POSSIBLE** - WASM version works in Electron, but performance may be limiting for real-time teleprompter use

**Recommendation**: ⚠️ Better for batch transcription than real-time teleprompter. Consider Vosk instead for continuous recognition.

---

### Option 3: Vosk (Offline Recognition) ⭐ **BEST LOCAL SOLUTION**

**What it is**: Lightweight offline speech recognition toolkit

**Tech Stack - THREE OPTIONS**:

#### Option 3A: **vosk-browser** (WebAssembly) ⭐ **EASIEST FOR OBSIDIAN**
- Pure JavaScript/WebAssembly (no native bindings!)
- Package: `vosk-browser` (npm)
- Runs in WebWorker
- Small models (50MB)
- 13+ languages

**Pros**:
- ✅ **No server required** - Runs 100% client-side in browser
- ✅ **Works in Electron without issues** - No native module problems
- ✅ Pure WebAssembly (like whisper.cpp but better performance)
- ✅ Runs in WebWorker (doesn't block main thread)
- ✅ Designed for browser use
- ✅ Easy npm install: `npm i vosk-browser`
- ✅ Real-time streaming
- ✅ Completely offline
- ✅ Privacy-friendly (no cloud)

**Cons**:
- ⚠️ Last updated 3 years ago (but still works)
- ⚠️ WebAssembly requires WASM support (all modern browsers have it)
- ❌ Less accurate than Whisper

**Live Demo**: https://ccoreilly.github.io/vosk-browser/

**GitHub**: https://github.com/ccoreilly/vosk-browser

**Perfect for Obsidian**: ✅ **YES** - Pure JS/WASM, no native bindings, no server needed!

---

#### Option 3B: **vosk** (Node.js Native Bindings)
- Native Node.js module
- Package: `vosk` (npm)
- 20+ languages
- Small models (50MB)

**Pros**:
- ✅ Better performance than WASM
- ✅ More languages supported
- ✅ Official Vosk package
- ✅ Real-time streaming

**Cons**:
- ❌ Native module issues in Electron (requires rebuild)
- ❌ Complex setup with Electron
- ❌ Platform-specific compilation

---

#### Option 3C: **electron-vosk-speech**
- Electron-specific wrapper
- Package: `electron-vosk-speech` (npm)
- Example: https://github.com/gormonn/electron-vosk-speech

**Pros**:
- ✅ Designed for Electron
- ✅ Handles native bindings

**Cons**:
- ⚠️ Not actively maintained
- ❌ Still has native module complexity

---

**Recommendation for Obsidian Teleprompter Plus**:

⭐ **Use vosk-browser (Option 3A)**

**Why**:
- No server required - runs entirely client-side
- No native module issues - pure WebAssembly
- Easy to integrate with Svelte
- Works perfectly in Electron
- WebWorker keeps UI responsive
- Same privacy/offline benefits as native Vosk

---

### Option 4: Deepgram (Cloud API)

**What it is**: Commercial real-time speech recognition API with free tier

**Pros**:
- ✅ Very accurate
- ✅ Real-time streaming
- ✅ Low latency
- ✅ Easy integration
- ✅ Free tier available

**Cons**:
- ❌ Requires API key
- ❌ Cloud-based (privacy concerns)
- ❌ Requires internet
- ❌ Cost for heavy usage
- ❌ Not open source

**Works in Obsidian?** ✅ **YES** - But not recommended (API key, privacy, cost)

---

## 📊 Comparison Matrix

| Feature | Web Speech API | Whisper.cpp | vosk-browser ⭐ | Deepgram |
|---------|---------------|-------------|----------------|----------|
| **Accuracy** | Good | Excellent | Good | Excellent |
| **Latency** | Low (~100ms) | Medium (~300ms) | Low (~150ms) | Low (~100ms) |
| **Privacy** | ❌ Cloud | ✅ Local | ✅ Local | ❌ Cloud |
| **Offline** | ❌ No | ✅ Yes | ✅ Yes | ❌ No |
| **Resource Usage** | Low | High | Low | Low |
| **Integration Complexity** | Easy | Hard | **Easy** | Easy |
| **Server Required** | ❌ Cloud | ❌ No | ❌ **No** | ❌ Cloud |
| **Native Modules** | ❌ No | ⚠️ Complex | ❌ **No (WASM)** | ❌ No |
| **Cost** | Free | Free | Free | Free tier |
| **Real-Time** | ✅ Excellent | ⚠️ 2-3x | ✅ Excellent | ✅ Excellent |
| **Continuous** | ✅ Yes | ⚠️ Chunked | ✅ Yes | ✅ Yes |
| **WebWorker** | ❌ No | ⚠️ Manual | ✅ **Built-in** | ❌ No |
| **Languages** | Many | 99+ | 13+ | Many |
| **Model Size** | N/A | 100MB+ | 50MB | N/A |
| **Browser Support** | Chrome only | Universal | **Universal (WASM)** | Universal |
| **Electron Issues** | ❌ None | ⚠️ WASM setup | ❌ **None** | ❌ None |
| **Best For** | Quick POC | Transcription | **Obsidian Plugin** | Production API |

**Legend**:
- ⭐ = **RECOMMENDED** for Obsidian Teleprompter Plus
- ✅ = Excellent/Supported
- ⚠️ = Possible but limitations
- ❌ = Not supported/No issues

**Winner for Local + No Server**: ⭐ **vosk-browser** - Pure client-side WebAssembly, no server, no native modules!

---

## 🎯 Recommended Approach for Obsidian Teleprompter Plus

### Dual-Option Strategy: Best of Both Worlds

I recommend implementing **both** options to give users choice:

1. **Web Speech API** (default) - Quick, easy, cloud-based
2. **Vosk** (optional) - Privacy-focused, offline, local

### Phase 1: Proof of Concept with Web Speech API
**Technology**: Web Speech API (Cloud-based)
**Effort**: Low
**Timeline**: 1-2 days

**Why Start Here**:
- ✅ Already works in Electron/Chromium
- ✅ No dependencies to bundle
- ✅ Real-time streaming perfect for teleprompter
- ✅ Can learn from existing open-source implementations
- ✅ Fast to prototype and test
- ✅ Prove the concept before investing in Vosk

**Implementation Plan**:
1. Add microphone permission request
2. Integrate Web Speech API with continuous recognition
3. Match transcript words to script text
4. Calculate scroll position based on matched words
5. Add UI controls (enable/disable, language selection)
6. Handle edge cases (off-script, pauses, errors)

### Phase 1b: Add Vosk for Local/Offline Support (Optional)
**Technology**: Vosk (Local processing)
**Effort**: Medium
**Timeline**: 3-5 days

**Why Add This**:
- ✅ Privacy-focused users want local processing
- ✅ Works offline (no internet required)
- ✅ No cloud dependency
- ✅ Electron-ready with `vosk` npm package
- ✅ Small models (50MB) vs Whisper (100MB+)
- ✅ Real-time continuous recognition

**Implementation Plan**:
1. Install `vosk` npm package
2. Download Vosk model (English 50MB to start)
3. Implement Vosk recognizer with streaming API
4. Reuse matching algorithm from Web Speech API
5. Add settings toggle: "Use local recognition (Vosk)"
6. Bundle model with plugin or download on first use

**User Choice in Settings**:
```
Speech Recognition:
○ Web Speech API (Cloud, requires internet)
○ Vosk (Local, offline, privacy-focused)
```

**Code Example**:
```typescript
// In TeleprompterApp.svelte
let speechRecognition: any = null
let isVoiceScrollEnabled = $state(false)

function initVoiceSpeech() {
  if (!('webkitSpeechRecognition' in window)) {
    console.error('Speech recognition not supported')
    return
  }

  speechRecognition = new webkitSpeechRecognition()
  speechRecognition.continuous = true
  speechRecognition.interimResults = true
  speechRecognition.lang = 'en-US'

  speechRecognition.onresult = (event: any) => {
    const transcript = event.results[event.results.length - 1][0].transcript
    const matchedPosition = findTextPosition(transcript)
    if (matchedPosition) {
      scrollToPosition(matchedPosition)
    }
  }

  speechRecognition.onerror = (event: any) => {
    console.error('Speech recognition error:', event.error)
  }

  speechRecognition.start()
}

function findTextPosition(spokenText: string): number | null {
  // Find where in the script the user is speaking
  const scriptText = content.toLowerCase()
  const spoken = spokenText.toLowerCase().trim()
  const index = scriptText.indexOf(spoken)
  return index >= 0 ? index : null
}

function scrollToPosition(textPosition: number) {
  // Calculate scroll position from text position
  // This is simplified - real implementation would need DOM mapping
  const scrollFraction = textPosition / content.length
  const scrollTarget = scrollFraction * contentArea.scrollHeight
  contentArea.scrollTop = scrollTarget
}
```

---

### Phase 2: Production Implementation (If Phase 1 Successful)
**Timeline**: 1-2 weeks

**Features to Add**:
1. **Smart matching algorithm**
   - Fuzzy text matching (handles small errors)
   - Word proximity scoring
   - Context-aware positioning

2. **User controls**
   - Toggle button for voice scroll
   - Language selection
   - Sensitivity/confidence threshold
   - Fallback to manual scroll

3. **Error handling**
   - Graceful degradation on errors
   - Auto-restart on connection loss
   - Clear user feedback

4. **Settings integration**
   - Voice scroll enabled/disabled
   - Language preference
   - Confidence threshold
   - Auto-start with playback

5. **Stream Deck integration**
   - Toggle voice scroll
   - Change language
   - Set confidence level

6. **Visual feedback**
   - Microphone indicator (listening/processing)
   - Confidence meter
   - Highlighted current position

---

### Phase 3: Advanced Features (Optional)
**Timeline**: 2-4 weeks

1. **Offline support with Vosk**
   - Bundle Vosk models (~50MB)
   - Node.js integration via Electron
   - Fallback to Web Speech API if Vosk fails

2. **Multi-language support**
   - Detect language automatically
   - Switch languages mid-session
   - Language-specific optimizations

3. **Smart script analysis**
   - Pre-process script for speech patterns
   - Identify difficult words/phrases
   - Suggest pronunciation improvements

4. **Training mode**
   - Record user's voice profile
   - Improve accuracy over time
   - Custom vocabulary additions

---

## 🚧 Challenges to Solve

### 1. Text Matching Accuracy
**Problem**: Spoken words may not exactly match script text
**Solutions**:
- Use fuzzy matching algorithms (Levenshtein distance)
- Implement word proximity scoring
- Allow for small variations/errors
- Use context windows (match phrases, not just words)

### 2. Off-Script Handling
**Problem**: User deviates from script or adds ad-libs
**Solutions**:
- Continue listening for next matching phrase
- Don't scroll if confidence is low
- Highlight last known position
- Manual override always available

### 3. Punctuation and Formatting
**Problem**: Script has formatting, but speech doesn't
**Solutions**:
- Strip formatting for matching (bold, italic, etc.)
- Ignore YAML frontmatter
- Handle code blocks gracefully
- Focus on readable text only

### 4. Performance
**Problem**: Real-time text matching could be slow
**Solutions**:
- Pre-process script into searchable index
- Use Web Workers for matching algorithm
- Throttle/debounce matching calls
- Cache recent matches

### 5. Privacy
**Problem**: Web Speech API sends audio to Google
**Solutions**:
- Clear disclosure in UI
- Optional feature (opt-in)
- Consider Vosk for offline alternative
- Add privacy settings documentation

---

## 💭 My Recommendation

### ✅ **YES, Add Speech-Based Scrolling!**

**Why**:
1. **Unique differentiator** - Very few Obsidian plugins have this
2. **Professional feature** - Matches or exceeds commercial teleprompters
3. **Relatively easy** - Web Speech API makes POC simple
4. **High impact** - Significant value for video creators/presenters
5. **Good timing** - Open-source examples to learn from
6. **Accessibility win** - Helps users with motor impairments

**Recommended Implementation**:
- **Start with**: Web Speech API (Phase 1 POC)
- **Test thoroughly**: With different accents, speeds, scripts
- **Iterate based on feedback**: Real users will reveal edge cases
- **Consider**: Vosk for offline mode in future (Phase 3)

**Priority**: 🟡 **Medium-High** (Phase 4 feature)
- Not essential for core functionality
- But highly valuable differentiator
- Should come after Phase 3 polish and testing

---

## 📋 Implementation Roadmap

### v0.6.0 - Voice Scroll Proof of Concept
- [ ] Web Speech API integration
- [ ] Basic text matching algorithm
- [ ] Toggle button in UI
- [ ] Microphone permission handling
- [ ] Simple visual feedback (mic icon)
- [ ] Language selection (English only to start)
- [ ] Error handling and fallback

**Effort**: 2-3 days
**Risk**: Low (can always remove if it doesn't work well)

### v0.7.0 - Voice Scroll Production Ready
- [ ] Improved matching algorithm (fuzzy matching)
- [ ] Multi-language support (5+ languages)
- [ ] Settings panel integration
- [ ] Stream Deck controls
- [ ] Visual feedback improvements
- [ ] Confidence threshold setting
- [ ] Off-script handling
- [ ] Comprehensive testing

**Effort**: 1-2 weeks
**Risk**: Medium (complexity in edge cases)

### v0.8.0 - Voice Scroll Advanced
- [ ] Vosk offline mode (optional)
- [ ] Voice profile training
- [ ] Smart script analysis
- [ ] Performance optimizations
- [ ] Advanced settings
- [ ] Professional broadcast features

**Effort**: 2-4 weeks
**Risk**: High (offline mode is complex)

---

## 🔗 Resources

### Open Source Projects to Study:
- **Voice-Activated Teleprompter**: https://github.com/jlecomte/voice-activated-teleprompter
- **Echo-Prompter**: https://github.com/sherwinvishesh/Echo-Prompter

### Documentation:
- **Web Speech API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- **Whisper.cpp**: https://github.com/ggml-org/whisper.cpp
- **Vosk**: https://alphacephei.com/vosk/

### Electron Resources:
- **Electron Microphone Access**: https://www.electronjs.org/docs/latest/api/system-preferences
- **Web Speech in Electron**: Should work natively (Chromium-based)

---

## ✅ Conclusion & Updated Recommendation (2024)

**Speech-based scrolling is a valuable addition to Obsidian Teleprompter Plus.**

### 🎉 BREAKTHROUGH: vosk-browser - Perfect Local Solution!

**MAJOR FINDING**: vosk-browser runs **100% client-side with NO SERVER** using pure WebAssembly!

**Critical Discovery**:
- ✅ **vosk-browser**: WebAssembly, NO server, NO native modules, runs in browser!
- ✅ **Web Speech API**: Still best for quick POC and cloud-based option
- ⚠️ **Whisper.cpp**: Good for transcription, but 2-3x real-time (too slow for live scrolling)

### Why vosk-browser is a Game-Changer:

**No Server Required**:
- ✅ Runs entirely in browser via WebAssembly
- ✅ No backend, no API server, no Node.js server
- ✅ Just pure JavaScript + WASM in WebWorker
- ✅ Perfect for Obsidian plugin architecture

**No Native Module Issues**:
- ✅ Pure JavaScript/WebAssembly (no C++ bindings)
- ✅ Works in Electron without any special setup
- ✅ No platform-specific compilation
- ✅ No electron-rebuild nightmares

**Easy Integration**:
- ✅ Simple npm install: `npm i vosk-browser`
- ✅ Works like Web Speech API (same pattern)
- ✅ Runs in WebWorker (doesn't block UI)
- ✅ Download 50MB model once, works forever offline

### Recommended Implementation Path:

**Phase 1: POC with Web Speech API** (2-3 days)
- Prove the concept works
- Cloud-based (easy to test)
- Validate UI/UX flow
- Test matching algorithm

**Phase 2: Add vosk-browser for Local Option** (2-3 days) ⚡ **EASIER THAN EXPECTED!**
- No server setup needed!
- No native modules to compile!
- Just npm install + load model
- Reuse matching algorithm from Phase 1
- WebWorker handles threading automatically

**Phase 3: Polish & Settings** (1 week)
- Settings toggle: "Web Speech API" vs "Local (vosk-browser)"
- Model download UI (50MB, one-time)
- Language selection (13 languages)
- Confidence thresholds
- Error handling

### Timeline Summary (UPDATED):
- **POC (Web Speech API)**: 2-3 days
- **Local support (vosk-browser)**: 2-3 days ⚡ **(Faster than expected!)**
- **Production polish**: 1 week
- **Total**: 2 weeks for complete dual-engine implementation

### Impact Assessment:
- 🎯 **High impact** - Professional feature that sets us apart
- 🔒 **Privacy win** - Local processing WITHOUT server complexity
- ♿ **Accessibility** - Hands-free operation
- 🌍 **Offline capable** - Works without internet
- ⚡ **Easy maintenance** - No native modules to maintain
- 🎁 **Bonus**: No server infrastructure needed!

### Final Recommendation:

✅ **Add to Phase 4 roadmap with dual-option approach**

**Strategy**:
1. Ship Web Speech API first (v0.6.0) - 2-3 days
2. Add vosk-browser local option (v0.6.1) - 2-3 days ⚡ **SIMPLE!**
3. Let users choose based on their privacy/connectivity needs

**Why this is BETTER than expected**:
- No server to build, deploy, or maintain
- No native module compilation issues
- Just pure JavaScript/WASM (Obsidian-friendly)
- WebWorker keeps everything smooth
- Works offline with zero infrastructure

This gives the best of both worlds: **quick implementation** + **privacy respect** + **zero complexity**! 🎉

---

**Next Steps**:
1. Complete Phase 3 testing and polish
2. Gather user feedback on existing features
3. Prototype Web Speech API integration
4. Test with real scripts and use cases
5. Decide on v0.6.0 scope based on POC results
