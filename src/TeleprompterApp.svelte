<script lang="ts">
  import type { App as ObsidianApp } from 'obsidian'
  import { MarkdownView, setIcon } from 'obsidian'
  import { onMount } from 'svelte'
  import { marked } from 'marked'
  import { VOICE_TRACKING_PRESETS, type VoiceTrackingPacePreset } from './settings'
  import type { VoiceTrackingService } from './voice'
  import hljs from 'highlight.js/lib/core'
  // Import common languages for syntax highlighting
  import javascript from 'highlight.js/lib/languages/javascript'
  import typescript from 'highlight.js/lib/languages/typescript'
  import python from 'highlight.js/lib/languages/python'
  import bash from 'highlight.js/lib/languages/bash'
  import shell from 'highlight.js/lib/languages/shell'
  import json from 'highlight.js/lib/languages/json'
  import markdown from 'highlight.js/lib/languages/markdown'

  // Register languages
  hljs.registerLanguage('javascript', javascript)
  hljs.registerLanguage('typescript', typescript)
  hljs.registerLanguage('python', python)
  hljs.registerLanguage('bash', bash)
  hljs.registerLanguage('shell', shell)
  hljs.registerLanguage('json', json)
  hljs.registerLanguage('markdown', markdown)

  // Create custom renderer to add IDs to headers
  const renderer = new marked.Renderer()
  let headerCounter = 0 // Counter for generating header IDs

  // Override heading renderer to add IDs and data attributes
  // New marked.js API uses an object parameter
  renderer.heading = function({ text, depth }) {
    const headerId = `header-${headerCounter++}`
    const level = depth // depth is 1, 2, 3, etc.
    return `<h${level} id="${headerId}" data-header-id="${headerId}">${text}</h${level}>\n`
  }

  // Configure marked to use highlight.js and custom renderer
  marked.setOptions({
    renderer: renderer,
    highlight: function (code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value
        } catch (err) {
          console.error('Syntax highlighting error:', err)
        }
      }
      return code // Return unhighlighted if language not found
    },
    breaks: true, // Convert \n to <br>
    gfm: true // Enable GitHub Flavored Markdown
  })

  import type TeleprompterPlusPlugin from './main'

  let { app, plugin, ownerDocument, ownerWindow }: {
    app: ObsidianApp,
    plugin: TeleprompterPlusPlugin,
    ownerDocument: Document,
    ownerWindow: Window
  } = $props()

  // Use owner document/window for popout window support
  // NOTE: Props are captured BEFORE element is in popout DOM, so for event listeners
  // we must get document/window from the actual mounted element at runtime.
  // These are fallbacks for early initialization before element is mounted.
  const activeDoc = ownerDocument
  const activeWin = ownerWindow

  // Helper functions to get actual document/window from mounted element
  // These return the correct document even in popout windows
  function getActualDocument(): Document {
    return teleprompterContainer?.ownerDocument || document
  }

  function getActualWindow(): Window {
    return teleprompterContainer?.ownerDocument?.defaultView || window
  }

  // ==========================================================================
  // BroadcastChannel for syncing state between main and popout windows
  // ==========================================================================
  const stateChannel = new BroadcastChannel('teleprompter-state-sync')
  let isReceivingBroadcast = $state(false) // Prevent echo loops (must be $state for reactivity)

  interface SyncState {
    isPlaying?: boolean
    speed?: number
    fontSize?: number
    showEyeline?: boolean
    eyelinePosition?: number
    showNavigation?: boolean
    autoPauseOnEdit?: boolean
    textColor?: string
    backgroundColor?: string
    lineHeight?: number
    letterSpacing?: number
    opacity?: number
    textAlignment?: string
    scrollPosition?: number
    countdownSeconds?: number
    isPinned?: boolean
    isKeepAwake?: boolean
    flipHorizontal?: boolean
    flipVertical?: boolean
    viewMode?: string
    progressIndicatorStyle?: string
    fontFamily?: string
    paddingTop?: number
    paddingRight?: number
    paddingBottom?: number
    paddingLeft?: number
    showMinimap?: boolean
    isFullScreen?: boolean
    focusMode?: boolean
  }

  function broadcastState(partialState: SyncState) {
    if (isReceivingBroadcast) return // Don't echo back
    stateChannel.postMessage({ type: 'state-update', data: partialState })
  }

  // Image file extensions
  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif'])

  /**
   * Check if a filename has an image extension
   */
  function isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    return IMAGE_EXTENSIONS.has(ext)
  }

  /**
   * Diagram types that should be replaced with placeholders
   * These are code blocks that render as diagrams in Obsidian but would show as raw code in teleprompter
   */
  const DIAGRAM_LANGUAGES = new Set(['mermaid', 'plantuml', 'graphviz', 'dot', 'ditaa', 'tikz'])

  /**
   * Extract the diagram type from mermaid content (flowchart, sequence, etc.)
   */
  function getMermaidDiagramType(content: string): string {
    const firstLine = content.trim().split('\n')[0].toLowerCase()

    const typeMap: Record<string, string> = {
      'flowchart': 'Flowchart',
      'graph': 'Graph',
      'sequencediagram': 'Sequence Diagram',
      'sequence': 'Sequence Diagram',
      'classDiagram': 'Class Diagram',
      'class': 'Class Diagram',
      'statediagram': 'State Diagram',
      'state': 'State Diagram',
      'erdiagram': 'ER Diagram',
      'er': 'ER Diagram',
      'journey': 'User Journey',
      'gantt': 'Gantt Chart',
      'pie': 'Pie Chart',
      'quadrantchart': 'Quadrant Chart',
      'requirementdiagram': 'Requirement Diagram',
      'gitgraph': 'Git Graph',
      'mindmap': 'Mind Map',
      'timeline': 'Timeline',
      'zenuml': 'ZenUML Diagram',
      'sankey': 'Sankey Diagram',
      'xy': 'XY Chart',
      'block': 'Block Diagram',
    }

    for (const [key, label] of Object.entries(typeMap)) {
      if (firstLine.startsWith(key.toLowerCase())) {
        return label
      }
    }

    return 'Diagram'
  }

  /**
   * Replace diagram code blocks (mermaid, plantuml, etc.) with readable placeholders
   * This keeps the teleprompter clean while indicating a diagram exists
   */
  function replaceDiagramBlocks(text: string): string {
    // Pattern matches: ```mermaid ... ``` or ```plantuml ... ``` etc.
    const codeBlockPattern = /```(\w+)\n([\s\S]*?)```/g

    return text.replace(codeBlockPattern, (match, language: string, content: string) => {
      const lang = language.toLowerCase()

      if (!DIAGRAM_LANGUAGES.has(lang)) {
        return match // Keep non-diagram code blocks as-is
      }

      // Get specific diagram type for mermaid
      let diagramType = language.charAt(0).toUpperCase() + language.slice(1)
      if (lang === 'mermaid') {
        diagramType = getMermaidDiagramType(content)
      }

      // Return a styled placeholder
      return `<div class="diagram-placeholder">📊 <span class="diagram-type">${diagramType}</span></div>`
    })
  }

  /**
   * Convert Obsidian wiki-link embeds to rendered content
   * Handles: ![[image.png]], ![[note]], ![[note|heading]]
   * - Images: converts to standard markdown/HTML
   * - Notes: embeds the note content inline
   */
  function convertObsidianWikiLinks(text: string, sourcePath: string, processedPaths: Set<string> = new Set()): string {
    // Pattern matches: ![[filename]] or ![[filename|modifier]]
    const wikiLinkPattern = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

    return text.replace(wikiLinkPattern, (match, filename: string, modifier: string | undefined) => {
      try {
        // Clean up filename (remove any leading/trailing whitespace)
        const cleanFilename = filename.trim()

        // Try to find the file in the vault
        const file = app.metadataCache.getFirstLinkpathDest(cleanFilename, sourcePath)

        if (!file) {
          // File not found - return original text so user sees what's missing
          console.warn(`[WikiLink] File not found: ${cleanFilename}`)
          return match
        }

        // Check if this is an image file
        if (isImageFile(file.name)) {
          // Handle as image
          const resourcePath = app.vault.getResourcePath(file)

          // Parse modifier - could be size (number), dimensions (500x300), or alt text
          let alt = cleanFilename
          let sizeAttr = ''

          if (modifier) {
            const trimmedModifier = modifier.trim()
            // Check if it's a size specification (number or NxN)
            if (/^\d+$/.test(trimmedModifier)) {
              // Single number = width
              sizeAttr = ` style="width: ${trimmedModifier}px; height: auto;"`
              alt = cleanFilename
            } else if (/^\d+[xX×]\d+$/i.test(trimmedModifier)) {
              // Dimensions like 500x300
              const [width, height] = trimmedModifier.split(/[xX×]/)
              sizeAttr = ` style="width: ${width}px; height: ${height}px;"`
              alt = cleanFilename
            } else {
              // Treat as alt text
              alt = trimmedModifier
            }
          }

          // Return HTML img tag
          if (sizeAttr) {
            return `<img src="${resourcePath}" alt="${alt}"${sizeAttr} />`
          }
          return `![${alt}](${resourcePath})`
        }

        // Handle as embedded note (markdown file)
        // Check for circular references
        if (processedPaths.has(file.path)) {
          console.warn(`[WikiLink] Circular reference detected: ${file.path}`)
          return `<blockquote class="embed-error">⚠️ Circular embed: ${cleanFilename}</blockquote>`
        }

        // Read the note content synchronously from cache
        const cache = app.metadataCache.getFileCache(file)
        const noteContent = (app.vault as any).cachedRead ?
          '' : // We can't use cachedRead synchronously, need async approach
          ''

        // Use the cached content if available (stored in file metadata)
        // For now, we'll use a placeholder approach that works synchronously
        // We need to get the content from the leaf's editor or cache

        // Get content from vault cache (synchronous)
        let embeddedContent = ''

        // Access the internal cache (Obsidian stores file content)
        const cachedData = (app as any).vault.adapter

        // For embedded notes, we'll read synchronously if possible
        // Otherwise show a placeholder
        try {
          // Try to get content from Obsidian's internal file cache
          const fileCache = (app as any).vault.fileMap?.[file.path]
          if (fileCache) {
            // File exists in cache
          }

          // Since we can't read files synchronously in Obsidian without blocking,
          // we'll embed a reference that shows the note title
          // The full embed would require async processing during content update

          // For now, show embedded note as a styled blockquote
          const noteName = file.basename
          const heading = modifier ? `#${modifier}` : ''

          return `\n\n<div class="embedded-note" data-note-path="${file.path}"><div class="embedded-note-title">📄 ${noteName}${heading ? ` › ${modifier}` : ''}</div><div class="embedded-note-content"><!-- Embedded content loaded --></div></div>\n\n`
        } catch (readErr) {
          console.error(`[WikiLink] Error reading embedded note: ${cleanFilename}`, readErr)
          return `<blockquote class="embed-error">⚠️ Could not embed: ${cleanFilename}</blockquote>`
        }
      } catch (err) {
        console.error(`[WikiLink] Error converting: ${match}`, err)
        return match
      }
    })
  }

  /**
   * Process embedded notes asynchronously
   * Called after initial render to load embedded note content
   */
  async function processEmbeddedNotes(sourcePath: string, processedPaths: Set<string> = new Set()): Promise<void> {
    if (!contentArea) return

    const embeds = contentArea.querySelectorAll('.embedded-note[data-note-path]')

    for (const embed of embeds) {
      const notePath = embed.getAttribute('data-note-path')
      if (!notePath) continue

      // Check for circular references
      if (processedPaths.has(notePath)) {
        const contentDiv = embed.querySelector('.embedded-note-content')
        if (contentDiv) {
          contentDiv.innerHTML = '<p class="embed-error">⚠️ Circular reference</p>'
        }
        continue
      }

      const newProcessedPaths = new Set(processedPaths)
      newProcessedPaths.add(notePath)

      try {
        const file = app.vault.getAbstractFileByPath(notePath)
        if (file && 'extension' in file) {
          const noteContent = await app.vault.cachedRead(file as any)

          // Strip YAML frontmatter from embedded content
          const contentWithoutYaml = noteContent.replace(/^---\n[\s\S]*?\n---\n?/, '')

          // Process wiki-links in embedded content (with circular reference tracking)
          const processedContent = convertObsidianWikiLinks(contentWithoutYaml, notePath, newProcessedPaths)

          // Strip HTML comments
          const cleanContent = processedContent.replace(/<!--[\s\S]*?-->/g, '')

          // Render markdown
          const renderedContent = marked.parse(cleanContent) as string

          const contentDiv = embed.querySelector('.embedded-note-content')
          if (contentDiv) {
            contentDiv.innerHTML = renderedContent
          }

          // Recursively process any nested embeds
          await processEmbeddedNotes(notePath, newProcessedPaths)
        }
      } catch (err) {
        console.error(`[WikiLink] Error loading embedded note: ${notePath}`, err)
        const contentDiv = embed.querySelector('.embedded-note-content')
        if (contentDiv) {
          contentDiv.innerHTML = '<p class="embed-error">⚠️ Failed to load</p>'
        }
      }
    }
  }

  let content = $state('# Welcome to Teleprompter Plus! 🎬\n\nOpen a note in Obsidian to see it here!')
  let renderedHTML = $state('') // Rendered markdown HTML
  let isPlaying = $state(false)
  // Get plugin settings (plugin is now passed as a prop for reliable access)
  const settings = plugin?.settings || {}
  const debugMode = settings.debugMode || false

  // Reactive trigger for toolbar layout changes
  // Incrementing this forces orderedControls to re-compute
  let toolbarLayoutVersion = $state(0)

  // Listen for toolbar settings changes from Settings UI
  $effect(() => {
    const handleToolbarChange = () => {
      toolbarLayoutVersion++
      debugLog('[Teleprompter] Toolbar layout changed, refreshing controls')
    }

    activeDoc.addEventListener('teleprompter:toolbar-changed', handleToolbarChange)

    // Listen for auto-pause setting changes from Settings UI
    function handleAutoPauseChange(event: Event) {
      const customEvent = event as CustomEvent
      if (customEvent.detail?.enabled !== undefined) {
        autoPauseOnEdit = customEvent.detail.enabled
        debugLog(`[AutoPause] Setting changed from Settings UI: ${autoPauseOnEdit ? 'ENABLED' : 'DISABLED'}`)
      }
    }
    document.addEventListener('teleprompter:auto-pause-changed', handleAutoPauseChange)

    return () => {
      activeDoc.removeEventListener('teleprompter:toolbar-changed', handleToolbarChange)
      document.removeEventListener('teleprompter:auto-pause-changed', handleAutoPauseChange)
    }
  })

  // Helper function to check if a toolbar control is visible
  function isControlVisible(controlId: string): boolean {
    const hidden = plugin?.settings?.toolbarLayout?.hidden || []
    return !hidden.includes(controlId)
  }

  // Toolbar control definitions - maps IDs to their type for rendering
  type ToolbarControlType = 'icon-button' | 'text-button' | 'popup-slider' | 'popup-multi' | 'popup-list' | 'color-picker'

  interface ToolbarControlDef {
    id: string
    type: ToolbarControlType
    name: string
  }

  const TOOLBAR_CONTROL_DEFS: ToolbarControlDef[] = [
    // Core playback controls
    { id: 'play-pause', type: 'icon-button', name: 'Play/pause' },
    { id: 'speed', type: 'popup-slider', name: 'Speed' },
    { id: 'countdown', type: 'popup-slider', name: 'Countdown' },
    { id: 'reset', type: 'icon-button', name: 'Reset' },
    // Display controls
    { id: 'font-size', type: 'popup-slider', name: 'Font size' },
    { id: 'line-height', type: 'popup-slider', name: 'Line height' },
    { id: 'letter-spacing', type: 'popup-slider', name: 'Letter spacing' },
    { id: 'font-family', type: 'popup-list', name: 'Font family' },
    { id: 'opacity', type: 'popup-slider', name: 'Opacity' },
    { id: 'padding', type: 'popup-multi', name: 'Padding' },
    { id: 'text-color', type: 'color-picker', name: 'Text color' },
    { id: 'bg-color', type: 'color-picker', name: 'Background color' },
    // Feature toggles
    { id: 'eyeline', type: 'icon-button', name: 'Eyeline' },
    { id: 'focus-mode', type: 'icon-button', name: 'Focus mode' },
    { id: 'navigation', type: 'icon-button', name: 'Navigation' },
    { id: 'fullscreen', type: 'icon-button', name: 'Fullscreen' },
    { id: 'flip-h', type: 'icon-button', name: 'Flip horizontal' },
    { id: 'flip-v', type: 'icon-button', name: 'Flip vertical' },
    { id: 'minimap', type: 'icon-button', name: 'Minimap' },
    // Utility controls
    { id: 'auto-pause', type: 'icon-button', name: 'Auto-Pause' },
    { id: 'progress-indicator', type: 'icon-button', name: 'Progress indicator' },
    { id: 'alignment', type: 'icon-button', name: 'Text alignment' },
    { id: 'keep-awake', type: 'icon-button', name: 'Keep awake' },
    { id: 'pin', type: 'icon-button', name: 'Pin note' },
    { id: 'detach', type: 'icon-button', name: 'Open in Window' },
    { id: 'quick-presets', type: 'popup-list', name: 'Quick presets' },
    // Info displays
    { id: 'time-display', type: 'info-display', name: 'Time display' },
    // Voice tracking
    { id: 'voice-tracking', type: 'icon-button', name: 'Voice tracking' },
  ]

  // Build ordered list of visible toolbar controls from settings
  // Note: Reads fresh from plugin.settings to get latest changes
  function getOrderedToolbarControls(_version: number): ToolbarControlDef[] {
    // Read fresh settings from plugin (not cached)
    const currentSettings = plugin?.settings?.toolbarLayout || {}
    const primary = currentSettings.primary || []
    const secondary = currentSettings.secondary || []
    const hidden = currentSettings.hidden || []

    const ordered: ToolbarControlDef[] = []
    const addedIds = new Set<string>()

    // First add controls in primary order
    for (const id of primary) {
      if (hidden.includes(id)) continue
      const def = TOOLBAR_CONTROL_DEFS.find(d => d.id === id)
      if (def && !addedIds.has(id)) {
        ordered.push(def)
        addedIds.add(id)
      }
    }

    // Then add secondary controls
    for (const id of secondary) {
      if (hidden.includes(id)) continue
      const def = TOOLBAR_CONTROL_DEFS.find(d => d.id === id)
      if (def && !addedIds.has(id)) {
        ordered.push(def)
        addedIds.add(id)
      }
    }

    // Finally add any remaining enabled controls not yet added
    for (const def of TOOLBAR_CONTROL_DEFS) {
      if (hidden.includes(def.id)) continue
      if (!addedIds.has(def.id)) {
        ordered.push(def)
      }
    }

    return ordered
  }

  // Get the ordered controls (reactive - re-computes when toolbarLayoutVersion changes)
  const orderedControls = $derived(getOrderedToolbarControls(toolbarLayoutVersion))

  // Helper function for conditional logging
  function debugLog(...args: unknown[]) {
    if (debugMode) {
      console.debug(...args)
    }
  }

  let speed = $state(settings.defaultScrollSpeed || 2)
  let speedIncrement = settings.speedIncrement || 0.5

  // Speed presets for quick selection
  const SPEED_PRESETS = [0.5, 1, 1.5, 2, 3, 5] as const
  let currentPresetIndex = $state(SPEED_PRESETS.indexOf(2)) // Default to 2x
  let fontSize = $state(24) // Font size in pixels
  let contentArea: HTMLElement | undefined = $state()
  let showNavigation = $state(settings.rememberNavigationState ? (localStorage.getItem('teleprompter-navigation-open') === 'true') : false)
  let headerElements = $state<Map<string, HTMLElement>>(new Map())
  let currentFileName = $state('')
  let collapsedHeaders = $state<Set<string>>(new Set())
  let navigationWidth = $state(settings.defaultNavigationWidth || 250) // Default width in pixels
  let isResizing = $state(false)
  let yamlLineOffset = $state(0) // Track how many lines the YAML took
  let currentHeaderIndex = $state(0) // Track current header for next/previous navigation
  let countdownSeconds = $state(0) // Countdown delay before auto-scrolling (0 = disabled)
  let isCountingDown = $state(false) // Whether countdown is active
  let currentCountdown = $state(0) // Current countdown value
  let hasUsedCountdown = $state(false) // Track if countdown was already used (reset only on document change or explicit reset)
  let currentVisibleHeader = $state<string>('') // Track currently visible header text
  let isDraggingIndicator = $state(false) // Whether eyeline indicator is being dragged
  let eyelinePosition = $state(50) // Eyeline position as percentage of content area height (default 50% - middle)
  let showEyeline = $state(true) // Whether eyeline indicator is visible
  let eyelinePixelTop = $state(0) // Calculated pixel position for fixed positioning
  let isProgrammaticJump = $state(false) // Flag to prevent scroll handler from overriding navigation index
  let isPinned = $state(false) // Whether the current note is pinned (prevents auto-update)
  let pinnedNotePath = $state<string | null>(null) // Path of the pinned note
  let isKeepAwake = $state(false) // Whether screen sleep prevention is active
  let powerSaveBlockerId: number | null = null // ID returned by powerSaveBlocker.start()
  let isFullScreen = $state(false) // Whether full-screen mode is active (hides controls)
  let showControlsTemporarily = $state(false) // Show controls temporarily when holding key
  let lineHeight = $state(1.8) // Line height multiplier (1.0 - 3.0)
  let paddingVertical = $state(20) // Vertical padding in pixels (0 - 100)
  let paddingHorizontal = $state(40) // Horizontal padding in pixels (0 - 200)
  let paddingTop = $state(20) // Top padding in pixels (0 - 200)
  let paddingRight = $state(40) // Right padding in pixels (0 - 200)
  let paddingBottom = $state(20) // Bottom padding in pixels (0 - 200)
  let paddingLeft = $state(40) // Left padding in pixels (0 - 200)
  let textColor = $state('#e0e0e0') // Text color (default: light gray)
  let backgroundColor = $state('#1e1e1e') // Background color (default: dark gray)
  let fontFamily = $state('inherit') // Font family (default: inherit from Obsidian)
  let flipHorizontal = $state(false) // Horizontal flip (mirror mode for teleprompter)
  let flipVertical = $state(false) // Vertical flip (upside-down display)
  let textAlignment = $state<'left' | 'center' | 'right' | 'rtl'>('left') // Text alignment
  let scrollSyncEnabled = $state(false) // Scroll synchronization (teleprompter → editor)
  let showMinimap = $state(false) // Show minimap (document overview)
  let minimapElement: HTMLElement | undefined = $state() // Reference to minimap element
  let scrollPosition = $state(0) // Track scroll position for minimap viewport indicator
  let scrollPercentage = $state(0) // Scroll percentage (0-100) for progress display
  // Focus mode state
  let focusMode = $state(false) // Dim text outside eyeline area
  let focusModeOpacity = $state(0.3) // Opacity for dimmed text (0.1-0.5)
  let focusModeRange = $state(3) // Lines above/below eyeline to keep bright

  // Progress indicator style: 'progress-bar' | 'scrollbar' | 'none'
  // - progress-bar: Simple horizontal progress bar with percentage and time
  // - scrollbar: Minimal vertical scrollbar with viewport and section markers
  // - none: No progress indicator (just use Jump to Section panel)
  let progressIndicatorStyle = $state<'progress-bar' | 'scrollbar' | 'none'>(settings.progressIndicatorStyle || 'progress-bar')

  // View mode: 'rendered' (Markdown HTML) | 'plain' (raw text)
  let viewMode = $state<'rendered' | 'plain'>('rendered')

  // Focus state for keyboard shortcuts
  let isTeleprompterFocused = $state(false) // Whether teleprompter pane has focus (keyboard shortcuts only work when focused)
  let teleprompterContainer: HTMLElement | undefined = $state() // Reference to main container for focus management

  // Auto-pause on edit - pauses teleprompter when user clicks on editor
  let autoPauseOnEdit = $state(settings.autoPauseOnEdit !== false) // Default: enabled

  // Time estimation state
  let elapsedSeconds = $state(0) // Elapsed time since playback started
  let startTimestamp: number | null = null // Timestamp when playback started
  let estimatedRemainingMinutes = $state(0) // Estimated minutes remaining
  let totalWordCount = $state(0) // Total word count in document
  let wordsRemaining = $state(0) // Words remaining from current position
  let showTimeEstimation = $state(settings.showTimeEstimation ?? true) // Show time estimation
  let showElapsedTime = $state(settings.showElapsedTime ?? true) // Show elapsed time
  let speakingPaceWPM = $state(settings.speakingPaceWPM || 150) // Words per minute
  let timeDisplayMode = $state<'elapsed' | 'remaining'>('elapsed') // Toggle between elapsed/remaining display
  let timeDisplayStyle = $state<'compact' | 'full'>(settings.timeDisplayStyle ?? 'compact') // Display style

  // Transparency state
  let backgroundOpacity = $state(100) // Background opacity (0-100)
  let enableBackgroundTransparency = $state(false) // Enable background transparency

  // Voice tracking state
  let voiceTrackingActive = $state(false) // Whether voice tracking is currently active
  let voiceTrackingStatus = $state<'off' | 'initializing' | 'listening' | 'error'>('off') // Current status
  let lastRecognizedText = $state('') // Last recognized speech text
  let voiceTrackingService: VoiceTrackingService | null = null // Voice tracking service instance
  let voiceDownloadProgress = $state(0) // Model download progress (0-100)

  // Update voice tracking config when settings change (real-time)
  $effect(() => {
    if (voiceTrackingService) {
      voiceTrackingService.updateConfig({
        maxJumpDistance: settings.voiceTrackingMaxJumpDistance ?? 4,
        minJumpDistance: settings.voiceTrackingMinJumpDistance ?? 4,
        updateFrequencyMs: settings.voiceTrackingUpdateFrequencyMs ?? 500,
        animationBaseMs: settings.voiceTrackingAnimationBaseMs ?? 400,
        animationPerWordMs: settings.voiceTrackingAnimationPerWordMs ?? 60,
        pauseDetection: settings.voiceTrackingPauseDetection ?? true,
        pauseThresholdMs: settings.voiceTrackingPauseThresholdMs ?? 1200,
        scrollPosition: settings.voiceTrackingScrollPosition ?? 20
      })
    }
  })

  // Button refs for controls that need dynamic icon updates
  let btnPlay: HTMLButtonElement | undefined = $state()
  let btnProgressIndicator: HTMLButtonElement | undefined = $state()
  let btnAlignment: HTMLButtonElement | undefined = $state()

  // Popup slider states
  let showSpeedSlider = $state(false)
  let showVoiceSettings = $state(false)  // Voice tracking preset selector
  let showCountdownSlider = $state(false)
  let showFontSizeSlider = $state(false)
  let showLineHeightSlider = $state(false)
  let showLetterSpacingSlider = $state(false)
  let showOpacitySlider = $state(false)
  let showPaddingSliders = $state(false)
  let showFontFamilyList = $state(false)
  let showTextColorPicker = $state(false)
  let showBgColorPicker = $state(false)
  let showQuickPresetsMenu = $state(false)

  // Additional style states
  let letterSpacing = $state(0) // Letter spacing in pixels
  let opacity = $state(100) // Opacity percentage (0-100)

  // Color picker state (for both text and background)
  let activeColorType = $state<'text' | 'bg' | null>(null) // Which color picker is active
  let pickerHue = $state(0) // Hue 0-360
  let pickerSaturation = $state(100) // Saturation 0-100
  let pickerBrightness = $state(50) // Brightness 0-100
  let pickerAlpha = $state(100) // Alpha 0-100

  // Function to calculate eyeline position in pixels
  function calculateEyelinePixelPosition() {
    if (!contentArea) return
    const rect = contentArea.getBoundingClientRect()
    eyelinePixelTop = rect.top + (rect.height * eyelinePosition / 100)
  }

  // Recalculate whenever eyelinePosition changes
  $effect(() => {
    eyelinePosition // Track this dependency
    calculateEyelinePixelPosition()
  })

  // Recalculate eyeline when contentArea becomes available (timing fix)
  $effect(() => {
    if (contentArea) {
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        calculateEyelinePixelPosition()
      })
    }
  })

  // Log font size changes and ensure DOM updates
  $effect(() => {
    debugLog(`[Font] CSS variable should now be: ${fontSize}px`)
    // Force the markdown-content div to update its CSS variable
    if (contentArea) {
      const markdownContent = contentArea.querySelector('.markdown-content')
      if (markdownContent instanceof HTMLElement) {
        markdownContent.style.setProperty('--base-font-size', `${fontSize}px`)
        debugLog(`[Font] Applied to .markdown-content element`)
      }
    }
  })

  // Log line height changes and ensure DOM updates
  $effect(() => {
    debugLog(`[LineHeight] CSS variable should now be: ${lineHeight}`)
    // Force the markdown-content div to update its CSS variable
    if (contentArea) {
      const markdownContent = contentArea.querySelector('.markdown-content')
      if (markdownContent instanceof HTMLElement) {
        markdownContent.style.setProperty('--line-height', `${lineHeight}`)
        debugLog(`[LineHeight] Applied to .markdown-content element: ${lineHeight}`)
      }
    }
  })

  // Log padding changes and ensure DOM updates
  $effect(() => {
    debugLog(`[Padding] CSS variables should now be: vertical=${paddingVertical}px, horizontal=${paddingHorizontal}px`)
    // Force the markdown-content div to update its CSS variables
    if (contentArea) {
      const markdownContent = contentArea.querySelector('.markdown-content')
      if (markdownContent instanceof HTMLElement) {
        markdownContent.style.setProperty('--padding-vertical', `${paddingVertical}px`)
        markdownContent.style.setProperty('--padding-horizontal', `${paddingHorizontal}px`)
        debugLog(`[Padding] Applied to .markdown-content element: V=${paddingVertical}px, H=${paddingHorizontal}px`)
      }
    }
  })

  // Update play button icon when state changes
  $effect(() => {
    if (btnPlay) {
      const iconName = isPlaying ? 'tp-pause' : isCountingDown ? 'x' : 'tp-play'
      btnPlay.innerHTML = '' // Clear previous icon
      setIcon(btnPlay, iconName)
    }
  })

  // Log color changes and ensure DOM updates
  $effect(() => {
    debugLog(`[Color] CSS variables should now be: text=${textColor}, background=${backgroundColor}`)
    // Force the content-area to update its colors
    if (contentArea) {
      // Apply transparency if enabled
      if (enableBackgroundTransparency) {
        // Parse RGB from hex color
        const r = parseInt(backgroundColor.slice(1, 3), 16)
        const g = parseInt(backgroundColor.slice(3, 5), 16)
        const b = parseInt(backgroundColor.slice(5, 7), 16)
        const alpha = backgroundOpacity / 100
        const rgbaColor = `rgba(${r}, ${g}, ${b}, ${alpha})`
        contentArea.style.setProperty('background-color', rgbaColor)
        debugLog(`[Color] Applied transparency: ${rgbaColor} (opacity: ${backgroundOpacity}%)`)
      } else {
        contentArea.style.setProperty('background-color', backgroundColor)
      }
      contentArea.style.setProperty('color', textColor)
      debugLog(`[Color] Applied to .content-area element: text=${textColor}, bg=${backgroundColor}`)
    }
  })

  // Log font family changes and ensure DOM updates
  $effect(() => {
    debugLog(`[Font] Font family should now be: ${fontFamily}`)
    // Force the markdown-content to update its font
    if (contentArea) {
      const markdownContent = contentArea.querySelector('.markdown-content')
      if (markdownContent instanceof HTMLElement) {
        markdownContent.style.setProperty('font-family', fontFamily)
        debugLog(`[Font] Applied to .markdown-content element: ${fontFamily}`)
      }
    }
  })

  // Apply flip transforms to content area
  $effect(() => {
    debugLog(`[Flip] Transforms should now be: H=${flipHorizontal}, V=${flipVertical}`)
    if (contentArea) {
      const transforms = []
      if (flipHorizontal) transforms.push('scaleX(-1)')
      if (flipVertical) transforms.push('scaleY(-1)')

      const transformValue = transforms.length > 0 ? transforms.join(' ') : 'none'
      contentArea.style.setProperty('transform', transformValue)
      debugLog(`[Flip] Applied transform to content-area: ${transformValue}`)
    }
  })

  // Load saved navigation width from localStorage
  if (typeof localStorage !== 'undefined') {
    const savedWidth = localStorage.getItem('teleprompter-nav-width')
    if (savedWidth) navigationWidth = parseInt(savedWidth)

    // Load saved eyeline position and visibility
    const savedEyelinePos = localStorage.getItem('teleprompter-eyeline-position')
    if (savedEyelinePos) {
      const parsed = parseFloat(savedEyelinePos)
      // Clamp to reasonable range (5-95%) so eyeline is always visible and draggable
      eyelinePosition = Math.max(5, Math.min(95, parsed))
    }

    const savedEyelineVisible = localStorage.getItem('teleprompter-eyeline-visible')
    // Check for migration flag - reset eyeline if bad position was saved
    const needsReset = localStorage.getItem('teleprompter-eyeline-reset-v1') !== 'done'
    if (needsReset && savedEyelinePos && parseFloat(savedEyelinePos) >= 95) {
      // One-time reset: position was at extreme, reset to defaults
      eyelinePosition = 50 // Middle
      showEyeline = true
      localStorage.setItem('teleprompter-eyeline-position', '50')
      localStorage.setItem('teleprompter-eyeline-visible', 'true')
      localStorage.setItem('teleprompter-eyeline-reset-v1', 'done')
    } else if (savedEyelineVisible !== null) {
      showEyeline = savedEyelineVisible === 'true'
    } else {
      // Default to true if not set
      showEyeline = true
    }
  }

  // Save navigation width whenever it changes
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('teleprompter-nav-width', navigationWidth.toString())
    }
  })

  // Save eyeline position whenever it changes
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('teleprompter-eyeline-position', eyelinePosition.toString())
    }
  })

  // Save eyeline visibility whenever it changes
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('teleprompter-eyeline-visible', showEyeline.toString())
    }
  })

  // Update elapsed time and time estimation every second
  $effect(() => {
    const interval = setInterval(() => {
      if (startTimestamp && isPlaying) {
        // Update elapsed time
        elapsedSeconds = Math.floor((Date.now() - startTimestamp) / 1000)

        // Update time estimation
        wordsRemaining = calculateWordsRemaining()
        estimatedRemainingMinutes = calculateTimeRemaining()

        debugLog('[Time] Elapsed:', elapsedSeconds, 's | Remaining:', formatEstimatedTime(estimatedRemainingMinutes))
      }
    }, 1000)

    return () => clearInterval(interval)
  })

  // Update words remaining when scrolling
  $effect(() => {
    scrollPosition // Track dependency
    if (contentArea) {
      wordsRemaining = calculateWordsRemaining()
      estimatedRemainingMinutes = calculateTimeRemaining()
    }
  })

  // Render markdown whenever content changes
  // Performance optimization: Track last rendered content to avoid unnecessary re-renders
  let lastRenderedContent = ''

  $effect(() => {
    // Skip if content hasn't changed (performance optimization)
    if (content === lastRenderedContent && renderedHTML) return

    try {
      // Reset header counter before parsing
      headerCounter = 0

      // Convert Obsidian wiki-link images to standard markdown before parsing
      const activeFile = app.workspace.getActiveFile()
      const sourcePath = activeFile?.path || ''
      let processedContent = convertObsidianWikiLinks(content, sourcePath)

      // Strip HTML comments (<!-- ... -->) from content
      processedContent = processedContent.replace(/<!--[\s\S]*?-->/g, '')

      // Replace Mermaid diagram code blocks with readable placeholders
      processedContent = replaceDiagramBlocks(processedContent)

      renderedHTML = marked.parse(processedContent) as string
      lastRenderedContent = content

      // Update word count when content changes
      updateWordCount()

      // After rendering, update headerElements Map and headersList by querying DOM
      // Use requestAnimationFrame for better performance instead of setTimeout
      requestAnimationFrame(() => {
        if (contentArea) {
          // Clear existing header elements
          headerElements.clear()

          // Query all headers with data-header-id attribute
          const headers = contentArea.querySelectorAll('[data-header-id]')

          // Batch DOM operations for better performance
          const newHeaderElements = new Map()
          headers.forEach((element) => {
            const headerId = element.getAttribute('data-header-id')
            if (headerId && element instanceof HTMLElement) {
              newHeaderElements.set(headerId, element)
            }
          })
          headerElements = newHeaderElements

          // Extract headers list for navigation
          headersList = extractHeadersFromDOM()

          debugLog(`[Markdown] Registered ${headerElements.size} headers in Map, ${headersList.length} in list`)
        }

        // Recalculate eyeline position after content renders
        requestAnimationFrame(() => {
          calculateEyelinePixelPosition()

          // Process embedded notes asynchronously (load their content)
          processEmbeddedNotes(sourcePath, new Set([sourcePath]))
        })
      })
    } catch (err) {
      console.error('Markdown rendering error:', err)
      renderedHTML = '<p class="error">Error rendering markdown</p>'
    }
  })

  // Load content from active note
  function loadActiveNote() {
    // If note is pinned, don't auto-update
    if (isPinned) {
      debugLog('[Pin] Note is pinned, skipping auto-update')
      return
    }

    const activeFile = app.workspace.getActiveFile()
    if (activeFile) {
      app.vault.read(activeFile).then((fileContent) => {
        // Remove YAML frontmatter and track offset
        const result = removeYAMLFrontmatter(fileContent)
        content = result.content
        yamlLineOffset = result.linesRemoved
        currentFileName = activeFile.basename

        // Reset countdown flag when new document loads
        hasUsedCountdown = false
        debugLog('[Document] New document loaded - countdown flag reset')
      })
    }
  }

  // Remove YAML frontmatter from content
  function removeYAMLFrontmatter(text: string): { content: string; linesRemoved: number } {
    // Check if starts with ---
    if (text.startsWith('---\n')) {
      const endIndex = text.indexOf('\n---\n', 4)
      if (endIndex !== -1) {
        // Found closing ---, remove everything including the closing ---
        const removed = text.slice(0, endIndex + 5)
        const linesRemoved = removed.split('\n').length
        return {
          content: text.slice(endIndex + 5),
          linesRemoved
        }
      }
    }
    return { content: text, linesRemoved: 0 }
  }

  // Calculate word count from text content
  function calculateWordCount(text: string): number {
    // Remove markdown syntax and count words
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
      .replace(/\[.*?\]\(.*?\)/g, '$1') // Keep link text only
      .replace(/[#*_~`]/g, '') // Remove markdown symbols
      .trim()

    if (!cleanText) return 0

    // Split by whitespace and filter empty strings
    const words = cleanText.split(/\s+/).filter(word => word.length > 0)
    return words.length
  }

  // Calculate words remaining based on scroll position
  function calculateWordsRemaining(): number {
    if (!contentArea || totalWordCount === 0) return totalWordCount

    const scrollPercentage = contentArea.scrollTop / (contentArea.scrollHeight - contentArea.clientHeight)
    const wordsRead = Math.floor(totalWordCount * scrollPercentage)
    return Math.max(0, totalWordCount - wordsRead)
  }

  // Calculate estimated time remaining in minutes
  function calculateTimeRemaining(): number {
    const remaining = calculateWordsRemaining()
    const minutesRemaining = remaining / speakingPaceWPM
    return minutesRemaining
  }

  // Format elapsed time as MM:SS
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Format estimated time as "X:XX" or "XX:XX"
  function formatEstimatedTime(minutes: number): string {
    const mins = Math.floor(minutes)
    const secs = Math.floor((minutes - mins) * 60)
    if (mins < 10) {
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Update word count when content changes
  function updateWordCount() {
    totalWordCount = calculateWordCount(content)
    wordsRemaining = totalWordCount
    debugLog('[Time] Total word count:', totalWordCount)
  }

  // Write error log to file for debugging
  function writeErrorLog(errorType: string, errorData: Record<string, unknown>) {
    try {
      const fs = require('fs')
      const path = require('path')
      const logDir = path.join(app.vault.adapter.basePath, '.obsidian', 'plugins', 'teleprompter-plus')
      const logFile = path.join(logDir, 'error-log.jsonl')

      // Format as JSON Lines (one JSON object per line)
      const logEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        type: errorType,
        data: errorData
      }) + '\n'

      // Append to log file
      fs.appendFileSync(logFile, logEntry, 'utf8')

      debugLog('[ErrorLog] Written to:', logFile)
    } catch (err) {
      console.error('[ErrorLog] Failed to write error log:', err)
    }
  }

  // Extract headers from rendered HTML (after marked.js processing)
  // This state is updated after markdown rendering
  let headersList = $state<Array<{ level: number; text: string; id: string; parentId?: string; hasChildren: boolean }>>([])

  // Helper function to extract headers from DOM
  function extractHeadersFromDOM() {
    if (!contentArea) return []

    const result: Array<{ level: number; text: string; id: string; parentId?: string; hasChildren: boolean }> = []
    const stack: Array<{ level: number; id: string }> = []

    // Query all headers with data-header-id
    const headerElements = contentArea.querySelectorAll('[data-header-id]')

    headerElements.forEach((element) => {
      const headerId = element.getAttribute('data-header-id')

      // More robust tag name detection
      let tagName = 'unknown'
      if (element instanceof HTMLElement && element.tagName) {
        tagName = element.tagName.toLowerCase()
      } else if (element.nodeName) {
        tagName = element.nodeName.toLowerCase()
      }

      // Check if it's a header element (h1, h2, or h3)
      const headerMatch = tagName.match(/^h([1-3])$/)
      if (headerId && headerMatch) {
        const level = parseInt(headerMatch[1]) // Extract level from h1, h2, h3
        const text = element.textContent || ''

        // Find parent by popping stack until we find a lower level
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop()
        }

        const parentId = stack.length > 0 ? stack[stack.length - 1].id : undefined

        // Mark parent as having children
        if (parentId) {
          const parent = result.find(h => h.id === parentId)
          if (parent) {
            parent.hasChildren = true
          }
        }

        result.push({ level, text, id: headerId, parentId, hasChildren: false })
        stack.push({ level, id: headerId })
      }
    })

    return result
  }

  // Helper function to access headers (for compatibility)
  function headers() {
    return headersList
  }

  function toggleHeaderCollapse(headerId: string) {
    if (collapsedHeaders.has(headerId)) {
      collapsedHeaders.delete(headerId)
    } else {
      collapsedHeaders.add(headerId)
    }
    // Trigger reactivity
    collapsedHeaders = new Set(collapsedHeaders)
  }

  function isHeaderVisible(header: { parentId?: string }): boolean {
    if (!header.parentId) return true

    // Check if any ancestor is collapsed
    let currentParentId = header.parentId
    while (currentParentId) {
      if (collapsedHeaders.has(currentParentId)) {
        return false
      }
      // Find the parent to check its parent
      const parent = headers().find(h => h.id === currentParentId)
      currentParentId = parent?.parentId
    }

    return true
  }

  function togglePlay() {
    if (isPlaying) {
      // Pause
      isPlaying = false
      isCountingDown = false
      currentCountdown = 0
      startTimestamp = null // Pause timer
      debugLog('[Play] Paused')
    } else {
      // Start playing
      const scrollTop = contentArea?.scrollTop || 0
      const isAtStart = scrollTop < 50 // Within 50px of top (stricter check)

      debugLog(`[Play] Toggle play - scrollTop: ${scrollTop}, isAtStart: ${isAtStart}, countdownSeconds: ${countdownSeconds}, hasUsedCountdown: ${hasUsedCountdown}`)

      // Reset timer if starting from beginning
      if (isAtStart) {
        elapsedSeconds = 0
        startTimestamp = Date.now()
        debugLog('[Time] Reset elapsed time to 0 (starting from top)')
      } else if (!startTimestamp) {
        // Resume from middle - start timer if not already running
        startTimestamp = Date.now() - (elapsedSeconds * 1000)
        debugLog('[Time] Resuming timer from', elapsedSeconds, 'seconds')
      }

      // Only show countdown if:
      // 1. Countdown is enabled (countdownSeconds > 0)
      // 2. Not already counting down
      // 3. At the very start of document
      // 4. Haven't used countdown yet in this session
      if (countdownSeconds > 0 && !isCountingDown && isAtStart && !hasUsedCountdown) {
        // Start countdown - this will only happen ONCE per document
        debugLog('[Countdown] Starting countdown - first time at document start')
        hasUsedCountdown = true // Mark as used
        startCountdown()
      } else {
        // Resume playing immediately (no countdown)
        if (countdownSeconds === 0) {
          debugLog('[Play] Countdown disabled (0s) - starting immediately')
        } else if (hasUsedCountdown) {
          debugLog('[Play] Countdown already used - starting immediately')
        } else if (!isAtStart) {
          debugLog('[Play] Not at document start - starting immediately')
        } else {
          debugLog('[Play] Starting playback immediately')
        }
        isPlaying = true
        // Focus teleprompter so blur event fires when user clicks on editor (for auto-pause)
        focusTeleprompter()
      }
    }
    // Broadcast play state change to other windows
    broadcastState({ isPlaying })
  }

  function startCountdown() {
    // Set initial countdown value FIRST, before showing overlay
    currentCountdown = countdownSeconds
    isCountingDown = true

    debugLog(`[Countdown] Starting countdown from ${currentCountdown}`)

    const countdownInterval = setInterval(() => {
      if (currentCountdown <= 1) {
        // This is the last tick - clear and start playing
        clearInterval(countdownInterval)
        currentCountdown = 0
        debugLog('[Countdown] Finished - starting playback')

        // Small delay to show "0" briefly before transitioning
        setTimeout(() => {
          isCountingDown = false
          isPlaying = true
          // Focus teleprompter so blur event fires when user clicks on editor (for auto-pause)
          focusTeleprompter()
        }, 500)
      } else {
        currentCountdown--
        debugLog(`[Countdown] ${currentCountdown}...`)
      }
    }, 1000)
  }

  function increaseCountdown() {
    if (countdownSeconds < 30) {
      countdownSeconds++
      broadcastState({ countdownSeconds })
    }
  }

  function decreaseCountdown() {
    if (countdownSeconds > 0) {
      countdownSeconds--
      broadcastState({ countdownSeconds })
    }
  }

  function increaseSpeed() {
    speed = Math.min(speed + speedIncrement, settings.maxScrollSpeed || 10)
    broadcastState({ speed })
  }

  function decreaseSpeed() {
    speed = Math.max(speed - speedIncrement, settings.minScrollSpeed || 0.5)
    broadcastState({ speed })
  }

  // Speed preset functions
  function cycleSpeedPreset() {
    currentPresetIndex = (currentPresetIndex + 1) % SPEED_PRESETS.length
    speed = SPEED_PRESETS[currentPresetIndex]
    debugLog(`[Speed] Preset: ${speed}x`)
    broadcastState({ speed })
  }

  function setSpeedPreset(presetSpeed: number) {
    const index = SPEED_PRESETS.indexOf(presetSpeed as typeof SPEED_PRESETS[number])
    if (index !== -1) {
      currentPresetIndex = index
      speed = SPEED_PRESETS[index]
      debugLog(`[Speed] Set preset: ${speed}x`)
    } else {
      // If not a preset, just set the speed directly
      speed = Math.max(settings.minScrollSpeed || 0.5, Math.min(presetSpeed, settings.maxScrollSpeed || 10))
      currentPresetIndex = -1 // Not a preset
      debugLog(`[Speed] Custom speed: ${speed}x`)
    }
    broadcastState({ speed })
  }

  function nextSpeedPreset() {
    if (currentPresetIndex < SPEED_PRESETS.length - 1) {
      currentPresetIndex++
      speed = SPEED_PRESETS[currentPresetIndex]
      debugLog(`[Speed] Next preset: ${speed}x`)
      broadcastState({ speed })
    }
  }

  function prevSpeedPreset() {
    if (currentPresetIndex > 0) {
      currentPresetIndex--
      speed = SPEED_PRESETS[currentPresetIndex]
      debugLog(`[Speed] Previous preset: ${speed}x`)
      broadcastState({ speed })
    }
  }

  function toggleSpeedSlider() {
    showSpeedSlider = !showSpeedSlider
    if (showSpeedSlider) closeOtherPopups('speed')
  }

  function toggleCountdownSlider() {
    showCountdownSlider = !showCountdownSlider
    if (showCountdownSlider) closeOtherPopups('countdown')
  }

  function toggleFontSizeSlider() {
    showFontSizeSlider = !showFontSizeSlider
    if (showFontSizeSlider) closeOtherPopups('fontSize')
  }

  function toggleLineHeightSlider() {
    showLineHeightSlider = !showLineHeightSlider
    if (showLineHeightSlider) closeOtherPopups('lineHeight')
  }

  function toggleLetterSpacingSlider() {
    showLetterSpacingSlider = !showLetterSpacingSlider
    if (showLetterSpacingSlider) closeOtherPopups('letterSpacing')
  }

  function toggleOpacitySlider() {
    showOpacitySlider = !showOpacitySlider
    if (showOpacitySlider) closeOtherPopups('opacity')
  }

  // Toggle time display mode (elapsed ↔ remaining)
  function toggleTimeDisplayMode() {
    timeDisplayMode = timeDisplayMode === 'elapsed' ? 'remaining' : 'elapsed'
    debugLog(`[TimeDisplay] Switched to: ${timeDisplayMode}`)
  }

  // Letter spacing control functions (for Stream Deck)
  function increaseLetterSpacing() {
    letterSpacing = Math.min(20, letterSpacing + 1)
    debugLog(`[LetterSpacing] Increased to: ${letterSpacing}px`)
    broadcastState({ letterSpacing })
  }

  function decreaseLetterSpacing() {
    letterSpacing = Math.max(-5, letterSpacing - 1)
    debugLog(`[LetterSpacing] Decreased to: ${letterSpacing}px`)
    broadcastState({ letterSpacing })
  }

  // Opacity control functions (for Stream Deck)
  function increaseOpacity() {
    opacity = Math.min(100, opacity + 10)
    debugLog(`[Opacity] Increased to: ${opacity}%`)
    broadcastState({ opacity })
  }

  function decreaseOpacity() {
    opacity = Math.max(10, opacity - 10)
    debugLog(`[Opacity] Decreased to: ${opacity}%`)
    broadcastState({ opacity })
  }

  function togglePaddingSliders() {
    showPaddingSliders = !showPaddingSliders
    if (showPaddingSliders) closeOtherPopups('padding')
  }

  function toggleFontFamilyList() {
    showFontFamilyList = !showFontFamilyList
    if (showFontFamilyList) closeOtherPopups('fontFamily')
  }

  function toggleTextColorPicker() {
    if (showTextColorPicker) {
      showTextColorPicker = false
      activeColorType = null
    } else {
      openColorPicker('text')
    }
  }

  function toggleBgColorPicker() {
    if (showBgColorPicker) {
      showBgColorPicker = false
      activeColorType = null
    } else {
      openColorPicker('bg')
    }
  }

  function toggleQuickPresetsMenu() {
    showQuickPresetsMenu = !showQuickPresetsMenu
    if (showQuickPresetsMenu) closeOtherPopups('quickPresets')
  }

  // Quick Setup Preset configurations (matching settings.ts)
  const quickSetupPresets = [
    {
      name: 'Professional',
      icon: 'briefcase',
      desc: 'Corporate presentations',
      config: {
        fontSize: 24,
        textColor: '#e0e0e0',
        backgroundColor: '#1e1e1e',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        lineHeight: 1.8,
        paddingVertical: 20,
        paddingHorizontal: 40,
      }
    },
    {
      name: 'Broadcast',
      icon: 'tv',
      desc: 'News anchor, professional video',
      config: {
        fontSize: 36,
        textColor: '#ffffff',
        backgroundColor: '#000000',
        fontFamily: 'Verdana, Tahoma, "DejaVu Sans", sans-serif',
        lineHeight: 2.0,
        paddingVertical: 30,
        paddingHorizontal: 60,
      }
    },
    {
      name: 'Presentation',
      icon: 'presentation',
      desc: 'Conference talks, large screens',
      config: {
        fontSize: 48,
        textColor: '#2e2e2e',
        backgroundColor: '#f5f5f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        lineHeight: 1.6,
        paddingVertical: 40,
        paddingHorizontal: 80,
      }
    },
    {
      name: 'Cinema',
      icon: 'film',
      desc: 'Film credits, dramatic reading',
      config: {
        fontSize: 32,
        textColor: '#ffffff',
        backgroundColor: '#000000',
        fontFamily: 'Georgia, "Times New Roman", Times, serif',
        lineHeight: 1.9,
        paddingVertical: 25,
        paddingHorizontal: 50,
      }
    },
    {
      name: 'Green screen',
      icon: 'video',
      desc: 'Video production with chroma key',
      config: {
        fontSize: 32,
        textColor: '#ffffff',
        backgroundColor: '#00ff00',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        lineHeight: 1.8,
        paddingVertical: 25,
        paddingHorizontal: 45,
      }
    },
    {
      name: 'Stream',
      icon: 'rss',
      desc: 'Twitch/YouTube streaming',
      config: {
        fontSize: 28,
        textColor: '#ffffff',
        backgroundColor: '#000000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        lineHeight: 1.7,
        paddingVertical: 20,
        paddingHorizontal: 40,
      }
    },
    {
      name: 'Practice',
      icon: 'book-open',
      desc: 'Rehearsal, easy on eyes',
      config: {
        fontSize: 20,
        textColor: '#5c4a2f',
        backgroundColor: '#f4ecd8',
        fontFamily: 'inherit',
        lineHeight: 1.6,
        paddingVertical: 15,
        paddingHorizontal: 30,
      }
    },
    {
      name: 'Accessibility',
      icon: 'accessibility',
      desc: 'High contrast, large text',
      config: {
        fontSize: 40,
        textColor: '#ffffff',
        backgroundColor: '#000000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        lineHeight: 2.2,
        paddingVertical: 35,
        paddingHorizontal: 70,
      }
    },
  ]

  // Color presets for quick selection
  const textColorPresets = [
    { color: '#ffffff', name: 'White' },
    { color: '#e0e0e0', name: 'Light gray' },
    { color: '#a0a0a0', name: 'Gray' },
    { color: '#606060', name: 'Dark gray' },
    { color: '#000000', name: 'Black' },
    { color: '#ffeb3b', name: 'Yellow' },
    { color: '#ff9800', name: 'Orange' },
    { color: '#f44336', name: 'Red' },
    { color: '#4caf50', name: 'Green' },
    { color: '#2196f3', name: 'Blue' },
  ]

  const backgroundColorPresets = [
    { color: '#000000', name: 'Black' },
    { color: '#1a1a1a', name: 'Charcoal' },
    { color: '#2d2d2d', name: 'Dark gray' },
    { color: '#1e1e1e', name: 'VS Code' },
    { color: '#0d1117', name: 'GitHub Dark' },
    { color: '#1a1a2e', name: 'Dark blue' },
    { color: '#1a2e1a', name: 'Dark green' },
    { color: '#2e1a1a', name: 'Dark red' },
    { color: '#f4ecd8', name: 'Cream' },
    { color: '#ffffff', name: 'White' },
  ]

  function applyTextColorPreset(color: string) {
    textColor = color
    // Update HSB sliders to match
    const hsb = hexToHsb(color)
    pickerHue = hsb.h
    pickerSaturation = hsb.s
    pickerBrightness = hsb.b
    // Broadcast to other windows
    broadcastState({ textColor })
    // Save to plugin
    if (plugin) {
      plugin.settings.textColor = color
      plugin.saveSettings()
    }
  }

  function applyBackgroundColorPreset(color: string) {
    backgroundColor = color
    // Update HSB sliders to match
    const hsb = hexToHsb(color)
    pickerHue = hsb.h
    pickerSaturation = hsb.s
    pickerBrightness = hsb.b
    // Broadcast to other windows
    broadcastState({ backgroundColor })
    // Save to plugin
    if (plugin) {
      plugin.settings.backgroundColor = color
      plugin.saveSettings()
    }
  }

  async function applyQuickPreset(preset: typeof quickSetupPresets[0]) {
    debugLog('[Teleprompter] Applying quick preset from toolbar:', preset.name)

    // Apply all settings from preset
    fontSize = preset.config.fontSize
    textColor = preset.config.textColor
    backgroundColor = preset.config.backgroundColor
    fontFamily = preset.config.fontFamily
    lineHeight = preset.config.lineHeight
    paddingVertical = preset.config.paddingVertical
    paddingHorizontal = preset.config.paddingHorizontal

    // Broadcast all preset changes to other windows
    broadcastState({
      fontSize,
      textColor,
      backgroundColor,
      fontFamily,
      lineHeight,
      paddingTop: paddingVertical,
      paddingBottom: paddingVertical,
      paddingLeft: paddingHorizontal,
      paddingRight: paddingHorizontal
    })

    // Save to plugin settings
    if (plugin) {
      Object.assign(plugin.settings, preset.config)
      await plugin.saveSettings()
      debugLog('[Teleprompter] Preset saved to settings:', preset.name)
    }

    // Close the menu
    showQuickPresetsMenu = false
  }

  // Helper function to close all popups except the specified one
  function closeOtherPopups(except: string) {
    if (except !== 'speed') showSpeedSlider = false
    if (except !== 'countdown') showCountdownSlider = false
    if (except !== 'fontSize') showFontSizeSlider = false
    if (except !== 'lineHeight') showLineHeightSlider = false
    if (except !== 'letterSpacing') showLetterSpacingSlider = false
    if (except !== 'opacity') showOpacitySlider = false
    if (except !== 'padding') showPaddingSliders = false
    if (except !== 'fontFamily') showFontFamilyList = false
    if (except !== 'textColor') showTextColorPicker = false
    if (except !== 'bgColor') showBgColorPicker = false
    if (except !== 'quickPresets') showQuickPresetsMenu = false
  }

  // Reset padding to defaults
  function resetPadding() {
    paddingTop = 20
    paddingRight = 40
    paddingBottom = 20
    paddingLeft = 40
    broadcastState({ paddingTop, paddingRight, paddingBottom, paddingLeft })
  }

  // Svelte action to set icon on element
  function setIconAction(node: HTMLElement, iconName: string) {
    setIcon(node, iconName)
    return {
      update(newIconName: string) {
        node.innerHTML = '' // Clear previous icon
        setIcon(node, newIconName)
      }
    }
  }

  // Color conversion helpers
  function hsbToRgb(h: number, s: number, b: number): {r: number, g: number, b: number} {
    s = s / 100
    b = b / 100
    const k = (n: number) => (n + h / 60) % 6
    const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)))
    return {
      r: Math.round(255 * f(5)),
      g: Math.round(255 * f(3)),
      b: Math.round(255 * f(1))
    }
  }

  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
  }

  function hexToRgb(hex: string): {r: number, g: number, b: number} | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  function rgbToHsb(r: number, g: number, b: number): {h: number, s: number, b: number} {
    r = r / 255
    g = g / 255
    b = b / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    let h = 0
    if (delta !== 0) {
      if (max === r) h = ((g - b) / delta) % 6
      else if (max === g) h = (b - r) / delta + 2
      else h = (r - g) / delta + 4
      h = Math.round(h * 60)
      if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : Math.round((delta / max) * 100)
    const brightness = Math.round(max * 100)
    return {h, s, b: brightness}
  }

  // Convert hex color to HSB
  function hexToHsb(hex: string): {h: number, s: number, b: number} {
    const rgb = hexToRgb(hex)
    if (rgb) {
      return rgbToHsb(rgb.r, rgb.g, rgb.b)
    }
    return {h: 0, s: 0, b: 0}
  }

  // Initialize color picker with current color
  function openColorPicker(type: 'text' | 'bg') {
    activeColorType = type
    const currentColor = type === 'text' ? textColor : backgroundColor
    const rgb = hexToRgb(currentColor)
    if (rgb) {
      const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b)
      pickerHue = hsb.h
      pickerSaturation = hsb.s
      pickerBrightness = hsb.b
      pickerAlpha = 100
    }
    if (type === 'text') {
      showTextColorPicker = true
      closeOtherPopups('textColor')
    } else {
      showBgColorPicker = true
      closeOtherPopups('bgColor')
    }
  }

  // Update color from picker
  function updateColorFromPicker() {
    const rgb = hsbToRgb(pickerHue, pickerSaturation, pickerBrightness)
    const hexColor = rgbToHex(rgb.r, rgb.g, rgb.b)
    if (activeColorType === 'text') {
      textColor = hexColor
      broadcastState({ textColor })
    } else if (activeColorType === 'bg') {
      backgroundColor = hexColor
      broadcastState({ backgroundColor })
    }
  }

  function toggleNavigation() {
    showNavigation = !showNavigation
    // Save navigation state if remember setting is enabled
    if (settings.rememberNavigationState) {
      localStorage.setItem('teleprompter-navigation-open', String(showNavigation))
    }
    broadcastState({ showNavigation })
  }

  function toggleEyeline() {
    showEyeline = !showEyeline
    broadcastState({ showEyeline })
  }

  // Toggle focus mode (dim text outside eyeline area)
  function toggleFocusMode() {
    focusMode = !focusMode
    broadcastState({ focusMode })
    debugLog(`[FocusMode] ${focusMode ? 'Enabled' : 'Disabled'}`)
  }

  // Apply voice tracking pace preset
  function applyVoicePreset(presetName: Exclude<VoiceTrackingPacePreset, 'custom'>) {
    const preset = VOICE_TRACKING_PRESETS[presetName]
    if (!preset || !plugin) return

    // Update settings with preset values
    plugin.settings.voiceTrackingPacePreset = presetName
    plugin.settings.voiceTrackingConfidenceThreshold = preset.confidenceThreshold
    plugin.settings.voiceTrackingWindowSize = preset.windowSize
    plugin.settings.voiceTrackingMaxJumpDistance = preset.maxJumpDistance
    plugin.settings.voiceTrackingMinJumpDistance = preset.minJumpDistance
    plugin.settings.voiceTrackingUpdateFrequencyMs = preset.updateFrequencyMs
    plugin.settings.voiceTrackingAnimationBaseMs = preset.animationBaseMs

    // Save settings
    plugin.saveSettings()

    // If voice tracking is active, restart it with new settings
    if (voiceTrackingActive && voiceTrackingService) {
      voiceTrackingService.stop()
      voiceTrackingActive = false
      // Give it a moment then restart
      setTimeout(() => toggleVoiceTracking(), 100)
    }

    debugLog(`[Voice] Applied preset: ${presetName}`)
    showVoiceSettings = false
  }

  function toggleVoiceSettings() {
    showVoiceSettings = !showVoiceSettings
  }

  // Voice tracking toggle
  async function toggleVoiceTracking() {
    if (!settings.voiceTrackingEnabled) {
      debugLog('[Voice] Voice tracking is disabled in settings')
      return
    }

    try {
      if (voiceTrackingActive) {
        // Stop voice tracking
        if (voiceTrackingService) {
          voiceTrackingService.stop()
        }
        voiceTrackingActive = false
        voiceTrackingStatus = 'off'
        lastRecognizedText = ''
        debugLog('[Voice] Voice tracking stopped')
      } else {
        // Start voice tracking
        voiceTrackingStatus = 'initializing'

        // Dynamically import and initialize voice tracking
        const { getVoiceTrackingService, VoiceTrackingService } = await import('./voice')

        // Check if voice tracking is supported
        if (!VoiceTrackingService.isSupported()) {
          voiceTrackingStatus = 'error'
          debugLog('[Voice] Voice tracking not supported in this browser')
          return
        }

        // Get or create service with tuning parameters from settings
        voiceTrackingService = getVoiceTrackingService({
          language: settings.voiceTrackingLanguage || 'en-US',
          scrollBehavior: settings.voiceTrackingScrollBehavior || 'smooth',
          showIndicator: settings.voiceTrackingShowIndicator ?? true,
          // Speech matching tuning - from preset or custom settings
          confidenceThreshold: settings.voiceTrackingConfidenceThreshold ?? 0.20,
          windowSize: settings.voiceTrackingWindowSize ?? 6,
          maxJumpDistance: settings.voiceTrackingMaxJumpDistance ?? 3,
          minJumpDistance: settings.voiceTrackingMinJumpDistance ?? 2,
          updateFrequencyMs: settings.voiceTrackingUpdateFrequencyMs ?? 500,
          animationBaseMs: settings.voiceTrackingAnimationBaseMs ?? 400,
          animationPerWordMs: settings.voiceTrackingAnimationPerWordMs ?? 60,
          // Pause detection settings
          pauseDetection: settings.voiceTrackingPauseDetection ?? true,
          pauseThresholdMs: settings.voiceTrackingPauseThresholdMs ?? 1200,
          // Scroll position setting (where current word appears on screen)
          scrollPosition: settings.voiceTrackingScrollPosition ?? 20
        })

        // Set up callbacks
        voiceTrackingService.onStatusChange = (status: string) => {
          voiceTrackingStatus = status as typeof voiceTrackingStatus
          debugLog(`[Voice] Status: ${status}`)
        }

        voiceTrackingService.onRecognizedText = (text: string, isFinal: boolean) => {
          lastRecognizedText = text
          debugLog(`[Voice] Recognized (${isFinal ? 'final' : 'partial'}): ${text}`)
        }

        voiceTrackingService.onWordMatch = (wordIndex: number, scrollPosition: number) => {
          debugLog(`[Voice] Matched word ${wordIndex}, scrolling to ${scrollPosition}`)
        }

        voiceTrackingService.onPauseChange = (isPaused: boolean) => {
          debugLog(`[Voice] Pause state: ${isPaused ? 'PAUSED' : 'RESUMED'}`)
        }

        voiceTrackingService.onError = (error: string, message: string) => {
          console.error(`[Voice] Error: ${error} - ${message}`)
          voiceTrackingStatus = 'error'
        }

        voiceTrackingService.onProgress = (loaded: number, total: number) => {
          voiceDownloadProgress = Math.round((loaded / total) * 100)
          debugLog(`[Voice] Download progress: ${voiceDownloadProgress}%`)
        }

        // Initialize with content
        if (contentArea) {
          debugLog(`[Voice] Initializing with content length: ${content.length}`)
          debugLog(`[Voice] ContentArea exists: ${!!contentArea}`)
          debugLog(`[Voice] Content preview: "${content.substring(0, 100)}..."`)
          voiceTrackingService.initialize(content, contentArea)
        } else {
          debugLog('[Voice] WARNING: contentArea is not available!')
        }

        // Pause auto-scroll when voice tracking is active
        if (isPlaying) {
          isPlaying = false
          broadcastState({ isPlaying })
        }

        // Start listening
        await voiceTrackingService.start()
        voiceTrackingActive = true
        debugLog('[Voice] Voice tracking started')
      }
    } catch (error) {
      console.error('[Voice] Failed to toggle voice tracking:', error)
      voiceTrackingStatus = 'error'
      voiceTrackingActive = false
    }
  }

  function togglePin() {
    isPinned = !isPinned

    if (isPinned) {
      // Pin the current note
      const activeFile = app.workspace.getActiveFile()
      pinnedNotePath = activeFile?.path || null
      debugLog(`[Pin] Note pinned: ${currentFileName}`)
    } else {
      // Unpin and reload current active note
      pinnedNotePath = null
      debugLog('[Pin] Note unpinned')
      loadActiveNote()
    }
    broadcastState({ isPinned })
  }

  function refreshPinnedNote() {
    if (!isPinned || !pinnedNotePath) return

    // Manually reload the pinned note
    const file = app.vault.getAbstractFileByPath(pinnedNotePath)
    if (file && 'extension' in file) {
      app.vault.read(file).then((fileContent) => {
        const result = removeYAMLFrontmatter(fileContent)
        content = result.content
        yamlLineOffset = result.linesRemoved
        debugLog('[Pin] Manually refreshed pinned note')
      })
    }
  }

  function toggleKeepAwake() {
    try {
      // Access Electron's powerSaveBlocker API
      const electron = require('electron')
      const { powerSaveBlocker } = electron.remote || electron

      if (!powerSaveBlocker) {
        console.error('[KeepAwake] powerSaveBlocker API not available')
        return
      }

      if (isKeepAwake) {
        // Stop preventing sleep
        if (powerSaveBlockerId !== null) {
          powerSaveBlocker.stop(powerSaveBlockerId)
          powerSaveBlockerId = null
          debugLog('[KeepAwake] Screen sleep prevention stopped')
        }
        isKeepAwake = false
      } else {
        // Start preventing sleep
        powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
        isKeepAwake = true
        debugLog('[KeepAwake] Screen sleep prevention started')
      }
      broadcastState({ isKeepAwake })
    } catch (error) {
      console.error('[KeepAwake] Failed to toggle keep awake:', error)
      isKeepAwake = false
      powerSaveBlockerId = null
    }
  }

  function stopKeepAwake() {
    if (isKeepAwake && powerSaveBlockerId !== null) {
      try {
        const electron = require('electron')
        const { powerSaveBlocker } = electron.remote || electron
        if (powerSaveBlocker) {
          powerSaveBlocker.stop(powerSaveBlockerId)
          debugLog('[KeepAwake] Cleanup: Stopped screen sleep prevention')
        }
      } catch (error) {
        console.error('[KeepAwake] Cleanup error:', error)
      }
      powerSaveBlockerId = null
      isKeepAwake = false
    }
  }

  function toggleFullScreen() {
    isFullScreen = !isFullScreen
    debugLog(`[FullScreen] ${isFullScreen ? 'Enabled' : 'Disabled'}`)
    broadcastState({ isFullScreen })
  }

  function handleFullScreenKeyPress(e: KeyboardEvent) {
    // Show controls temporarily when holding Ctrl key in full-screen mode
    if (isFullScreen && (e.key === 'Control' || e.key === 'Meta')) {
      showControlsTemporarily = true
    }
  }

  function handleFullScreenKeyRelease(e: KeyboardEvent) {
    // Hide controls when releasing Ctrl key
    if (e.key === 'Control' || e.key === 'Meta') {
      showControlsTemporarily = false
    }
  }

  function increaseLineHeight() {
    if (lineHeight < 3.0) {
      lineHeight = Math.round((lineHeight + 0.1) * 10) / 10 // Round to 1 decimal
      debugLog(`[LineHeight] Increased to ${lineHeight}`)
      broadcastState({ lineHeight })
    }
  }

  function decreaseLineHeight() {
    if (lineHeight > 1.0) {
      lineHeight = Math.round((lineHeight - 0.1) * 10) / 10 // Round to 1 decimal
      debugLog(`[LineHeight] Decreased to ${lineHeight}`)
      broadcastState({ lineHeight })
    }
  }

  function increasePaddingVertical() {
    if (paddingVertical < 100) {
      paddingVertical += 5
      paddingTop = paddingVertical
      paddingBottom = paddingVertical
      debugLog(`[Padding] Vertical increased to ${paddingVertical}px`)
      broadcastState({ paddingTop, paddingBottom })
    }
  }

  function decreasePaddingVertical() {
    if (paddingVertical > 0) {
      paddingVertical -= 5
      paddingTop = paddingVertical
      paddingBottom = paddingVertical
      debugLog(`[Padding] Vertical decreased to ${paddingVertical}px`)
      broadcastState({ paddingTop, paddingBottom })
    }
  }

  function increasePaddingHorizontal() {
    if (paddingHorizontal < 200) {
      paddingHorizontal += 10
      paddingRight = paddingHorizontal
      paddingLeft = paddingHorizontal
      debugLog(`[Padding] Horizontal increased to ${paddingHorizontal}px`)
      broadcastState({ paddingRight, paddingLeft })
    }
  }

  function decreasePaddingHorizontal() {
    if (paddingHorizontal > 0) {
      paddingHorizontal -= 10
      paddingRight = paddingHorizontal
      paddingLeft = paddingHorizontal
      debugLog(`[Padding] Horizontal decreased to ${paddingHorizontal}px`)
      broadcastState({ paddingRight, paddingLeft })
    }
  }

  // Color preset functions
  function applyColorPreset(preset: string) {
    switch (preset) {
      case 'dark':
        textColor = '#e0e0e0'
        backgroundColor = '#1e1e1e'
        debugLog(`[Color] Applied preset: Dark Mode`)
        break
      case 'light':
        textColor = '#2e2e2e'
        backgroundColor = '#f5f5f5'
        debugLog(`[Color] Applied preset: Light Mode`)
        break
      case 'black':
        textColor = '#ffffff'
        backgroundColor = '#000000'
        debugLog(`[Color] Applied preset: Pure Black`)
        break
      case 'high-contrast':
        textColor = '#ffffff'
        backgroundColor = '#000000'
        debugLog(`[Color] Applied preset: High Contrast`)
        break
      case 'sepia':
        textColor = '#5c4a2f'
        backgroundColor = '#f4ecd8'
        debugLog(`[Color] Applied preset: Sepia`)
        break
      case 'green-on-black':
        textColor = '#33ff33'
        backgroundColor = '#000000'
        debugLog(`[Color] Applied preset: Green on Black (Terminal)`)
        break
      case 'amber-on-black':
        textColor = '#ffb000'
        backgroundColor = '#000000'
        debugLog(`[Color] Applied preset: Amber on Black (Retro)`)
        break
    }
    broadcastState({ textColor, backgroundColor })
  }

  function setTextColor(color: string) {
    textColor = color
    debugLog(`[Color] Text color set to ${color}`)
    broadcastState({ textColor })
  }

  function setBackgroundColor(color: string) {
    backgroundColor = color
    debugLog(`[Color] Background color set to ${color}`)
    broadcastState({ backgroundColor })
  }

  // Font family preset functions
  function applyFontPreset(preset: string) {
    switch (preset) {
      case 'system':
        fontFamily = 'inherit'
        debugLog(`[Font] Applied preset: System Default`)
        break
      case 'sans':
        fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        debugLog(`[Font] Applied preset: Sans-serif`)
        break
      case 'serif':
        fontFamily = 'Georgia, "Times New Roman", Times, serif'
        debugLog(`[Font] Applied preset: Serif`)
        break
      case 'mono':
        fontFamily = '"Courier New", Courier, Monaco, "Lucida Console", monospace'
        debugLog(`[Font] Applied preset: Monospace`)
        break
      case 'readable':
        fontFamily = 'Verdana, Tahoma, "DejaVu Sans", sans-serif'
        debugLog(`[Font] Applied preset: Readable`)
        break
      case 'slab':
        fontFamily = '"Courier New", "Rockwell", "Courier", monospace'
        debugLog(`[Font] Applied preset: Slab Serif`)
        break
    }
    broadcastState({ fontFamily })
  }

  function setFontFamily(family: string) {
    fontFamily = family
    showFontFamilyList = false
    debugLog(`[Font] Font family set to ${family}`)
    broadcastState({ fontFamily })
  }

  // Flip control functions
  function toggleFlipHorizontal() {
    flipHorizontal = !flipHorizontal
    debugLog(`[Flip] Horizontal flip: ${flipHorizontal ? 'ON' : 'OFF'}`)
    broadcastState({ flipHorizontal })
  }

  function toggleFlipVertical() {
    flipVertical = !flipVertical
    debugLog(`[Flip] Vertical flip: ${flipVertical ? 'ON' : 'OFF'}`)
    broadcastState({ flipVertical })
  }

  function setFlipHorizontal(value: boolean) {
    flipHorizontal = value
    debugLog(`[Flip] Horizontal flip set to: ${value ? 'ON' : 'OFF'}`)
    broadcastState({ flipHorizontal })
  }

  function setFlipVertical(value: boolean) {
    flipVertical = value
    debugLog(`[Flip] Vertical flip set to: ${value ? 'ON' : 'OFF'}`)
    broadcastState({ flipVertical })
  }

  // View mode control functions (for Stream Deck)
  function toggleViewMode() {
    viewMode = viewMode === 'rendered' ? 'plain' : 'rendered'
    debugLog(`[ViewMode] Switched to: ${viewMode}`)
    broadcastState({ viewMode })
  }

  function setViewMode(mode: 'rendered' | 'plain') {
    viewMode = mode
    debugLog(`[ViewMode] Set to: ${mode}`)
    broadcastState({ viewMode })
  }

  // Check if we're in a popout window (detached)
  function isInPopoutWindow(): boolean {
    // Get the ACTUAL window from the mounted DOM element, not from props
    // This is critical because props are set before the element is in the popout DOM
    const currentWindow = teleprompterContainer?.ownerDocument?.defaultView

    // Get the main Obsidian window from the workspace container
    // app.workspace.containerEl is ALWAYS in the main window
    const mainWindow = app.workspace.containerEl.ownerDocument.defaultView

    // If we don't have a container yet, we can't determine - assume main window
    if (!currentWindow) {
      return false
    }

    // Compare window objects - if different, we're in a popout
    return currentWindow !== mainWindow
  }

  // Detach function (open teleprompter in a popout window, or close if already detached)
  function detachWindow() {
    // If already in a popout window, close it instead
    if (isInPopoutWindow()) {
      debugLog('[Detach] Already in popout window - closing')
      // Get the actual window from the DOM element
      const currentWindow = teleprompterContainer?.ownerDocument?.defaultView
      if (currentWindow) {
        currentWindow.close()
      }
      return
    }

    debugLog('[Detach] Opening teleprompter in popout window')
    try {
      // Use openPopoutLeaf() which is specifically designed for popout windows
      // This is more reliable than getLeaf('window') as it properly initializes the window context
      const leaf = app.workspace.openPopoutLeaf()
      if (leaf) {
        leaf.setViewState({
          type: 'teleprompter-plus-view',
          active: true
        })
        debugLog('[Detach] Popout window opened successfully')
      }
    } catch (error) {
      // Fallback to new tab if popout fails (e.g., on mobile)
      debugLog('[Detach] Popout failed, falling back to new tab:', error)
      const leaf = app.workspace.getLeaf('tab')
      if (leaf) {
        leaf.setViewState({
          type: 'teleprompter-plus-view',
          active: true
        })
        debugLog('[Detach] Fallback: New tab opened')
      }
    }
  }

  // Open file function (for Stream Deck)
  async function openFile(filePath: string) {
    debugLog(`[OpenFile] Opening file: ${filePath}`)
    const file = app.vault.getAbstractFileByPath(filePath)
    if (file && 'extension' in file && file.extension === 'md') {
      try {
        const fileContent = await app.vault.read(file as any)
        const result = removeYAMLFrontmatter(fileContent)
        content = result.content
        yamlLineOffset = result.linesRemoved
        currentFileName = file.name.replace('.md', '')
        hasUsedCountdown = false
        debugLog(`[OpenFile] Loaded: ${currentFileName}`)
      } catch (err) {
        debugLog(`[OpenFile] Error loading file: ${err}`)
      }
    } else {
      debugLog(`[OpenFile] File not found or not markdown: ${filePath}`)
    }
  }

  // Text alignment functions
  function cycleTextAlignment() {
    const alignments: ('left' | 'center' | 'right' | 'rtl')[] = ['left', 'center', 'right', 'rtl']
    const currentIndex = alignments.indexOf(textAlignment)
    const nextIndex = (currentIndex + 1) % alignments.length
    textAlignment = alignments[nextIndex]
    debugLog(`[Alignment] Text alignment: ${textAlignment.toUpperCase()}`)
    broadcastState({ textAlignment })
  }

  function setTextAlignment(value: 'left' | 'center' | 'right' | 'rtl') {
    textAlignment = value
    debugLog(`[Alignment] Text alignment set to: ${value.toUpperCase()}`)
    broadcastState({ textAlignment })
  }

  // Scroll synchronization functions
  function toggleScrollSync() {
    scrollSyncEnabled = !scrollSyncEnabled
    debugLog(`[ScrollSync] Scroll synchronization: ${scrollSyncEnabled ? 'ENABLED' : 'DISABLED'}`)
  }

  function setScrollSync(value: boolean) {
    scrollSyncEnabled = value
    debugLog(`[ScrollSync] Scroll synchronization set to: ${value ? 'ENABLED' : 'DISABLED'}`)
  }

  // Minimap functions
  function toggleMinimap() {
    showMinimap = !showMinimap
    debugLog(`[Minimap] Minimap: ${showMinimap ? 'SHOWN' : 'HIDDEN'}`)
    broadcastState({ showMinimap })
  }

  function setMinimap(value: boolean) {
    showMinimap = value
    debugLog(`[Minimap] Minimap set to: ${value ? 'SHOWN' : 'HIDDEN'}`)
  }

  function handleMinimapClick(e: MouseEvent) {
    if (!contentArea || !minimapElement) return

    // Cancel countdown and pause playback when manually navigating
    if (isCountingDown) {
      isCountingDown = false
      currentCountdown = 0
      debugLog('[Minimap] Cancelled countdown due to manual navigation')
    }
    if (isPlaying) {
      isPlaying = false
      debugLog('[Minimap] Paused playback due to manual navigation')
    }

    const rect = minimapElement.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const minimapHeight = rect.height

    // Calculate scroll position based on click position in minimap
    const scrollPercentage = clickY / minimapHeight
    const maxScroll = contentArea.scrollHeight - contentArea.clientHeight
    const targetScroll = scrollPercentage * maxScroll

    contentArea.scrollTop = targetScroll
    debugLog(`[Minimap] Jumped to ${(scrollPercentage * 100).toFixed(1)}% of document`)
  }

  // Progress indicator style functions
  function setProgressIndicatorStyle(style: 'progress-bar' | 'scrollbar' | 'none') {
    progressIndicatorStyle = style
    debugLog(`[ProgressIndicator] Style set to: ${style}`)
    broadcastState({ progressIndicatorStyle })
  }

  function cycleProgressIndicatorStyle() {
    const styles: ('progress-bar' | 'scrollbar' | 'none')[] = ['progress-bar', 'scrollbar', 'none']
    const currentIndex = styles.indexOf(progressIndicatorStyle)
    const nextIndex = (currentIndex + 1) % styles.length
    progressIndicatorStyle = styles[nextIndex]
    debugLog(`[ProgressIndicator] Cycled to: ${progressIndicatorStyle}`)
    broadcastState({ progressIndicatorStyle })
  }

  // Handle click on progress bar to jump to position
  function handleProgressBarClick(e: MouseEvent) {
    if (!contentArea) return
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const barWidth = rect.width

    // Calculate scroll position based on click position
    const clickPercentage = clickX / barWidth
    const maxScroll = contentArea.scrollHeight - contentArea.clientHeight
    const targetScroll = clickPercentage * maxScroll

    // Cancel countdown and pause playback when manually navigating
    if (isCountingDown) {
      isCountingDown = false
      currentCountdown = 0
      debugLog('[ProgressBar] Cancelled countdown due to manual navigation')
    }
    if (isPlaying) {
      isPlaying = false
      debugLog('[ProgressBar] Paused playback due to manual navigation')
    }

    contentArea.scrollTop = targetScroll
    debugLog(`[ProgressBar] Jumped to ${(clickPercentage * 100).toFixed(1)}% of document`)
  }

  function startResize(e: MouseEvent) {
    isResizing = true
    e.preventDefault()
    e.stopPropagation()
  }

  function handleMouseMove(e: MouseEvent) {
    if (isResizing) {
      // Get the panel's bounding rect to calculate relative position
      const panel = getActualDocument().querySelector('.navigation-panel') as HTMLElement
      if (panel) {
        const rect = panel.getBoundingClientRect()
        // For right-side panel, calculate width from right edge
        const newWidth = rect.right - e.clientX
        if (newWidth >= 150 && newWidth <= 600) {
          navigationWidth = newWidth
        }
      }
    }
  }

  function stopResize() {
    isResizing = false
  }

  function startDragEyeline(e: MouseEvent) {
    isDraggingIndicator = true
    e.preventDefault()
    e.stopPropagation()
  }

  function handleEyelineDrag(e: MouseEvent) {
    if (isDraggingIndicator && contentArea) {
      const containerRect = contentArea.getBoundingClientRect()
      if (!containerRect.height) return

      // Calculate position relative to viewport
      let yPos = e.clientY - containerRect.top

      // Clamp to container bounds
      yPos = Math.max(0, Math.min(containerRect.height, yPos))

      // Convert to percentage of visible content area
      eyelinePosition = (yPos / containerRect.height) * 100
    }
  }

  function stopDragEyeline() {
    isDraggingIndicator = false
  }

  // Focus management for keyboard shortcuts
  function handleTeleprompterFocus() {
    isTeleprompterFocused = true
    debugLog('[Focus] Teleprompter focused - keyboard shortcuts ACTIVE')
  }

  function handleTeleprompterBlur(event: FocusEvent) {
    isTeleprompterFocused = false
    debugLog('[Focus] Teleprompter unfocused - keyboard shortcuts INACTIVE')

    // Check if focus is moving to a child element (like a button)
    // If so, don't trigger auto-pause - user is just clicking controls
    const relatedTarget = event.relatedTarget as HTMLElement | null
    if (relatedTarget && teleprompterContainer?.contains(relatedTarget)) {
      debugLog('[AutoPause] Focus moved to child element, NOT pausing')
      return
    }

    // Auto-pause when user starts editing (clicks on editor)
    if (autoPauseOnEdit && isPlaying) {
      isPlaying = false
      debugLog('[AutoPause] Teleprompter paused - user clicked outside to edit')
    }
  }

  function focusTeleprompter() {
    if (teleprompterContainer) {
      teleprompterContainer.focus()
    }
  }

  function unfocusTeleprompter() {
    if (teleprompterContainer) {
      teleprompterContainer.blur()
    }
  }

  // Auto-pause on edit controls
  function toggleAutoPauseOnEdit() {
    autoPauseOnEdit = !autoPauseOnEdit
    debugLog(`[AutoPause] Auto-pause on edit: ${autoPauseOnEdit ? 'ENABLED' : 'DISABLED'}`)
  }

  function setAutoPauseOnEdit(enabled: boolean) {
    autoPauseOnEdit = enabled
    debugLog(`[AutoPause] Auto-pause on edit set to: ${enabled ? 'ENABLED' : 'DISABLED'}`)
  }

  // Keyboard shortcuts
  // Get custom hotkeys from settings (with defaults)
  const customHotkeys = settings.customHotkeys || {
    ' ': 'togglePlay',
    'ArrowUp': 'speedUp',
    'ArrowDown': 'speedDown',
    'ArrowLeft': 'scrollUp',
    'ArrowRight': 'scrollDown',
    'Home': 'resetToTop',
    'n': 'toggleNavigation',
    'N': 'toggleNavigation',
    'j': 'nextSection',
    'k': 'prevSection',
    'p': 'cycleSpeedPreset',
    'f': 'toggleFullscreen',
    'e': 'toggleEyeline',
  }

  // Execute hotkey action
  function executeHotkeyAction(action: string): boolean {
    switch (action) {
      case 'togglePlay':
        togglePlay()
        return true
      case 'speedUp':
        if (speed < 50) speed++
        return true
      case 'speedDown':
        if (speed > 1) speed--
        return true
      case 'scrollUp':
        if (contentArea) contentArea.scrollTop -= 100
        return true
      case 'scrollDown':
        if (contentArea) contentArea.scrollTop += 100
        return true
      case 'resetToTop':
        resetToTop()
        return true
      case 'toggleNavigation':
        toggleNavigation()
        return true
      case 'nextSection':
        jumpToNextSection()
        return true
      case 'prevSection':
        jumpToPreviousSection()
        return true
      case 'cycleSpeedPreset':
        cycleSpeedPreset()
        return true
      case 'toggleFullscreen':
        toggleFullScreen()
        return true
      case 'toggleEyeline':
        toggleEyeline()
        return true
      case 'toggleVoiceTracking':
        toggleVoiceTracking()
        return true
      default:
        return false
    }
  }

  function handleKeyPress(e: KeyboardEvent) {
    // Skip if typing in input fields
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    // Handle Escape key globally - unfocus teleprompter and return to editor
    if (e.key === 'Escape') {
      if (isTeleprompterFocused) {
        e.preventDefault()
        unfocusTeleprompter()
        debugLog('[Focus] Escape pressed - returning focus to editor')
      }
      return
    }

    // IMPORTANT: Only process other shortcuts if teleprompter is focused
    // This allows the user to edit notes without triggering teleprompter shortcuts
    if (!isTeleprompterFocused) {
      return // Don't handle shortcuts - user is editing their note
    }

    // Check custom hotkeys
    const action = customHotkeys[e.key]
    if (action) {
      e.preventDefault()
      executeHotkeyAction(action)
      debugLog(`[Hotkey] ${e.key} -> ${action}`)
      return
    }

    // Number keys 1-9 to jump to header sections (always enabled)
    if (e.key >= '1' && e.key <= '9') {
      const index = parseInt(e.key) - 1
      const headerList = headers()
      if (index < headerList.length) {
        jumpToHeader(headerList[index].id)
      }
    }
  }

  function resetToTop() {
    if (contentArea) {
      contentArea.scrollTop = 0
      if (isPlaying) isPlaying = false
      currentHeaderIndex = 0 // Reset header navigation index

      // Reset countdown flag when explicitly resetting to top
      hasUsedCountdown = false
      debugLog('[Reset] Reset to top - countdown flag reset')
    }
  }

  // WebSocket event handlers
  function handleWebSocketEvent(event: Event) {
    const customEvent = event as CustomEvent
    debugLog(`[Event] Received: ${customEvent.type}`)

    switch (customEvent.type) {
      case 'teleprompter:toggle-play':
        togglePlay()
        break
      case 'teleprompter:play':
        if (!isPlaying) isPlaying = true
        break
      case 'teleprompter:pause':
        if (isPlaying) isPlaying = false
        break
      case 'teleprompter:increase-speed':
        speed = Math.min(speed + speedIncrement, settings.maxScrollSpeed || 10)
        break
      case 'teleprompter:decrease-speed':
        speed = Math.max(speed - speedIncrement, settings.minScrollSpeed || 0.5)
        break
      case 'teleprompter:set-speed':
        if (customEvent.detail?.speed) {
          speed = Math.max(1, Math.min(50, customEvent.detail.speed))
        }
        break
      // Speed preset commands
      case 'teleprompter:cycle-speed-preset':
        cycleSpeedPreset()
        break
      case 'teleprompter:next-speed-preset':
        nextSpeedPreset()
        break
      case 'teleprompter:prev-speed-preset':
        prevSpeedPreset()
        break
      case 'teleprompter:set-speed-preset':
        if (customEvent.detail?.speed) {
          setSpeedPreset(customEvent.detail.speed)
        }
        break
      case 'teleprompter:speed-preset-0.5':
        setSpeedPreset(0.5)
        break
      case 'teleprompter:speed-preset-1':
        setSpeedPreset(1)
        break
      case 'teleprompter:speed-preset-1.5':
        setSpeedPreset(1.5)
        break
      case 'teleprompter:speed-preset-2':
        setSpeedPreset(2)
        break
      case 'teleprompter:speed-preset-3':
        setSpeedPreset(3)
        break
      case 'teleprompter:speed-preset-5':
        setSpeedPreset(5)
        break
      case 'teleprompter:reset-to-top':
        resetToTop()
        break
      case 'teleprompter:scroll':
        if (contentArea && customEvent.detail?.amount) {
          contentArea.scrollTop += customEvent.detail.amount
        }
        break
      case 'teleprompter:set-scroll-position':
        // Network Broadcast: Set absolute scroll position (for follower devices)
        if (contentArea && customEvent.detail?.position !== undefined) {
          contentArea.scrollTop = customEvent.detail.position
          debugLog(`[Network Sync] Scroll position set to ${customEvent.detail.position}px`)
        }
        break
      case 'teleprompter:set-scroll-percentage':
        // Network Broadcast: Set scroll by percentage (for follower devices)
        if (contentArea && customEvent.detail?.percentage !== undefined) {
          const scrollableHeight = contentArea.scrollHeight - contentArea.clientHeight
          contentArea.scrollTop = (customEvent.detail.percentage / 100) * scrollableHeight
          debugLog(`[Network Sync] Scroll percentage set to ${customEvent.detail.percentage}%`)
        }
        break
      case 'teleprompter:jump-to-header':
        if (customEvent.detail?.index !== undefined) {
          const headerList = headers()
          if (customEvent.detail.index < headerList.length) {
            jumpToHeader(headerList[customEvent.detail.index].id)
          }
        }
        break
      case 'teleprompter:jump-to-header-by-id':
        if (customEvent.detail?.headerId) {
          jumpToHeader(customEvent.detail.headerId)
        }
        break
      case 'teleprompter:toggle-navigation':
        toggleNavigation()
        break
      case 'teleprompter:show-navigation':
        if (!showNavigation) showNavigation = true
        break
      case 'teleprompter:hide-navigation':
        if (showNavigation) showNavigation = false
        break
      case 'teleprompter:next-section':
        jumpToNextSection()
        break
      case 'teleprompter:previous-section':
        jumpToPreviousSection()
        break
      case 'teleprompter:broadcast-state':
        broadcastStateToWebSocket()
        break
      case 'teleprompter:set-font-size':
        if (customEvent.detail?.fontSize) {
          fontSize = customEvent.detail.fontSize
        }
        break
      case 'teleprompter:apply-all-settings':
        if (customEvent.detail) {
          const settings = customEvent.detail
          if (settings.fontSize) fontSize = settings.fontSize
          if (settings.textColor) textColor = settings.textColor
          if (settings.backgroundColor) backgroundColor = settings.backgroundColor
          if (settings.fontFamily) fontFamily = settings.fontFamily
          if (settings.lineHeight) lineHeight = settings.lineHeight
          if (settings.paddingVertical !== undefined) paddingVertical = settings.paddingVertical
          if (settings.paddingHorizontal !== undefined) paddingHorizontal = settings.paddingHorizontal
          if (settings.backgroundOpacity !== undefined) backgroundOpacity = settings.backgroundOpacity
          if (settings.enableBackgroundTransparency !== undefined) enableBackgroundTransparency = settings.enableBackgroundTransparency
          debugLog('[Teleprompter] Applied all settings from preset:', settings)
        }
        break
      case 'teleprompter:font-size-up':
        if (fontSize < 72) {
          fontSize += 2
          debugLog(`[Font] Size: ${fontSize}px`)
          broadcastState({ fontSize })
        }
        break
      case 'teleprompter:font-size-down':
        if (fontSize > 12) {
          fontSize -= 2
          debugLog(`[Font] Size: ${fontSize}px`)
          broadcastState({ fontSize })
        }
        break
      case 'teleprompter:toggle-eyeline':
        toggleEyeline()
        break
      case 'teleprompter:show-eyeline':
        if (!showEyeline) showEyeline = true
        break
      case 'teleprompter:hide-eyeline':
        if (showEyeline) showEyeline = false
        break
      case 'teleprompter:toggle-focus-mode':
        toggleFocusMode()
        break
      case 'teleprompter:enable-focus-mode':
        if (!focusMode) {
          focusMode = true
          broadcastState({ focusMode })
          debugLog('[FocusMode] Enabled')
        }
        break
      case 'teleprompter:disable-focus-mode':
        if (focusMode) {
          focusMode = false
          broadcastState({ focusMode })
          debugLog('[FocusMode] Disabled')
        }
        break
      case 'teleprompter:countdown-increase':
        increaseCountdown()
        debugLog(`[Countdown] Increased to ${countdownSeconds}s`)
        break
      case 'teleprompter:countdown-decrease':
        decreaseCountdown()
        debugLog(`[Countdown] Decreased to ${countdownSeconds}s`)
        break
      case 'teleprompter:set-countdown':
        if (customEvent.detail?.seconds !== undefined) {
          countdownSeconds = Math.max(0, Math.min(30, customEvent.detail.seconds))
          debugLog(`[Countdown] Set to ${countdownSeconds}s`)
        }
        break
      case 'teleprompter:start-countdown':
        startCountdown()
        debugLog(`[Countdown] Started with ${countdownSeconds}s`)
        break
      case 'teleprompter:toggle-pin':
        togglePin()
        break
      case 'teleprompter:pin-note':
        if (!isPinned) togglePin()
        break
      case 'teleprompter:unpin-note':
        if (isPinned) togglePin()
        break
      case 'teleprompter:refresh-pinned':
        refreshPinnedNote()
        break
      case 'teleprompter:toggle-keep-awake':
        toggleKeepAwake()
        break
      case 'teleprompter:enable-keep-awake':
        if (!isKeepAwake) toggleKeepAwake()
        break
      case 'teleprompter:disable-keep-awake':
        if (isKeepAwake) toggleKeepAwake()
        break
      case 'teleprompter:toggle-auto-pause':
        toggleAutoPauseOnEdit()
        break
      case 'teleprompter:enable-auto-pause':
        setAutoPauseOnEdit(true)
        break
      case 'teleprompter:disable-auto-pause':
        setAutoPauseOnEdit(false)
        break
      case 'teleprompter:toggle-double-click-edit':
        settings.doubleClickToEdit = !settings.doubleClickToEdit
        debugLog(`[DoubleClick] Toggled to ${settings.doubleClickToEdit}`)
        break
      case 'teleprompter:enable-double-click-edit':
        settings.doubleClickToEdit = true
        debugLog('[DoubleClick] Enabled')
        break
      case 'teleprompter:disable-double-click-edit':
        settings.doubleClickToEdit = false
        debugLog('[DoubleClick] Disabled')
        break
      case 'teleprompter:toggle-fullscreen':
        toggleFullScreen()
        break
      case 'teleprompter:enable-fullscreen':
        if (!isFullScreen) toggleFullScreen()
        break
      case 'teleprompter:disable-fullscreen':
        if (isFullScreen) toggleFullScreen()
        break
      case 'teleprompter:line-height-increase':
        increaseLineHeight()
        break
      case 'teleprompter:line-height-decrease':
        decreaseLineHeight()
        break
      case 'teleprompter:padding-vertical-increase':
        increasePaddingVertical()
        break
      case 'teleprompter:padding-vertical-decrease':
        decreasePaddingVertical()
        break
      case 'teleprompter:padding-horizontal-increase':
        increasePaddingHorizontal()
        break
      case 'teleprompter:padding-horizontal-decrease':
        decreasePaddingHorizontal()
        break
      case 'teleprompter:color-preset':
        if (customEvent.detail?.preset) {
          applyColorPreset(customEvent.detail.preset)
        }
        break
      case 'teleprompter:color-preset-dark':
        applyColorPreset('dark')
        break
      case 'teleprompter:color-preset-light':
        applyColorPreset('light')
        break
      case 'teleprompter:color-preset-black':
        applyColorPreset('black')
        break
      case 'teleprompter:color-preset-sepia':
        applyColorPreset('sepia')
        break
      case 'teleprompter:color-preset-green':
        applyColorPreset('green-on-black')
        break
      case 'teleprompter:color-preset-amber':
        applyColorPreset('amber-on-black')
        break
      case 'teleprompter:set-text-color':
        if (customEvent.detail?.color) {
          setTextColor(customEvent.detail.color)
        }
        break
      case 'teleprompter:set-background-color':
        if (customEvent.detail?.color) {
          setBackgroundColor(customEvent.detail.color)
        }
        break
      case 'teleprompter:font-preset':
        if (customEvent.detail?.preset) {
          applyFontPreset(customEvent.detail.preset)
        }
        break
      case 'teleprompter:font-preset-system':
        applyFontPreset('system')
        break
      case 'teleprompter:font-preset-sans':
        applyFontPreset('sans')
        break
      case 'teleprompter:font-preset-serif':
        applyFontPreset('serif')
        break
      case 'teleprompter:font-preset-mono':
        applyFontPreset('mono')
        break
      case 'teleprompter:font-preset-readable':
        applyFontPreset('readable')
        break
      case 'teleprompter:font-preset-slab':
        applyFontPreset('slab')
        break
      case 'teleprompter:set-font-family':
        if (customEvent.detail?.family) {
          setFontFamily(customEvent.detail.family)
        }
        break
      case 'teleprompter:toggle-flip-horizontal':
        toggleFlipHorizontal()
        break
      case 'teleprompter:enable-flip-horizontal':
        setFlipHorizontal(true)
        break
      case 'teleprompter:disable-flip-horizontal':
        setFlipHorizontal(false)
        break
      case 'teleprompter:toggle-flip-vertical':
        toggleFlipVertical()
        break
      case 'teleprompter:enable-flip-vertical':
        setFlipVertical(true)
        break
      case 'teleprompter:disable-flip-vertical':
        setFlipVertical(false)
        break
      // Text alignment commands
      case 'teleprompter:cycle-alignment':
        cycleTextAlignment()
        break
      case 'teleprompter:align-left':
        setTextAlignment('left')
        break
      case 'teleprompter:align-center':
        setTextAlignment('center')
        break
      case 'teleprompter:align-right':
        setTextAlignment('right')
        break
      case 'teleprompter:align-rtl':
        setTextAlignment('rtl')
        break
      case 'teleprompter:toggle-scroll-sync':
        toggleScrollSync()
        break
      case 'teleprompter:enable-scroll-sync':
        setScrollSync(true)
        break
      case 'teleprompter:disable-scroll-sync':
        setScrollSync(false)
        break
      case 'teleprompter:toggle-minimap':
        toggleMinimap()
        break
      case 'teleprompter:show-minimap':
        setMinimap(true)
        break
      case 'teleprompter:hide-minimap':
        setMinimap(false)
        break
      // Progress indicator style commands
      case 'teleprompter:cycle-progress-indicator':
        cycleProgressIndicatorStyle()
        break
      case 'teleprompter:progress-indicator-bar':
        setProgressIndicatorStyle('progress-bar')
        break
      case 'teleprompter:progress-indicator-scrollbar':
        setProgressIndicatorStyle('scrollbar')
        break
      case 'teleprompter:progress-indicator-none':
        setProgressIndicatorStyle('none')
        break
      // v0.7.0 commands
      case 'teleprompter:toggle-eyeline':
        toggleEyeline()
        break
      case 'teleprompter:cycle-speed-preset':
        cycleSpeedPreset()
        break
      case 'teleprompter:next-speed-preset':
        nextSpeedPreset()
        break
      case 'teleprompter:prev-speed-preset':
        prevSpeedPreset()
        break
      case 'teleprompter:cycle-alignment':
        cycleTextAlignment()
        break
      case 'teleprompter:broadcast-state':
        broadcastStateToWebSocket()
        break
      // v0.8.0 Stream Deck commands - Letter spacing
      case 'teleprompter:letter-spacing-increase':
        increaseLetterSpacing()
        break
      case 'teleprompter:letter-spacing-decrease':
        decreaseLetterSpacing()
        break
      // v0.8.0 Stream Deck commands - Opacity
      case 'teleprompter:opacity-increase':
        increaseOpacity()
        break
      case 'teleprompter:opacity-decrease':
        decreaseOpacity()
        break
      // v0.8.0 Stream Deck commands - View mode
      case 'teleprompter:toggle-view-mode':
        toggleViewMode()
        break
      case 'teleprompter:set-view-mode-rendered':
        setViewMode('rendered')
        break
      case 'teleprompter:set-view-mode-plain':
        setViewMode('plain')
        break
      // v0.8.0 Stream Deck commands - Detach window
      case 'teleprompter:detach-window':
        detachWindow()
        break
      // v0.8.0 Stream Deck commands - Open file
      case 'teleprompter:open-file':
        if (customEvent.detail?.path) {
          openFile(customEvent.detail.path)
        }
        break
      // Voice tracking commands
      case 'teleprompter:voice-start':
        if (!voiceTrackingActive) toggleVoiceTracking()
        break
      case 'teleprompter:voice-stop':
        if (voiceTrackingActive) toggleVoiceTracking()
        break
      case 'teleprompter:voice-toggle':
        toggleVoiceTracking()
        break
      case 'teleprompter:get-voice-status':
        // Update WebSocket state with voice status
        if (plugin?.wsServer) {
          plugin.wsServer.updateState({
            voiceTrackingActive,
            voiceTrackingStatus
          })
        }
        break
    }
  }

  // Broadcast current state to WebSocket clients
  function broadcastStateToWebSocket() {
    if (!plugin) return

    const activeFile = app.workspace.getActiveFile()

    plugin.broadcastState({
      isPlaying,
      speed,
      scrollPosition: contentArea?.scrollTop || 0,
      maxScroll: contentArea?.scrollHeight || 0,
      scrollPercentage: contentArea
        ? ((contentArea.scrollTop / (contentArea.scrollHeight - contentArea.clientHeight)) * 100)
        : 0,
      currentNote: activeFile?.path || null,
      currentNoteTitle: activeFile?.basename || null,
      headers: headers().map(h => ({
        id: h.id,
        text: h.text,
        level: h.level,
      })),
      navigationVisible: showNavigation,
      fontSize,
      eyelineVisible: showEyeline,
      eyelinePosition,
      countdownSeconds,
      isCountingDown,
      currentCountdown,
      isPinned,
      pinnedNotePath,
      isKeepAwake,
      isFullScreen,
      focusMode,
      progressIndicatorStyle,
      autoPauseOnEdit,
      doubleClickToEdit: settings.doubleClickToEdit,
      textAlignment,
      speedPresets: [...SPEED_PRESETS],
      currentSpeedPresetIndex: currentPresetIndex,
    })
  }

  // Auto-broadcast state when it changes (to WebSocket and other windows)
  $effect(() => {
    // Track these reactive values
    const stateSnapshot = {
      isPlaying,
      speed,
      scrollPos: contentArea?.scrollTop,
      showNav: showNavigation,
      headerCount: headers().length,
      fontSize,
    }

    // Broadcast after a short debounce
    const timer = setTimeout(() => {
      broadcastStateToWebSocket()
    }, 100)

    return () => clearTimeout(timer)
  })

  // NOTE: Cross-window state sync is handled by individual broadcastState() calls
  // in each handler function (togglePlay, setSpeed, etc.). We do NOT use $effect()
  // for broadcasting because it creates infinite loops:
  // 1. Window A changes state → $effect fires → broadcasts
  // 2. Window B receives → updates state → $effect fires → broadcasts back
  // 3. Infinite loop
  //
  // The correct pattern: broadcast only on explicit user actions, not on state changes.

  // Add global mouse and keyboard event listeners
  onMount(() => {
    loadActiveNote()

    // Auto-start playing if setting is enabled
    if (settings.autoStartPlaying) {
      // Delay slightly to ensure content is loaded
      setTimeout(() => {
        isPlaying = true
      }, 500)
    }

    // Listen for active file changes
    const eventRef = app.workspace.on('active-leaf-change', () => {
      loadActiveNote()
    })

    // Get actual document/window from mounted element for popout window support
    // IMPORTANT: Must use getActualDocument() here, NOT activeDoc from props
    // because props are captured before element is moved to popout DOM
    const actualDoc = getActualDocument()
    const actualWin = getActualWindow()

    // Add resize listeners
    actualDoc.addEventListener('mousemove', handleMouseMove)
    actualDoc.addEventListener('mouseup', stopResize)

    // Add eyeline drag listeners
    actualDoc.addEventListener('mousemove', handleEyelineDrag)
    actualDoc.addEventListener('mouseup', stopDragEyeline)

    // Add window resize listener to recalculate eyeline position
    const handleResize = () => {
      calculateEyelinePixelPosition()
    }
    actualWin.addEventListener('resize', handleResize)

    // Calculate initial eyeline position
    calculateEyelinePixelPosition()

    // Add keyboard listeners
    actualDoc.addEventListener('keydown', handleKeyPress)
    actualDoc.addEventListener('keydown', handleFullScreenKeyPress)
    actualDoc.addEventListener('keyup', handleFullScreenKeyRelease)

    // Add scroll listener to track current section (debounced for performance)
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null
    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        updateCurrentVisibleHeader()
      }, 50) // Debounce scroll events by 50ms
    }
    if (contentArea) {
      contentArea.addEventListener('scroll', handleScroll, { passive: true })
    }

    // Load initial font size from plugin settings
    if (plugin?.settings?.fontSize) {
      fontSize = plugin.settings.fontSize
    }

    // Load initial colors from plugin settings
    if (plugin?.settings?.textColor) {
      textColor = plugin.settings.textColor
    }
    if (plugin?.settings?.backgroundColor) {
      backgroundColor = plugin.settings.backgroundColor
    }

    // Load initial transparency settings from plugin settings
    if (plugin?.settings?.backgroundOpacity !== undefined) {
      backgroundOpacity = plugin.settings.backgroundOpacity
    }
    if (plugin?.settings?.enableBackgroundTransparency !== undefined) {
      enableBackgroundTransparency = plugin.settings.enableBackgroundTransparency
    }

    // Load initial font family from plugin settings
    if (plugin?.settings?.fontFamily) {
      fontFamily = plugin.settings.fontFamily
    }

    // Load initial flip settings from plugin settings
    if (plugin?.settings?.flipHorizontal !== undefined) {
      flipHorizontal = plugin.settings.flipHorizontal
    }
    if (plugin?.settings?.flipVertical !== undefined) {
      flipVertical = plugin.settings.flipVertical
    }

    // Load initial scroll sync setting from plugin settings
    if (plugin?.settings?.scrollSyncEnabled !== undefined) {
      scrollSyncEnabled = plugin.settings.scrollSyncEnabled
    }

    // Load initial minimap setting from plugin settings
    if (plugin?.settings?.showMinimap !== undefined) {
      showMinimap = plugin.settings.showMinimap
    }

    // Load focus mode settings
    if (plugin?.settings?.focusMode !== undefined) {
      focusMode = plugin.settings.focusMode
    }
    if (plugin?.settings?.focusModeOpacity !== undefined) {
      focusModeOpacity = plugin.settings.focusModeOpacity
    }
    if (plugin?.settings?.focusModeRange !== undefined) {
      focusModeRange = plugin.settings.focusModeRange
    }

    // Register WebSocket event listeners
    const wsEvents = [
      'teleprompter:toggle-play',
      'teleprompter:play',
      'teleprompter:pause',
      'teleprompter:increase-speed',
      'teleprompter:decrease-speed',
      'teleprompter:set-speed',
      'teleprompter:cycle-speed-preset',
      'teleprompter:next-speed-preset',
      'teleprompter:prev-speed-preset',
      'teleprompter:set-speed-preset',
      'teleprompter:speed-preset-0.5',
      'teleprompter:speed-preset-1',
      'teleprompter:speed-preset-1.5',
      'teleprompter:speed-preset-2',
      'teleprompter:speed-preset-3',
      'teleprompter:speed-preset-5',
      'teleprompter:reset-to-top',
      'teleprompter:scroll',
      'teleprompter:set-scroll-position',
      'teleprompter:set-scroll-percentage',
      'teleprompter:jump-to-header',
      'teleprompter:jump-to-header-by-id',
      'teleprompter:next-section',
      'teleprompter:previous-section',
      'teleprompter:toggle-navigation',
      'teleprompter:show-navigation',
      'teleprompter:hide-navigation',
      'teleprompter:broadcast-state',
      'teleprompter:apply-all-settings',
      'teleprompter:set-font-size',
      'teleprompter:font-size-up',
      'teleprompter:font-size-down',
      'teleprompter:toggle-eyeline',
      'teleprompter:show-eyeline',
      'teleprompter:hide-eyeline',
      'teleprompter:toggle-focus-mode',
      'teleprompter:enable-focus-mode',
      'teleprompter:disable-focus-mode',
      'teleprompter:toggle-pin',
      'teleprompter:pin-note',
      'teleprompter:unpin-note',
      'teleprompter:refresh-pinned',
      'teleprompter:toggle-keep-awake',
      'teleprompter:enable-keep-awake',
      'teleprompter:disable-keep-awake',
      'teleprompter:toggle-fullscreen',
      'teleprompter:enable-fullscreen',
      'teleprompter:disable-fullscreen',
      'teleprompter:line-height-increase',
      'teleprompter:line-height-decrease',
      'teleprompter:padding-vertical-increase',
      'teleprompter:padding-vertical-decrease',
      'teleprompter:padding-horizontal-increase',
      'teleprompter:padding-horizontal-decrease',
      'teleprompter:color-preset',
      'teleprompter:color-preset-dark',
      'teleprompter:color-preset-light',
      'teleprompter:color-preset-black',
      'teleprompter:color-preset-sepia',
      'teleprompter:color-preset-green',
      'teleprompter:color-preset-amber',
      'teleprompter:set-text-color',
      'teleprompter:set-background-color',
      'teleprompter:font-preset',
      'teleprompter:font-preset-system',
      'teleprompter:font-preset-sans',
      'teleprompter:font-preset-serif',
      'teleprompter:font-preset-mono',
      'teleprompter:font-preset-readable',
      'teleprompter:font-preset-slab',
      'teleprompter:set-font-family',
      'teleprompter:toggle-flip-horizontal',
      'teleprompter:enable-flip-horizontal',
      'teleprompter:disable-flip-horizontal',
      'teleprompter:toggle-flip-vertical',
      'teleprompter:enable-flip-vertical',
      'teleprompter:disable-flip-vertical',
      'teleprompter:toggle-scroll-sync',
      'teleprompter:enable-scroll-sync',
      'teleprompter:disable-scroll-sync',
      'teleprompter:toggle-minimap',
      'teleprompter:show-minimap',
      'teleprompter:hide-minimap',
      'teleprompter:cycle-progress-indicator',
      'teleprompter:progress-indicator-bar',
      'teleprompter:progress-indicator-scrollbar',
      'teleprompter:progress-indicator-none',
      'teleprompter:toggle-auto-pause',
      'teleprompter:enable-auto-pause',
      'teleprompter:disable-auto-pause',
      'teleprompter:toggle-double-click-edit',
      'teleprompter:enable-double-click-edit',
      'teleprompter:disable-double-click-edit',
      'teleprompter:toggle-eyeline',
      'teleprompter:cycle-speed-preset',
      'teleprompter:next-speed-preset',
      'teleprompter:prev-speed-preset',
      'teleprompter:cycle-alignment',
      'teleprompter:broadcast-state',
      // Voice tracking events
      'teleprompter:voice-start',
      'teleprompter:voice-stop',
      'teleprompter:voice-toggle',
      'teleprompter:get-voice-status',
      // Countdown events
      'teleprompter:countdown-increase',
      'teleprompter:countdown-decrease',
      'teleprompter:set-countdown',
      'teleprompter:start-countdown',
    ]

    wsEvents.forEach(eventType => {
      actualWin.addEventListener(eventType, handleWebSocketEvent as EventListener)
    })

    // Initial state broadcast
    broadcastStateToWebSocket()

    // BroadcastChannel listener for syncing between main and popout windows
    function handleBroadcastMessage(event: MessageEvent) {
      if (event.data?.type === 'state-update') {
        isReceivingBroadcast = true
        const data = event.data.data as SyncState
        debugLog('[Broadcast] RECEIVED:', data)

        // Apply received state changes
        if (data.isPlaying !== undefined) isPlaying = data.isPlaying
        if (data.speed !== undefined) speed = data.speed
        if (data.fontSize !== undefined) fontSize = data.fontSize
        if (data.showEyeline !== undefined) showEyeline = data.showEyeline
        if (data.eyelinePosition !== undefined) eyelinePosition = data.eyelinePosition
        if (data.focusMode !== undefined) focusMode = data.focusMode
        if (data.showNavigation !== undefined) showNavigation = data.showNavigation
        if (data.autoPauseOnEdit !== undefined) autoPauseOnEdit = data.autoPauseOnEdit
        if (data.textColor !== undefined) textColor = data.textColor
        if (data.backgroundColor !== undefined) backgroundColor = data.backgroundColor
        if (data.lineHeight !== undefined) lineHeight = data.lineHeight
        if (data.letterSpacing !== undefined) letterSpacing = data.letterSpacing
        if (data.opacity !== undefined) opacity = data.opacity
        if (data.textAlignment !== undefined) textAlignment = data.textAlignment
        if (data.countdownSeconds !== undefined) countdownSeconds = data.countdownSeconds
        if (data.isPinned !== undefined) isPinned = data.isPinned
        if (data.isKeepAwake !== undefined) {
          isKeepAwake = data.isKeepAwake
          // Also start/stop keep awake based on received state
          if (isKeepAwake) startKeepAwake()
          else stopKeepAwake()
        }
        if (data.flipHorizontal !== undefined) flipHorizontal = data.flipHorizontal
        if (data.flipVertical !== undefined) flipVertical = data.flipVertical
        if (data.viewMode !== undefined) viewMode = data.viewMode
        if (data.progressIndicatorStyle !== undefined) progressIndicatorStyle = data.progressIndicatorStyle
        if (data.fontFamily !== undefined) fontFamily = data.fontFamily
        if (data.paddingTop !== undefined) paddingTop = data.paddingTop
        if (data.paddingRight !== undefined) paddingRight = data.paddingRight
        if (data.paddingBottom !== undefined) paddingBottom = data.paddingBottom
        if (data.paddingLeft !== undefined) paddingLeft = data.paddingLeft
        if (data.showMinimap !== undefined) showMinimap = data.showMinimap
        if (data.isFullScreen !== undefined) isFullScreen = data.isFullScreen

        // Allow broadcasting again after state is applied
        setTimeout(() => { isReceivingBroadcast = false }, 50)
      }
    }
    stateChannel.addEventListener('message', handleBroadcastMessage)

    // Cleanup (use actualDoc/actualWin captured above for popout window support)
    return () => {
      app.workspace.offref(eventRef)
      actualDoc.removeEventListener('mousemove', handleMouseMove)
      actualDoc.removeEventListener('mouseup', stopResize)
      actualDoc.removeEventListener('mousemove', handleEyelineDrag)
      actualDoc.removeEventListener('mouseup', stopDragEyeline)
      actualWin.removeEventListener('resize', handleResize)
      actualDoc.removeEventListener('keydown', handleKeyPress)
      actualDoc.removeEventListener('keydown', handleFullScreenKeyPress)
      actualDoc.removeEventListener('keyup', handleFullScreenKeyRelease)

      if (contentArea) {
        contentArea.removeEventListener('scroll', handleScroll)
      }

      // Remove WebSocket event listeners
      wsEvents.forEach(eventType => {
        actualWin.removeEventListener(eventType, handleWebSocketEvent as EventListener)
      })

      // Cleanup keep awake
      stopKeepAwake()

      // Cleanup BroadcastChannel
      stateChannel.removeEventListener('message', handleBroadcastMessage)
      stateChannel.close()
    }
  })

  function updateCurrentVisibleHeader() {
    if (!contentArea) return

    // Update scroll position for minimap viewport indicator
    scrollPosition = contentArea.scrollTop

    // Calculate scroll percentage (0-100)
    const scrollableHeight = contentArea.scrollHeight - contentArea.clientHeight
    scrollPercentage = scrollableHeight > 0
      ? Math.round((contentArea.scrollTop / scrollableHeight) * 100)
      : 0

    const headerList = headers()
    if (headerList.length === 0) {
      currentVisibleHeader = ''
      return
    }

    // Find the header that is currently at or above the viewport center
    const scrollTop = contentArea.scrollTop
    const viewportCenter = scrollTop + (contentArea.clientHeight / 3) // Use top third as reference

    let currentHeader = headerList[0]

    for (const header of headerList) {
      const element = headerElements.get(header.id)
      if (element) {
        const elementTop = element.offsetTop - contentArea.offsetTop
        if (elementTop <= viewportCenter) {
          currentHeader = header
        } else {
          break
        }
      }
    }

    currentVisibleHeader = currentHeader.text
    // Update the current header index for next/previous navigation
    // BUT only if this isn't a programmatic jump (to avoid overriding navigation commands)
    if (!isProgrammaticJump) {
      currentHeaderIndex = headerList.findIndex(h => h.id === currentHeader.id)

      // Scroll synchronization: Sync teleprompter position to editor
      if (scrollSyncEnabled) {
        syncToEditor(currentHeader.id)
      }
    }
  }

  function syncToEditor(headerId: string) {
    // Find the corresponding line in the editor
    const headerLineInFile = parseInt(headerId.replace('header-', '')) + yamlLineOffset

    // Get the active markdown view
    const view = app.workspace.getActiveViewOfType(MarkdownView)
    if (!view) {
      debugLog('[ScrollSync] No active markdown view found')
      return
    }

    const editor = view.editor
    if (!editor) return

    // Scroll editor to the header line
    editor.setCursor({ line: headerLineInFile, ch: 0 })
    editor.scrollIntoView({ from: { line: headerLineInFile, ch: 0 }, to: { line: headerLineInFile, ch: 0 } }, true)

    debugLog(`[ScrollSync] Synced to editor line ${headerLineInFile} (header: ${headerId})`)
  }

  function jumpToHeader(headerId: string) {
    const element = headerElements.get(headerId)
    if (element && contentArea) {
      // Set flag to prevent scroll handler from overriding index
      isProgrammaticJump = true

      // Cancel countdown and pause playback when manually jumping to section
      if (isCountingDown) {
        isCountingDown = false
        currentCountdown = 0
        debugLog('[Navigation] Cancelled countdown due to manual jump')
      }
      if (isPlaying) {
        isPlaying = false
        broadcastState({ isPlaying: false })
        debugLog('[Navigation] Paused playback due to manual jump')
      }

      // Scroll to header in teleprompter
      const offsetTop = element.offsetTop - contentArea.offsetTop
      contentArea.scrollTop = offsetTop - 50 // Add small offset for visibility

      // Update current visible header (but don't override currentHeaderIndex during navigation)
      const headerList = headers()
      if (headerList.length > 0) {
        const scrollTop = contentArea.scrollTop
        const viewportCenter = scrollTop + (contentArea.clientHeight / 3)

        let currentHeader = headerList[0]
        for (const header of headerList) {
          const element = headerElements.get(header.id)
          if (element) {
            const elementTop = element.offsetTop - contentArea.offsetTop
            if (elementTop <= viewportCenter) {
              currentHeader = header
            } else {
              break
            }
          }
        }
        currentVisibleHeader = currentHeader.text
      }

      // Sync currentHeaderIndex with the header we jumped to
      const headerIndex = headerList.findIndex(h => h.id === headerId)
      if (headerIndex !== -1) {
        currentHeaderIndex = headerIndex
        debugLog(`[jumpToHeader] Synced currentHeaderIndex to ${currentHeaderIndex}`)
      }

      // Reset flag after a brief delay to allow scroll events to settle
      setTimeout(() => {
        isProgrammaticJump = false
      }, 100)

      // Also jump to header in the actual note editor
      const header = headers().find(h => h.id === headerId)
      if (header) {
        const activeView = app.workspace.getActiveViewOfType(MarkdownView)
        if (activeView) {
          // Get the line number from the header ID and add the YAML offset
          const displayLineNumber = parseInt(headerId.replace('header-', ''))
          const actualLineNumber = displayLineNumber + yamlLineOffset

          // Jump to that line in the editor
          const editor = activeView.editor
          editor.setCursor({ line: actualLineNumber, ch: 0 })
          editor.scrollIntoView({ from: { line: actualLineNumber, ch: 0 }, to: { line: actualLineNumber, ch: 0 } }, true)
        }
      }
    }
  }

  function registerHeader(element: HTMLElement, headerId: string) {
    headerElements.set(headerId, element)
    return {
      destroy() {
        headerElements.delete(headerId)
      }
    }
  }

  /**
   * Handle double-click on teleprompter content to jump to that location in the editor
   */
  function handleDoubleClickToEdit(event: MouseEvent) {
    // Check if feature is enabled (default to true if setting not found)
    if (settings.doubleClickToEdit === false) {
      return
    }

    // Don't trigger on double-click of interactive elements
    const target = event.target as HTMLElement
    if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
      return
    }

    // Get the clicked text (use actual window for popout window support)
    const selection = getActualWindow().getSelection()
    let clickedText = ''

    // Try to get selected text (double-click usually selects a word)
    if (selection && selection.toString().trim()) {
      clickedText = selection.toString().trim()
    } else {
      // Fallback: get the innerText of the clicked element
      clickedText = target.innerText?.trim().substring(0, 100) || ''
    }

    if (!clickedText || clickedText.length < 2) {
      debugLog('[DoubleClick] No meaningful text to search for')
      return
    }

    debugLog(`[DoubleClick] Searching for: "${clickedText.substring(0, 50)}..."`)

    // Search for the text in the source content
    const lines = content.split('\n')
    let foundLine = -1

    // First, try exact match
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(clickedText)) {
        foundLine = i
        break
      }
    }

    // If not found, try with stripped markdown formatting
    if (foundLine === -1) {
      const plainClickedText = clickedText.replace(/[*_`#\[\]]/g, '').trim()
      for (let i = 0; i < lines.length; i++) {
        const plainLine = lines[i].replace(/[*_`#\[\]]/g, '').trim()
        if (plainLine.includes(plainClickedText)) {
          foundLine = i
          break
        }
      }
    }

    // If still not found, try word-by-word for the first few words
    if (foundLine === -1 && clickedText.length > 10) {
      const words = clickedText.split(/\s+/).slice(0, 5).join('\\s+')
      const pattern = new RegExp(words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          foundLine = i
          break
        }
      }
    }

    if (foundLine === -1) {
      debugLog('[DoubleClick] Text not found in source content')
      return
    }

    // Account for YAML frontmatter offset
    const actualLineNumber = foundLine + yamlLineOffset
    debugLog(`[DoubleClick] Jumping to line ${actualLineNumber}`)

    // Jump to that line in the editor
    // First try active view, then search all leaves for a MarkdownView with the same file
    let targetView = app.workspace.getActiveViewOfType(MarkdownView)

    // If no active MarkdownView, search all leaves for one showing the current file
    if (!targetView) {
      const activeFile = app.workspace.getActiveFile()
      const currentPath = isPinned ? pinnedNotePath : activeFile?.path

      // Search all leaves for a MarkdownView with the same file
      app.workspace.iterateAllLeaves((leaf) => {
        if (targetView) return // Already found one

        const view = leaf.view
        if (view instanceof MarkdownView && view.file?.path === currentPath) {
          targetView = view
        }
      })
    }

    if (!targetView) {
      debugLog('[DoubleClick] No MarkdownView found for current file')
      return
    }

    const editor = targetView.editor
    if (editor) {
      editor.setCursor({ line: actualLineNumber, ch: 0 })
      editor.scrollIntoView({ from: { line: actualLineNumber, ch: 0 }, to: { line: actualLineNumber, ch: 0 } }, true)

      // Focus the editor so user can start editing immediately
      editor.focus()

      debugLog(`[DoubleClick] Jumped to line ${actualLineNumber + 1}`)
    }
  }

  function jumpToNextSection() {
    const headerList = headers()
    debugLog(`[Nav] Next: ${headerList.length} headers available`)
    if (headerList.length === 0) return

    // Move to next header
    currentHeaderIndex++

    // Wrap around if at end
    if (currentHeaderIndex >= headerList.length) {
      currentHeaderIndex = 0
    }

    debugLog(`[Nav] Jumping to ${currentHeaderIndex}: ${headerList[currentHeaderIndex].text.substring(0,30)}`)
    jumpToHeader(headerList[currentHeaderIndex].id)
  }

  function jumpToPreviousSection() {
    const headerList = headers()
    debugLog(`[Nav] Prev: ${headerList.length} headers available`)
    if (headerList.length === 0) return

    // Move to previous header
    currentHeaderIndex--

    // Wrap around if at beginning
    if (currentHeaderIndex < 0) {
      currentHeaderIndex = headerList.length - 1
    }

    debugLog(`[Nav] Jumping to ${currentHeaderIndex}: ${headerList[currentHeaderIndex].text.substring(0,30)}`)
    jumpToHeader(headerList[currentHeaderIndex].id)
  }

  // Auto-scroll effect - watching isPlaying (optimized with requestAnimationFrame)
  $effect(() => {
    if (isPlaying && contentArea) {
      // Use requestAnimationFrame for smoother, more performant scrolling
      let animationFrameId: number
      let lastTimestamp = 0
      let accumulatedScroll = 0 // Accumulate fractional pixels

      const scroll = (timestamp: number) => {
        if (!lastTimestamp) lastTimestamp = timestamp
        const delta = timestamp - lastTimestamp

        // Target 60fps, adjust scroll amount based on actual time elapsed
        if (delta >= 16.67) { // ~60fps
          if (contentArea) {
            // Accumulate scroll amount (fractional pixels)
            accumulatedScroll += (speed / 2) * (delta / 50)

            // Only apply scroll when we have at least 1 pixel
            if (accumulatedScroll >= 1) {
              const pixelsToScroll = Math.floor(accumulatedScroll)
              contentArea.scrollTop += pixelsToScroll
              accumulatedScroll -= pixelsToScroll // Keep the remainder
            }

            // Update scroll position and percentage in real-time during auto-scroll
            scrollPosition = contentArea.scrollTop
            const scrollableHeight = contentArea.scrollHeight - contentArea.clientHeight
            scrollPercentage = scrollableHeight > 0
              ? Math.round((contentArea.scrollTop / scrollableHeight) * 100)
              : 0
          }
          lastTimestamp = timestamp
        }

        if (isPlaying) {
          animationFrameId = requestAnimationFrame(scroll)
        }
      }

      animationFrameId = requestAnimationFrame(scroll)

      // Cleanup when this effect re-runs or component unmounts
      return () => cancelAnimationFrame(animationFrameId)
    }
  })

  // Network Broadcast effect - broadcasts scroll position to WebSocket for multi-device sync
  $effect(() => {
    // Only broadcast when playing and network broadcast is enabled
    if (!isPlaying || !settings.networkBroadcastEnabled) return

    const wsServer = plugin?.getWebSocketServer?.()
    if (!wsServer) return

    const broadcastInterval = settings.networkBroadcastInterval || 100

    debugLog(`[Network Broadcast] Starting broadcast at ${broadcastInterval}ms interval`)

    const intervalId = setInterval(() => {
      if (!contentArea) return

      const scrollableHeight = contentArea.scrollHeight - contentArea.clientHeight
      const currentScrollPercentage = scrollableHeight > 0
        ? Math.round((contentArea.scrollTop / scrollableHeight) * 100)
        : 0

      // Broadcast current state to all connected WebSocket clients
      wsServer.updateState({
        isPlaying,
        speed,
        scrollPosition: contentArea.scrollTop,
        maxScroll: scrollableHeight,
        scrollPercentage: currentScrollPercentage,
        currentNote: pinnedNotePath || null,
        currentNoteTitle: pinnedNotePath?.split('/').pop()?.replace('.md', '') || null,
      })
    }, broadcastInterval)

    // Cleanup when effect re-runs or component unmounts
    return () => {
      debugLog('[Network Broadcast] Stopping broadcast')
      clearInterval(intervalId)
    }
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="teleprompter-plus"
  class:teleprompter-focused={isTeleprompterFocused}
  bind:this={teleprompterContainer}
  tabindex="0"
  onfocus={handleTeleprompterFocus}
  onblur={handleTeleprompterBlur}
  role="application"
  aria-label="Teleprompter - Click to enable keyboard shortcuts"
>
  <!-- Focus indicator hint -->
  {#if !isTeleprompterFocused}
    <div class="focus-hint">
      Click here to enable keyboard shortcuts
    </div>
  {/if}

  <!-- Shortcuts active badge -->
  {#if isTeleprompterFocused}
    <div class="shortcuts-active-badge">
      ⌨️ Shortcuts Active
    </div>
  {/if}

  <!-- Countdown Overlay -->
  {#if isCountingDown}
    <div class="countdown-overlay">
      <div class="countdown-number">{currentCountdown}</div>
      <div class="countdown-text">Get ready...</div>
    </div>
  {/if}

  <!-- Voice tracking status indicator -->
  {#if voiceTrackingActive && settings.voiceTrackingShowIndicator}
    <div class="voice-status-overlay">
      <div class="voice-status-indicator" class:listening={voiceTrackingStatus === 'listening'}>
        <span class="voice-icon">🎤</span>
        <span class="voice-status-text">
          {#if voiceTrackingStatus === 'listening'}
            Listening...
          {:else if voiceTrackingStatus === 'initializing'}
            {#if voiceDownloadProgress > 0 && voiceDownloadProgress < 100}
              Downloading model... {voiceDownloadProgress}%
            {:else}
              Initializing...
            {/if}
          {:else}
            Voice Active
          {/if}
        </span>
      </div>
      {#if voiceTrackingStatus === 'initializing' && voiceDownloadProgress > 0}
        <div class="voice-progress-bar">
          <div class="voice-progress-fill" style="width: {voiceDownloadProgress}%"></div>
        </div>
      {/if}
      {#if lastRecognizedText}
        <div class="voice-recognized-text">"{lastRecognizedText}"</div>
      {/if}
    </div>
  {/if}

  <!-- Show controls always (including in full-screen mode) -->
  <!-- Controls visibility and order is configurable via Settings > Toolbar -->
  <div class="controls" class:fullscreen-controls={isFullScreen}>
    <!-- Dynamic toolbar controls - rendered in order from settings -->
    {#each orderedControls as control (control.id)}
      {#if control.id === 'fullscreen'}
        <button
          use:setIconAction={'tp-fullscreen'}
          onclick={toggleFullScreen}
          class="btn-fullscreen icon-btn"
          class:active={isFullScreen}
          title={isFullScreen ? 'Exit Full-Screen Mode (f)' : 'Enter Full-Screen Mode (f)'}
        >
        </button>
      {:else if control.id === 'navigation'}
        <button
          use:setIconAction={'tp-nav-panel'}
          onclick={toggleNavigation}
          class="btn-nav icon-btn"
          class:active={showNavigation}
          title="Toggle Navigation Panel (n)"
        >
        </button>
      {:else if control.id === 'eyeline'}
        <button
          use:setIconAction={'tp-eyeline'}
          onclick={toggleEyeline}
          class="btn-eyeline icon-btn"
          class:active={showEyeline}
          title="Toggle Eyeline Indicator"
        >
        </button>
      {:else if control.id === 'focus-mode'}
        <button
          use:setIconAction={'focus'}
          onclick={toggleFocusMode}
          class="btn-focus-mode icon-btn"
          class:active={focusMode}
          title={focusMode ? 'Focus Mode: ON (Dims text outside eyeline)' : 'Focus Mode: OFF (Click to dim text outside eyeline)'}
        >
        </button>
      {:else if control.id === 'pin'}
        <button
          use:setIconAction={'tp-pin'}
          onclick={togglePin}
          class="btn-pin icon-btn"
          class:active={isPinned}
          title={isPinned ? `Pinned: ${currentFileName}` : 'Pin Current Note (Lock content)'}
        >
        </button>
      {:else if control.id === 'keep-awake'}
        <button
          use:setIconAction={'tp-keep-awake'}
          onclick={toggleKeepAwake}
          class="btn-keep-awake icon-btn"
          class:active={isKeepAwake}
          title={isKeepAwake ? 'Keep Awake: ON (Screen won\'t sleep)' : 'Keep Awake: OFF (Click to prevent sleep)'}
        >
        </button>
      {:else if control.id === 'voice-tracking'}
        <div class="control-with-popup voice-control-group">
          <button
            use:setIconAction={voiceTrackingActive ? 'mic' : 'mic-off'}
            onclick={toggleVoiceTracking}
            class="btn-voice icon-btn"
            class:active={voiceTrackingActive}
            class:loading={voiceTrackingStatus === 'initializing'}
            class:error={voiceTrackingStatus === 'error'}
            disabled={!settings.voiceTrackingEnabled}
            title={!settings.voiceTrackingEnabled ? 'Voice Tracking (disabled in settings)' : voiceTrackingActive ? 'Stop Voice Tracking (V)' : voiceTrackingStatus === 'initializing' ? 'Initializing...' : 'Start Voice Tracking (V)'}
          >
          </button>
          {#if settings.voiceTrackingEnabled}
            <button
              use:setIconAction={'settings'}
              onclick={toggleVoiceSettings}
              class="btn-voice-settings icon-btn-small"
              class:active={showVoiceSettings}
              title="Voice Pace Settings"
            >
            </button>
          {/if}
          {#if showVoiceSettings}
            <div class="popup-panel voice-preset-panel">
              <div class="preset-header">VOICE PACE PRESETS</div>
              <div class="preset-grid">
                <button
                  class="preset-item"
                  class:active={settings.voiceTrackingPacePreset === 'conservative'}
                  onclick={() => applyVoicePreset('conservative')}
                >
                  <div class="preset-icon conservative">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                  </div>
                  <div class="preset-text">
                    <span class="preset-name">Conservative</span>
                    <span class="preset-desc">Non-native speakers, careful reading</span>
                  </div>
                  {#if settings.voiceTrackingPacePreset === 'conservative'}
                    <div class="preset-check">✓</div>
                  {/if}
                </button>

                <button
                  class="preset-item"
                  class:active={settings.voiceTrackingPacePreset === 'balanced'}
                  onclick={() => applyVoicePreset('balanced')}
                >
                  <div class="preset-icon balanced">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                  </div>
                  <div class="preset-text">
                    <span class="preset-name">Balanced</span>
                    <span class="preset-desc">Most speakers, normal pace</span>
                  </div>
                  {#if settings.voiceTrackingPacePreset === 'balanced'}
                    <div class="preset-check">✓</div>
                  {/if}
                </button>

                <button
                  class="preset-item"
                  class:active={settings.voiceTrackingPacePreset === 'responsive'}
                  onclick={() => applyVoicePreset('responsive')}
                >
                  <div class="preset-icon responsive">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                  </div>
                  <div class="preset-text">
                    <span class="preset-name">Responsive</span>
                    <span class="preset-desc">Fast speakers, larger movements</span>
                  </div>
                  {#if settings.voiceTrackingPacePreset === 'responsive'}
                    <div class="preset-check">✓</div>
                  {/if}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {:else if control.id === 'play-pause'}
        <button
          bind:this={btnPlay}
          onclick={togglePlay}
          class="btn-play icon-btn"
          class:active={isPlaying || isCountingDown}
          title={isPlaying ? 'Pause (Space)' : isCountingDown ? 'Cancel Countdown (Space)' : 'Play (Space)'}
        >
        </button>
      {:else if control.id === 'reset'}
        <button use:setIconAction={'tp-reset-top'} onclick={resetToTop} class="btn-reset icon-btn" title="Reset to Top (Home)">
        </button>
      {:else if control.id === 'speed'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-speed-up'}
            onclick={toggleSpeedSlider}
            class="icon-btn"
            class:active={showSpeedSlider}
            title="Speed: {speed} (click to adjust)"
          ></button>
          {#if showSpeedSlider}
            <div class="popup-slider">
              <label class="slider-label">
                <span>Speed: {speed}</span>
                <input
                  type="range"
                  bind:value={speed}
                  oninput={() => broadcastState({ speed })}
                  min={settings.minScrollSpeed || 0.5}
                  max={settings.maxScrollSpeed || 10}
                  step={speedIncrement}
                />
              </label>
            </div>
          {/if}
        </div>
      {:else if control.id === 'countdown'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-countdown-up'}
            onclick={toggleCountdownSlider}
            class="icon-btn"
            class:active={showCountdownSlider}
            title="Countdown: {countdownSeconds}s (click to adjust)"
          ></button>
          {#if showCountdownSlider}
            <div class="popup-slider">
              <label class="slider-label">
                <span>Countdown: {countdownSeconds}s</span>
                <input
                  type="range"
                  bind:value={countdownSeconds}
                  oninput={() => broadcastState({ countdownSeconds })}
                  min="0"
                  max="30"
                  step="1"
                />
              </label>
            </div>
          {/if}
        </div>
      {:else if control.id === 'font-size'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-font-up'}
            onclick={toggleFontSizeSlider}
            class="icon-btn"
            class:active={showFontSizeSlider}
            title="Font size: {fontSize}px (click to adjust)"
          ></button>
          {#if showFontSizeSlider}
            <div class="popup-slider">
              <label class="slider-label">
                <span>Font size: {fontSize}px</span>
                <input
                  type="range"
                  bind:value={fontSize}
                  oninput={() => broadcastState({ fontSize })}
                  min="12"
                  max="72"
                  step="1"
                />
              </label>
            </div>
          {/if}
        </div>
      {:else if control.id === 'flip-h'}
        <button
          use:setIconAction={'tp-flip-h'}
          onclick={toggleFlipHorizontal}
          class="btn-flip-h icon-btn"
          class:active={flipHorizontal}
          title={flipHorizontal ? 'Flip Horizontal: ON' : 'Flip Horizontal: OFF'}
        >
        </button>
      {:else if control.id === 'flip-v'}
        <button
          use:setIconAction={'tp-flip-v'}
          onclick={toggleFlipVertical}
          class="btn-flip-v icon-btn"
          class:active={flipVertical}
          title={flipVertical ? 'Flip Vertical: ON' : 'Flip Vertical: OFF'}
        >
        </button>
      {:else if control.id === 'minimap'}
        <button
          use:setIconAction={'tp-minimap'}
          onclick={toggleMinimap}
          class="btn-minimap icon-btn"
          class:active={showMinimap}
          title={showMinimap ? 'Minimap: ON' : 'Minimap: OFF'}
        >
        </button>
      {:else if control.id === 'detach'}
        <button
          use:setIconAction={isInPopoutWindow() ? 'x' : 'tp-detach'}
          onclick={detachWindow}
          class="btn-detach icon-btn"
          title={isInPopoutWindow() ? 'Close Window' : 'Open in New Window'}
        >
        </button>
      {:else if control.id === 'line-height'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-line-height'}
            onclick={toggleLineHeightSlider}
            class="icon-btn"
            class:active={showLineHeightSlider}
            title="Line height: {lineHeight} (click to adjust)"
          ></button>
          {#if showLineHeightSlider}
            <div class="popup-slider">
              <label class="slider-label">
                <span>Line height: {lineHeight}</span>
                <input type="range" bind:value={lineHeight} oninput={() => broadcastState({ lineHeight })} min="1.0" max="3.0" step="0.1" />
              </label>
            </div>
          {/if}
        </div>
      {:else if control.id === 'letter-spacing'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-letter-spacing'}
            onclick={toggleLetterSpacingSlider}
            class="icon-btn"
            class:active={showLetterSpacingSlider}
            title="Letter Spacing: {letterSpacing}px (click to adjust)"
          ></button>
          {#if showLetterSpacingSlider}
            <div class="popup-slider">
              <label class="slider-label">
                <span>Letter Spacing: {letterSpacing}px</span>
                <input type="range" bind:value={letterSpacing} oninput={() => broadcastState({ letterSpacing })} min="-5" max="20" step="0.5" />
              </label>
            </div>
          {/if}
        </div>
      {:else if control.id === 'opacity'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-opacity'}
            onclick={toggleOpacitySlider}
            class="icon-btn"
            class:active={showOpacitySlider}
            title="Opacity: {opacity}% (click to adjust)"
          ></button>
          {#if showOpacitySlider}
            <div class="popup-slider">
              <label class="slider-label">
                <span>Opacity: {opacity}%</span>
                <input type="range" bind:value={opacity} oninput={() => broadcastState({ opacity })} min="0" max="100" step="5" />
              </label>
            </div>
          {/if}
        </div>
      {:else if control.id === 'padding'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-padding'}
            onclick={togglePaddingSliders}
            class="icon-btn"
            class:active={showPaddingSliders}
            title="Padding (click to adjust)"
          ></button>
          {#if showPaddingSliders}
            <div class="popup-padding">
              <div class="padding-header">Padding</div>
              <div class="padding-sliders">
                <label class="slider-label"><span>Top: {paddingTop}px</span><input type="range" bind:value={paddingTop} oninput={() => broadcastState({ paddingTop })} min="0" max="200" step="5" /></label>
                <label class="slider-label"><span>Right: {paddingRight}px</span><input type="range" bind:value={paddingRight} oninput={() => broadcastState({ paddingRight })} min="0" max="200" step="5" /></label>
                <label class="slider-label"><span>Bottom: {paddingBottom}px</span><input type="range" bind:value={paddingBottom} oninput={() => broadcastState({ paddingBottom })} min="0" max="200" step="5" /></label>
                <label class="slider-label"><span>Left: {paddingLeft}px</span><input type="range" bind:value={paddingLeft} oninput={() => broadcastState({ paddingLeft })} min="0" max="200" step="5" /></label>
              </div>
              <div class="popup-buttons">
                <button onclick={resetPadding} class="btn-reset-popup">Reset</button>
                <button onclick={togglePaddingSliders} class="btn-close-popup">Close</button>
              </div>
            </div>
          {/if}
        </div>
      {:else if control.id === 'font-family'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-font-system'}
            onclick={toggleFontFamilyList}
            class="icon-btn"
            class:active={showFontFamilyList}
            title="Font Family (click to choose)"
          ></button>
          {#if showFontFamilyList}
            <div class="popup-font-list">
              <div class="font-list-header">Font Family</div>
              <div class="font-options">
                <button class="font-option" class:selected={fontFamily === 'inherit'} onclick={() => setFontFamily('inherit')}><span style="font-family: inherit;">System Default</span></button>
                <button class="font-option" class:selected={fontFamily === 'Arial, "Helvetica Neue", Helvetica, sans-serif'} onclick={() => setFontFamily('Arial, "Helvetica Neue", Helvetica, sans-serif')}><span style="font-family: Arial, sans-serif;">Arial</span></button>
                <button class="font-option" class:selected={fontFamily === '"Courier New", Courier, Monaco, "Lucida Console", monospace'} onclick={() => setFontFamily('"Courier New", Courier, Monaco, "Lucida Console", monospace')}><span style="font-family: 'Courier New', monospace;">Courier New</span></button>
                <button class="font-option" class:selected={fontFamily === 'Georgia, "Times New Roman", Times, serif'} onclick={() => setFontFamily('Georgia, "Times New Roman", Times, serif')}><span style="font-family: Georgia, serif;">Georgia</span></button>
                <button class="font-option" class:selected={fontFamily === 'Helvetica, "Helvetica Neue", Arial, sans-serif'} onclick={() => setFontFamily('Helvetica, "Helvetica Neue", Arial, sans-serif')}><span style="font-family: Helvetica, Arial, sans-serif;">Helvetica</span></button>
                <button class="font-option" class:selected={fontFamily === 'Roboto, "Segoe UI", Arial, sans-serif'} onclick={() => setFontFamily('Roboto, "Segoe UI", Arial, sans-serif')}><span style="font-family: Roboto, 'Segoe UI', Arial, sans-serif;">Roboto</span></button>
                <button class="font-option" class:selected={fontFamily === 'Tahoma, "Segoe UI", Geneva, sans-serif'} onclick={() => setFontFamily('Tahoma, "Segoe UI", Geneva, sans-serif')}><span style="font-family: Tahoma, Geneva, sans-serif;">Tahoma</span></button>
                <button class="font-option" class:selected={fontFamily === '"Times New Roman", Times, Georgia, serif'} onclick={() => setFontFamily('"Times New Roman", Times, Georgia, serif')}><span style="font-family: 'Times New Roman', serif;">Times New Roman</span></button>
                <button class="font-option" class:selected={fontFamily === '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif'} onclick={() => setFontFamily('"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif')}><span style="font-family: 'Trebuchet MS', sans-serif;">Trebuchet MS</span></button>
                <button class="font-option" class:selected={fontFamily === 'Verdana, Geneva, Tahoma, sans-serif'} onclick={() => setFontFamily('Verdana, Geneva, Tahoma, sans-serif')}><span style="font-family: Verdana, sans-serif;">Verdana</span></button>
              </div>
              <div class="popup-buttons"><button onclick={toggleFontFamilyList} class="btn-close-popup">Close</button></div>
            </div>
          {/if}
        </div>
      {:else if control.id === 'text-color'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-text-color'}
            onclick={toggleTextColorPicker}
            class="icon-btn"
            class:active={showTextColorPicker}
            title="Text Color (click to choose)"
          ></button>
          {#if showTextColorPicker}
            <div class="popup-color-picker">
              <div class="color-picker-header">Text Color</div>
              <div class="color-preview" style="background-color: {textColor};"></div>
              <div class="color-presets">
                {#each textColorPresets as preset}
                  <button
                    class="color-swatch"
                    class:active={textColor.toLowerCase() === preset.color.toLowerCase()}
                    style="background-color: {preset.color};"
                    onclick={() => applyTextColorPreset(preset.color)}
                    title={preset.name}
                  ></button>
                {/each}
              </div>
              <div class="color-sliders">
                <label class="slider-label"><span>Hue: {pickerHue}°</span><input type="range" bind:value={pickerHue} min="0" max="360" step="1" oninput={updateColorFromPicker} /></label>
                <label class="slider-label"><span>Saturation: {pickerSaturation}%</span><input type="range" bind:value={pickerSaturation} min="0" max="100" step="1" oninput={updateColorFromPicker} /></label>
                <label class="slider-label"><span>Brightness: {pickerBrightness}%</span><input type="range" bind:value={pickerBrightness} min="0" max="100" step="1" oninput={updateColorFromPicker} /></label>
              </div>
              <div class="color-hex-input"><label><span>Hex:</span><input type="text" bind:value={textColor} class="hex-input" placeholder="#000000" /></label></div>
              <div class="popup-buttons"><button onclick={toggleTextColorPicker} class="btn-close-popup">Close</button></div>
            </div>
          {/if}
        </div>
      {:else if control.id === 'bg-color'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-bg-color'}
            onclick={toggleBgColorPicker}
            class="icon-btn"
            class:active={showBgColorPicker}
            title="Background Color (click to choose)"
          ></button>
          {#if showBgColorPicker}
            <div class="popup-color-picker">
              <div class="color-picker-header">Background Color</div>
              <div class="color-preview" style="background-color: {backgroundColor};"></div>
              <div class="color-presets">
                {#each backgroundColorPresets as preset}
                  <button
                    class="color-swatch"
                    class:active={backgroundColor.toLowerCase() === preset.color.toLowerCase()}
                    style="background-color: {preset.color};"
                    onclick={() => applyBackgroundColorPreset(preset.color)}
                    title={preset.name}
                  ></button>
                {/each}
              </div>
              <div class="color-sliders">
                <label class="slider-label"><span>Hue: {pickerHue}°</span><input type="range" bind:value={pickerHue} min="0" max="360" step="1" oninput={updateColorFromPicker} /></label>
                <label class="slider-label"><span>Saturation: {pickerSaturation}%</span><input type="range" bind:value={pickerSaturation} min="0" max="100" step="1" oninput={updateColorFromPicker} /></label>
                <label class="slider-label"><span>Brightness: {pickerBrightness}%</span><input type="range" bind:value={pickerBrightness} min="0" max="100" step="1" oninput={updateColorFromPicker} /></label>
              </div>
              <div class="color-hex-input"><label><span>Hex:</span><input type="text" bind:value={backgroundColor} class="hex-input" placeholder="#000000" /></label></div>
              <div class="popup-buttons"><button onclick={toggleBgColorPicker} class="btn-close-popup">Close</button></div>
            </div>
          {/if}
        </div>
      {:else if control.id === 'auto-pause'}
        <button
          use:setIconAction={'tp-auto-pause'}
          onclick={toggleAutoPauseOnEdit}
          class="btn-auto-pause icon-btn"
          class:active={autoPauseOnEdit}
          title={autoPauseOnEdit ? 'Auto-Pause: ON (Pauses when you edit)' : 'Auto-Pause: OFF (Click to enable)'}
        >
        </button>
      {:else if control.id === 'progress-indicator'}
        <button
          bind:this={btnProgressIndicator}
          onclick={cycleProgressIndicatorStyle}
          class="btn-progress-indicator icon-btn"
          class:active={progressIndicatorStyle !== 'none'}
          title={`Progress Indicator: ${progressIndicatorStyle === 'progress-bar' ? 'Bar' : progressIndicatorStyle === 'scrollbar' ? 'Scrollbar' : 'Off'} (click to cycle)`}
        >
          {progressIndicatorStyle === 'progress-bar' ? '▔' : progressIndicatorStyle === 'scrollbar' ? '▮' : '○'}
        </button>
      {:else if control.id === 'alignment'}
        <button
          bind:this={btnAlignment}
          onclick={cycleTextAlignment}
          class="btn-alignment icon-btn"
          title={`Text Alignment: ${textAlignment.toUpperCase()} (click to cycle)`}
        >
          {textAlignment === 'left' ? '⊣' : textAlignment === 'center' ? '☰' : textAlignment === 'right' ? '⊢' : 'ﺭ'}
        </button>
      {:else if control.id === 'quick-presets'}
        <div class="control-with-popup">
          <button
            use:setIconAction={'tp-quick-presets'}
            onclick={toggleQuickPresetsMenu}
            class="icon-btn"
            class:active={showQuickPresetsMenu}
            title="Quick Setup Presets - One-click configurations"
          ></button>
          {#if showQuickPresetsMenu}
            <div class="popup-preset-menu">
              <div class="preset-menu-header">Quick Setup Presets</div>
              <div class="preset-menu-list">
                {#each quickSetupPresets as preset}
                  <button class="preset-menu-item" onclick={() => { applyQuickPreset(preset); toggleQuickPresetsMenu(); }} title={preset.desc}>
                    <div class="preset-preview" style="background: {preset.config.backgroundColor}; color: {preset.config.textColor};">
                      <span class="preview-text" style="font-size: 10px;">Aa</span>
                    </div>
                    <div class="preset-info">
                      <div class="preset-menu-name">{preset.name}</div>
                      <div class="preset-menu-desc">{preset.desc}</div>
                    </div>
                    <div class="preset-menu-icon" use:setIconAction={preset.icon}></div>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else if control.id === 'time-display'}
        <!-- Time Display -->
        {#if showElapsedTime || showTimeEstimation}
          {#if timeDisplayStyle === 'compact'}
            <!-- Compact: Click to toggle between elapsed/remaining -->
            <button
              class="time-display time-display-toggle"
              onclick={toggleTimeDisplayMode}
              title={timeDisplayMode === 'elapsed' ? 'Elapsed time (click for remaining)' : `Remaining time at ${speakingPaceWPM} WPM (click for elapsed)`}
            >
              {#if timeDisplayMode === 'elapsed'}
                <span class="time-value">{formatTime(elapsedSeconds)}</span>
                <span class="time-toggle-arrow">&#9654;</span>
              {:else}
                <span class="time-toggle-arrow">&#9664;</span>
                <span class="time-value">~{formatEstimatedTime(estimatedRemainingMinutes)}</span>
              {/if}
            </button>
          {:else}
            <!-- Full: Show both elapsed and remaining -->
            <div class="time-display time-display-full">
              {#if showElapsedTime}
                <span class="time-value elapsed">{formatTime(elapsedSeconds)}</span>
              {/if}
              {#if showElapsedTime && showTimeEstimation}
                <span class="time-separator">|</span>
              {/if}
              {#if showTimeEstimation}
                <span class="time-value remaining">~{formatEstimatedTime(estimatedRemainingMinutes)}</span>
              {/if}
            </div>
          {/if}
        {/if}
      {/if}
    {/each}

    <!-- Refresh button (only when note is pinned) -->
    {#if isPinned}
      <button
        use:setIconAction={'tp-refresh'}
        onclick={refreshPinnedNote}
        class="btn-refresh icon-btn"
        title="Refresh Pinned Note"
      >
      </button>
    {/if}

  </div>

  <div class="main-content">
    <div
      class="content-area"
      class:focus-mode-active={focusMode && showEyeline}
      style="--focus-eyeline-pos: {eyelinePosition}%; --focus-opacity: {focusModeOpacity}; --focus-range: {focusModeRange * 5}%;"
      bind:this={contentArea}>
      <!-- Eyeline Indicator -->
      {#if showEyeline}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="eyeline-indicator"
          class:dragging={isDraggingIndicator}
          style="top: {eyelinePixelTop}px;"
          onmousedown={startDragEyeline}
        >
          <svg class="eyeline-triangle" viewBox="0 0 100 100">
            <!-- Arrow pointing RIGHT -->
            <path d="M 90,50 10,90 10,10 Z" />
          </svg>
        </div>
      {/if}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="markdown-content"
        class:align-left={textAlignment === 'left'}
        class:align-center={textAlignment === 'center'}
        class:align-right={textAlignment === 'right'}
        class:align-rtl={textAlignment === 'rtl'}
        ondblclick={handleDoubleClickToEdit}
        style="--base-font-size: {fontSize}px; --line-height: {lineHeight}; padding: {paddingTop}px {paddingRight}px {paddingBottom}px {paddingLeft}px; letter-spacing: {letterSpacing}px; opacity: {opacity / 100}; font-family: {fontFamily}; color: {textColor}; background-color: {backgroundColor};">
        {#if viewMode === 'rendered'}
          {@html renderedHTML}
        {:else}
          <pre class="plain-text-content">{content}</pre>
        {/if}
      </div>
    </div>

    {#if showNavigation}
      <div class="navigation-panel" style="width: {navigationWidth}px;">
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="resize-handle" onmousedown={startResize} role="separator" aria-label="Resize navigation panel"></div>
        <div class="nav-header">
          <strong>Jump to Section</strong>
        </div>

        <!-- Progress Summary inside navigation panel -->
        <div class="nav-progress-summary">
          <!-- Progress bar -->
          <div class="nav-progress-bar-container">
            <div class="nav-progress-bar-fill" style="width: {scrollPercentage}%"></div>
            <span class="nav-progress-percentage">{scrollPercentage}%</span>
          </div>

          <!-- Time info -->
          {#if showTimeEstimation && estimatedRemainingMinutes > 0}
            <div class="nav-progress-time">
              <span class="nav-progress-time-label">Est. remaining:</span>
              <span class="nav-progress-time-value">
                {estimatedRemainingMinutes < 1 ? '< 1 min' : `~${Math.round(estimatedRemainingMinutes)} min`}
              </span>
            </div>
          {/if}

          <!-- Total words -->
          {#if totalWordCount > 0}
            <div class="nav-progress-words">
              <span class="nav-progress-words-label">Words:</span>
              <span class="nav-progress-words-value">{totalWordCount.toLocaleString()}</span>
            </div>
          {/if}
        </div>

        <div class="nav-items">
          {#each headers() as header, index}
            {#if isHeaderVisible(header)}
              <div class="nav-item-wrapper level-{header.level}" class:active={index === currentHeaderIndex}>
                {#if header.hasChildren}
                  <button
                    class="collapse-toggle"
                    onclick={(e) => {
                      e.stopPropagation()
                      toggleHeaderCollapse(header.id)
                    }}
                  >
                    {collapsedHeaders.has(header.id) ? '▶' : '▼'}
                  </button>
                {:else}
                  <span class="collapse-spacer"></span>
                {/if}
                <button
                  class="nav-item"
                  class:active={index === currentHeaderIndex}
                  onclick={() => jumpToHeader(header.id)}
                >
                  {header.text}
                </button>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Progress Indicator - Three styles: progress-bar, scrollbar, none -->

  <!-- Option A: Simple Progress Bar (horizontal at bottom) -->
  {#if progressIndicatorStyle === 'progress-bar' && !showNavigation}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="progress-bar-container"
      onclick={handleProgressBarClick}
      role="progressbar"
      tabindex="0"
      aria-valuenow={scrollPercentage}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="Reading progress - click to jump to position"
    >
      <!-- Progress fill -->
      <div class="progress-bar-fill" style="width: {scrollPercentage}%"></div>

      <!-- Section markers -->
      {#each headers() as header, index}
        {@const markerPosition = contentArea && headerElements.get(header.id)
          ? (headerElements.get(header.id)!.offsetTop / Math.max(contentArea.scrollHeight, 1)) * 100
          : (index / Math.max(headers().length - 1, 1)) * 100
        }
        <div
          class="progress-bar-marker"
          style="left: {markerPosition}%"
          data-level={header.level}
          title={header.text}
        ></div>
      {/each}

      <!-- Progress info overlay -->
      <div class="progress-bar-info">
        <span class="progress-percentage">{scrollPercentage}%</span>
        {#if showTimeEstimation && estimatedRemainingMinutes > 0}
          <span class="progress-time-remaining">
            {estimatedRemainingMinutes < 1 ? '< 1' : Math.round(estimatedRemainingMinutes)} min left
          </span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Option B: Enhanced Scrollbar (vertical on right side) -->
  {#if progressIndicatorStyle === 'scrollbar' && !showNavigation}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="progress-scrollbar"
      bind:this={minimapElement}
      onclick={handleMinimapClick}
      role="button"
      tabindex="0"
      aria-label="Document overview - click to jump to position"
    >
      <!-- Viewport indicator -->
      {#if contentArea}
        <div
          class="progress-scrollbar-viewport"
          style="
            top: {(scrollPosition / Math.max(contentArea.scrollHeight, 1)) * 100}%;
            height: {Math.max((contentArea.clientHeight / Math.max(contentArea.scrollHeight, 1)) * 100, 5)}%;
          "
        >
          <span class="progress-scrollbar-percentage">{scrollPercentage}%</span>
        </div>
      {/if}

      <!-- Section markers -->
      {#each headers() as header, index}
        {@const markerPosition = contentArea && headerElements.get(header.id)
          ? (headerElements.get(header.id)!.offsetTop / Math.max(contentArea.scrollHeight, 1)) * 100
          : (index / Math.max(headers().length - 1, 1)) * 100
        }
        <div
          class="progress-scrollbar-marker"
          style="top: {markerPosition}%"
          data-level={header.level}
          title={header.text}
        ></div>
      {/each}
    </div>
  {/if}

  <!-- Option C: None - No progress indicator shown -->

  <div class="status-bar">
    <span>{currentFileName || 'No file open'}</span>
    <span>{isPlaying ? '⏵ Playing' : '⏸ Paused'}</span>
  </div>
</div>

<style>
  .teleprompter-plus {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--background-primary);
    color: var(--text-normal);
    overflow: hidden;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    outline: none; /* Remove default focus outline */
    transition: box-shadow 0.2s ease;
  }

  /* Focus state - visual indicator when keyboard shortcuts are active */
  .teleprompter-plus.teleprompter-focused {
    box-shadow: inset 0 0 0 3px var(--interactive-accent);
  }

  /* Unfocused hint - shown when teleprompter is not focused */
  .focus-hint {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-size: 0.8rem;
    z-index: 100;
    pointer-events: none;
    opacity: 0.8;
    animation: pulse-hint 2s ease-in-out infinite;
  }

  @keyframes pulse-hint {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.9; }
  }

  /* Shortcuts active badge - shown when teleprompter has focus */
  .shortcuts-active-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    z-index: 100;
    pointer-events: none;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    border-bottom: 1px solid var(--background-modifier-border);
    align-items: center;
    flex-wrap: wrap;
    background: var(--background-primary);
    position: relative;
    z-index: 10;
    flex-shrink: 0;
  }

  /* Temporarily shown controls in full-screen mode */
  .fullscreen-controls {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 500;
    background: rgba(var(--background-primary-rgb), 0.95);
    backdrop-filter: blur(5px);
    animation: fadeIn 0.2s ease-in;
  }

  .btn-nav,
  .btn-eyeline,
  .btn-play,
  .btn-reset,
  .btn-fullscreen,
  .btn-pin,
  .btn-keep-awake,
  .btn-auto-pause,
  .btn-refresh,
  .btn-progress-indicator,
  .btn-alignment {
    padding: 0.4rem 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--interactive-normal);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.9rem;
  }

  .btn-nav:hover,
  .btn-eyeline:hover,
  .btn-play:hover,
  .btn-reset:hover,
  .btn-pin:hover,
  .btn-keep-awake:hover,
  .btn-auto-pause:hover,
  .btn-refresh:hover,
  .btn-fullscreen:hover,
  .btn-progress-indicator:hover,
  .btn-alignment:hover {
    background: var(--interactive-hover);
  }

  .btn-nav.active,
  .btn-eyeline.active,
  .btn-pin.active,
  .btn-keep-awake.active,
  .btn-auto-pause.active,
  .btn-fullscreen.active,
  .btn-progress-indicator.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  /* Text alignment styles */
  .markdown-content.align-left {
    text-align: left;
  }

  .markdown-content.align-center {
    text-align: center;
  }

  .markdown-content.align-right {
    text-align: right;
  }

  .markdown-content.align-rtl {
    direction: rtl;
    text-align: right;
  }

  /* Embedded notes styles */
  .embedded-note {
    margin: 1em 0;
    padding: 1em;
    background: rgba(var(--background-modifier-border-rgb, 128, 128, 128), 0.15);
    border-left: 3px solid var(--interactive-accent);
    border-radius: 4px;
  }

  .embedded-note-title {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 0.75em;
    padding-bottom: 0.5em;
    border-bottom: 1px solid rgba(var(--background-modifier-border-rgb, 128, 128, 128), 0.3);
  }

  /* Dynamically created via JavaScript template strings */
  :global(.embedded-note-content) {
    font-size: 0.95em;
  }

  :global(.embedded-note-content h1),
  :global(.embedded-note-content h2),
  :global(.embedded-note-content h3) {
    font-size: 1.1em;
    margin-top: 0.5em;
  }

  .embed-error {
    color: var(--text-error);
    font-style: italic;
    padding: 0.5em;
    background: rgba(var(--color-red-rgb, 255, 0, 0), 0.1);
    border-radius: 4px;
  }

  /* Diagram placeholder styles */
  :global(.diagram-placeholder) {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin: 1em 0;
    padding: 1em 1.5em;
    background: linear-gradient(135deg,
      rgba(var(--interactive-accent-rgb, 124, 58, 237), 0.1) 0%,
      rgba(var(--interactive-accent-rgb, 124, 58, 237), 0.05) 100%);
    border: 1px dashed rgba(var(--interactive-accent-rgb, 124, 58, 237), 0.3);
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 1.1em;
  }

  :global(.diagram-placeholder .diagram-type) {
    font-weight: 600;
    color: var(--interactive-accent);
  }

  /* Time Display Styles - Click to toggle */
  .time-display {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    background: rgba(var(--interactive-accent-rgb), 0.1);
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 500;
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    margin-left: 0.5rem;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }

  .time-display:hover {
    background: rgba(var(--interactive-accent-rgb), 0.2);
  }

  .time-display:active {
    transform: scale(0.97);
  }

  .time-value {
    color: var(--interactive-accent);
  }

  .time-toggle-arrow {
    color: var(--text-muted);
    opacity: 0.5;
    font-size: 0.65rem;
    transition: opacity 0.15s ease;
  }

  .time-display:hover .time-toggle-arrow {
    opacity: 0.8;
  }

  /* Full display mode (both times) */
  .time-display-full {
    cursor: default;
    gap: 0.5rem;
  }

  .time-display-full .time-value.elapsed {
    color: var(--interactive-accent);
  }

  .time-display-full .time-value.remaining {
    color: var(--text-muted);
  }

  .time-separator {
    color: var(--text-muted);
    opacity: 0.5;
  }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .navigation-panel {
    border-left: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
  }

  .resize-handle {
    position: absolute;
    left: -2px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    background: transparent;
    transition: background 0.2s;
    z-index: 10;
  }

  .resize-handle::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: transparent;
  }

  .resize-handle:hover {
    background: rgba(var(--interactive-accent-rgb), 0.1);
  }

  .resize-handle:hover::before {
    background: var(--interactive-accent);
  }

  .resize-handle:active {
    background: rgba(var(--interactive-accent-rgb), 0.2);
  }

  .resize-handle:active::before {
    background: var(--interactive-accent);
  }

  .nav-header {
    padding: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 0.9rem;
  }

  /* Navigation Progress Summary */
  .nav-progress-summary {
    padding: 12px 16px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nav-progress-bar-container {
    position: relative;
    height: 24px;
    background: var(--background-modifier-border);
    border-radius: 12px;
    overflow: hidden;
  }

  .nav-progress-bar-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--interactive-accent);
    border-radius: 12px;
    transition: width 0.2s ease-out;
    opacity: 0.8;
  }

  .nav-progress-percentage {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-normal);
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    z-index: 1;
  }

  .nav-progress-time,
  .nav-progress-words {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
  }

  .nav-progress-time-label,
  .nav-progress-words-label {
    color: var(--text-muted);
  }

  .nav-progress-time-value,
  .nav-progress-words-value {
    font-weight: 600;
    color: var(--text-normal);
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  }

  .nav-items {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .nav-item-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .nav-item-wrapper.level-1 {
    padding-left: 0.25rem;
  }

  .nav-item-wrapper.level-2 {
    padding-left: 1rem;
  }

  .nav-item-wrapper.level-3 {
    padding-left: 2rem;
  }

  .collapse-toggle {
    width: 20px;
    height: 20px;
    padding: 0;
    margin-right: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .collapse-toggle:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
    border-radius: 2px;
  }

  .collapse-spacer {
    width: 20px;
    margin-right: 0.25rem;
    flex-shrink: 0;
  }

  .nav-item {
    flex: 1;
    text-align: left;
    padding: 0.4rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9rem;
    border-radius: 3px;
    border-left: 3px solid transparent;
  }

  .nav-item:hover {
    background: var(--background-modifier-hover);
  }

  /* Active navigation item - currently visible section */
  .nav-item.active {
    background: rgba(var(--interactive-accent-rgb), 0.15);
    color: var(--interactive-accent);
    font-weight: 600;
    border-left-color: var(--interactive-accent);
    box-shadow: 0 0 0 1px rgba(var(--interactive-accent-rgb), 0.2);
  }

  .nav-item.active:hover {
    background: rgba(var(--interactive-accent-rgb), 0.25);
  }

  .nav-item-wrapper.level-1 .nav-item {
    font-weight: bold;
  }

  .nav-item-wrapper.level-3 .nav-item {
    font-size: 0.85rem;
  }

  label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  input[type="range"] {
    width: 200px;
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 2rem;
    padding-top: 4rem; /* Add extra top padding to avoid control bar overlap */
    position: relative;
    /* Ensure it has a defined height for scrolling */
    min-height: 400px;
  }

  /* Focus Mode - dims text outside the eyeline area */
  .content-area.focus-mode-active {
    --focus-gradient: linear-gradient(
      to bottom,
      rgba(0, 0, 0, var(--focus-opacity, 0.3)) 0%,
      rgba(0, 0, 0, var(--focus-opacity, 0.3)) calc(var(--focus-eyeline-pos, 50%) - var(--focus-range, 15%)),
      rgba(0, 0, 0, 0) calc(var(--focus-eyeline-pos, 50%) - calc(var(--focus-range, 15%) / 2)),
      rgba(0, 0, 0, 0) calc(var(--focus-eyeline-pos, 50%) + calc(var(--focus-range, 15%) / 2)),
      rgba(0, 0, 0, var(--focus-opacity, 0.3)) calc(var(--focus-eyeline-pos, 50%) + var(--focus-range, 15%)),
      rgba(0, 0, 0, var(--focus-opacity, 0.3)) 100%
    );
  }

  .content-area.focus-mode-active::after {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 5;
    background: var(--focus-gradient);
    transition: opacity 0.3s ease;
  }

  .markdown-content {
    max-width: 100%;
    margin: 0 auto;
    padding-top: var(--padding-vertical, 20px);
    padding-bottom: calc(var(--padding-vertical, 20px) + 100vh); /* Extra bottom for scrolling */
    padding-left: var(--padding-horizontal, 40px);
    padding-right: var(--padding-horizontal, 40px);
    /* Add extra height to ensure scrollable content */
    min-height: 200vh;
  }

  /* Plain text view mode */
  .plain-text-content {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
    padding: 0;
    background: transparent;
    color: inherit;
  }

  .markdown-content :global(h1) {
    font-size: calc(var(--base-font-size) * 1.8);
    font-weight: bold;
    margin: 2rem 0 1.5rem 0;
    line-height: 1.3;
    color: var(--text-accent);
  }

  .markdown-content :global(h2) {
    font-size: calc(var(--base-font-size) * 1.4);
    font-weight: bold;
    margin: 1.5rem 0 1rem 0;
    line-height: 1.3;
    color: var(--text-accent);
  }

  .markdown-content :global(h3) {
    font-size: calc(var(--base-font-size) * 1.2);
    font-weight: bold;
    margin: 1.25rem 0 0.75rem 0;
    line-height: 1.3;
    color: var(--text-normal);
  }

  /* Markdown content styles - using :global() for dynamically rendered HTML */
  .markdown-content :global(p) {
    font-size: var(--base-font-size) !important;
    line-height: var(--line-height, 1.8);
    margin: 0.5rem 0;
  }

  /* Lists */
  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    font-size: var(--base-font-size) !important;
    line-height: var(--line-height, 1.8);
    margin: 0.5rem 0;
    padding-left: 2rem;
  }

  .markdown-content :global(li) {
    margin: 0.25rem 0;
  }

  /* Inline formatting */
  .markdown-content :global(strong) {
    font-weight: bold;
    color: var(--text-accent);
  }

  .markdown-content :global(em) {
    font-style: italic;
    color: var(--text-accent-hover);
  }

  .markdown-content :global(del) {
    text-decoration: line-through;
    opacity: 0.7;
  }

  /* Inline code */
  .markdown-content :global(code) {
    font-family: var(--font-monospace, 'Monaco', 'Courier New', monospace);
    font-size: calc(var(--base-font-size) * 0.9);
    background: var(--background-secondary);
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    color: var(--text-accent);
  }

  /* Code blocks */
  .markdown-content :global(pre) {
    background: var(--background-secondary);
    border: 2px solid var(--background-modifier-border);
    border-radius: 12px;
    padding: 2rem;
    margin: 2rem 0;
    overflow-x: auto;
    line-height: 1.7;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .markdown-content :global(pre code) {
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', monospace;
    font-size: calc(var(--base-font-size) * 0.9);
    background: transparent;
    padding: 0;
    border-radius: 0;
    color: var(--text-normal);
    display: block;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  /* Syntax highlighting */
  .markdown-content :global(.hljs-keyword),
  .markdown-content :global(.hljs-selector-tag),
  .markdown-content :global(.hljs-literal),
  .markdown-content :global(.hljs-section),
  .markdown-content :global(.hljs-link) {
    color: #c678dd; /* Purple for keywords */
  }

  .markdown-content :global(.hljs-string),
  .markdown-content :global(.hljs-title),
  .markdown-content :global(.hljs-name),
  .markdown-content :global(.hljs-type) {
    color: #98c379; /* Green for strings */
  }

  .markdown-content :global(.hljs-number),
  .markdown-content :global(.hljs-symbol),
  .markdown-content :global(.hljs-bullet),
  .markdown-content :global(.hljs-built_in) {
    color: #d19a66; /* Orange for numbers */
  }

  .markdown-content :global(.hljs-comment),
  .markdown-content :global(.hljs-quote) {
    color: #5c6370; /* Gray for comments */
    font-style: italic;
  }

  .markdown-content :global(.hljs-function),
  .markdown-content :global(.hljs-class) {
    color: #61afef; /* Blue for functions */
  }

  .markdown-content :global(.hljs-variable),
  .markdown-content :global(.hljs-attr) {
    color: #e06c75; /* Red for variables */
  }

  /* Links */
  .markdown-content :global(a) {
    color: var(--text-accent);
    text-decoration: underline;
    cursor: pointer;
  }

  .markdown-content :global(a:hover) {
    color: var(--text-accent-hover);
  }

  /* Images */
  .markdown-content :global(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1.5rem auto;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  /* Blockquotes */
  .markdown-content :global(blockquote) {
    border-left: 4px solid var(--interactive-accent);
    padding-left: 1.5rem;
    margin: 1rem 0;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Horizontal rules */
  .markdown-content :global(hr) {
    border: none;
    border-top: 2px solid var(--background-modifier-border);
    margin: 2rem 0;
  }

  /* Tables */
  .markdown-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem 0;
    font-size: var(--base-font-size);
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    border: 1px solid var(--background-modifier-border);
    padding: 0.75rem;
    text-align: left;
  }

  .markdown-content :global(th) {
    background: var(--background-secondary);
    font-weight: bold;
  }

  .markdown-content :global(tr:nth-child(even)) {
    background: var(--background-secondary-alt);
  }

  /* Error state */
  .markdown-content :global(.error) {
    color: var(--text-error);
    font-style: italic;
    padding: 0.5rem;
    background: var(--background-modifier-error);
    border-radius: 4px;
    margin: 0.5rem 0;
  }

  .status-bar {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--background-modifier-border);
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* Countdown Overlay */
  .countdown-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease-in;
  }

  .countdown-number {
    font-size: 10rem;
    font-weight: bold;
    color: var(--interactive-accent);
    text-shadow: 0 0 20px var(--interactive-accent);
    animation: pulse 1s ease-in-out infinite;
  }

  .countdown-text {
    font-size: 2rem;
    color: var(--text-normal);
    margin-top: 2rem;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  /* Voice Tracking Status Overlay */
  .voice-status-overlay {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    z-index: 500;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 250px;
    animation: fadeIn 0.3s ease-in;
  }

  .voice-status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #ffffff; /* White text on dark background */
  }

  .voice-status-indicator.listening {
    color: #4ade80; /* Bright green when actively listening */
  }

  .voice-status-indicator.listening .voice-icon {
    animation: micPulse 1s ease-in-out infinite;
  }

  @keyframes micPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }

  .voice-icon {
    font-size: 1.25rem;
  }

  .voice-status-text {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .voice-recognized-text {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7); /* Light gray on dark background */
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .voice-progress-bar {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    overflow: hidden;
  }

  .voice-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #8BC34A);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  /* Karaoke word highlighting - use :global() for dynamically created elements */
  :global(.voice-word) {
    transition: all 0.15s ease-out;
    border-radius: 3px;
    padding: 1px 3px;
    margin: 0 -2px;
  }

  :global(.voice-word.voice-active) {
    background: linear-gradient(135deg, rgba(138, 43, 226, 0.5), rgba(75, 0, 130, 0.5));
    color: #fff !important;
    text-shadow: 0 0 10px rgba(138, 43, 226, 0.8);
    box-shadow: 0 0 15px rgba(138, 43, 226, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.1);
    animation: karaokeGlow 0.4s ease-out;
  }

  @keyframes karaokeGlow {
    0% {
      background: rgba(138, 43, 226, 0.7);
      transform: scale(1.08);
      box-shadow: 0 0 20px rgba(138, 43, 226, 0.6);
    }
    100% {
      background: linear-gradient(135deg, rgba(138, 43, 226, 0.5), rgba(75, 0, 130, 0.5));
      transform: scale(1);
      box-shadow: 0 0 15px rgba(138, 43, 226, 0.4);
    }
  }

  /* Alternative highlight styles based on theme */
  :global(.theme-light .voice-word.voice-active) {
    background: linear-gradient(135deg, rgba(138, 43, 226, 0.35), rgba(75, 0, 130, 0.3));
    color: #4a0080 !important;
    text-shadow: none;
    box-shadow: 0 2px 10px rgba(138, 43, 226, 0.25);
  }

  /* Voice button states */
  .btn-voice.loading {
    opacity: 0.6;
    cursor: wait;
  }

  .btn-voice.error {
    color: var(--text-error);
  }

  .btn-voice:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Control with Popup Slider */
  .control-with-popup {
    position: relative;
    display: inline-block;
  }

  .popup-slider {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    min-width: 200px;
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .slider-label {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .slider-label span {
    font-weight: 600;
    color: var(--text-normal);
    text-align: center;
  }

  .slider-label input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--background-modifier-border);
    outline: none;
    -webkit-appearance: none;
  }

  .slider-label input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--interactive-accent);
    cursor: pointer;
    transition: all 0.2s;
  }

  .slider-label input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  .slider-label input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--interactive-accent);
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .slider-label input[type="range"]::-moz-range-thumb:hover {
    transform: scale(1.2);
  }

  /* Voice control group with settings button */
  .voice-control-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .icon-btn-small {
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    opacity: 0.6;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn-small:hover {
    opacity: 1;
    color: var(--text-normal);
  }

  .icon-btn-small.active {
    color: var(--interactive-accent);
    opacity: 1;
  }

  /* Voice Preset Panel */
  .popup-panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    animation: slideDown 0.2s ease-out;
  }

  .voice-preset-panel {
    min-width: 260px;
  }

  .preset-header {
    font-weight: 500;
    color: var(--text-muted);
    text-align: left;
    margin-bottom: 0.5rem;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    padding-left: 0.25rem;
  }

  .preset-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preset-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.5rem 0.6rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .preset-item:hover {
    background: var(--background-modifier-hover);
  }

  .preset-item.active {
    background: var(--interactive-accent);
  }

  .preset-item.active .preset-name,
  .preset-item.active .preset-desc {
    color: white;
  }

  .preset-item.active .preset-desc {
    opacity: 0.85;
  }

  .preset-item.active .preset-icon {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .preset-icon {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .preset-icon svg {
    width: 16px;
    height: 16px;
  }

  .preset-icon.conservative {
    background: rgba(100, 180, 100, 0.2);
    color: #64b464;
  }

  .preset-icon.balanced {
    background: rgba(100, 140, 200, 0.2);
    color: #648cc8;
  }

  .preset-icon.responsive {
    background: rgba(180, 100, 180, 0.2);
    color: #b464b4;
  }

  .preset-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .preset-name {
    font-weight: 500;
    font-size: 0.85rem;
    color: var(--text-normal);
  }

  .preset-desc {
    font-size: 0.72rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preset-check {
    font-size: 0.85rem;
    color: white;
    opacity: 0.9;
    flex-shrink: 0;
  }

  /* Padding popup (larger with 4 sliders and buttons) */
  .popup-padding {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    min-width: 250px;
    animation: slideDown 0.2s ease-out;
  }

  .padding-header {
    font-weight: 600;
    color: var(--text-normal);
    text-align: center;
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }

  .padding-sliders {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .popup-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
  }

  .btn-reset-popup,
  .btn-close-popup {
    flex: 1;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.9rem;
  }

  .btn-reset-popup {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-reset-popup:hover {
    opacity: 0.8;
  }

  .btn-close-popup {
    background: var(--interactive-normal);
    color: var(--text-normal);
  }

  .btn-close-popup:hover {
    background: var(--interactive-hover);
  }

  /* Font Family popup (list of fonts) */
  .popup-font-list {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    min-width: 220px;
    max-height: 400px;
    overflow-y: auto;
    animation: slideDown 0.2s ease-out;
  }

  .font-list-header {
    font-weight: 600;
    color: var(--text-normal);
    text-align: center;
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }

  .font-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .font-option {
    padding: 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--interactive-normal);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    font-size: 1rem;
  }

  .font-option:hover {
    background: var(--interactive-hover);
  }

  .font-option.selected {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .font-option span {
    display: block;
  }

  /* Color Picker popup */
  .popup-color-picker {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    min-width: 250px;
    animation: slideDown 0.2s ease-out;
  }

  .color-picker-header {
    font-weight: 600;
    color: var(--text-normal);
    text-align: center;
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }

  .color-preview {
    width: 100%;
    height: 60px;
    border-radius: 4px;
    border: 2px solid var(--background-modifier-border);
    margin-bottom: 1rem;
  }

  .color-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background: var(--background-secondary);
    border-radius: 6px;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 2px solid var(--background-modifier-border);
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    padding: 0;
  }

  .color-swatch:hover {
    transform: scale(1.15);
    border-color: var(--text-accent);
    z-index: 1;
  }

  .color-swatch.active {
    border-color: var(--text-accent);
    box-shadow: 0 0 0 2px var(--text-accent);
    transform: scale(1.1);
  }

  .color-sliders {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .color-hex-input {
    margin-bottom: 1rem;
  }

  .color-hex-input label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .color-hex-input span {
    font-weight: 600;
    color: var(--text-normal);
  }

  .hex-input {
    flex: 1;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary-alt);
    color: var(--text-normal);
    font-family: monospace;
    font-size: 0.9rem;
  }

  /* Quick Preset Menu Popup - Professional List Style */
  .popup-preset-menu {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 0.5rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 100;
    min-width: 280px;
    max-width: 320px;
    animation: slideDown 0.15s ease-out;
  }

  .preset-menu-header {
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.7rem;
    padding: 0.5rem 0.75rem 0.25rem;
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 0.25rem;
  }

  .preset-menu-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preset-menu-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
    width: 100%;
  }

  .preset-menu-item:hover {
    background: var(--background-modifier-hover);
  }

  .preset-menu-item:active {
    background: var(--background-modifier-active-hover);
  }

  .preset-preview {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: 600;
    border: 1px solid var(--background-modifier-border);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .preset-preview .preview-text {
    font-family: inherit;
    line-height: 1;
  }

  .preset-info {
    flex: 1;
    min-width: 0;
  }

  .preset-menu-icon {
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    flex-shrink: 0;
    opacity: 0.6;
  }

  .preset-menu-item:hover .preset-menu-icon {
    color: var(--interactive-accent);
    opacity: 1;
  }

  .preset-menu-icon :global(svg) {
    width: 1.25rem !important;
    height: 1.25rem !important;
    stroke-width: 2;
  }

  .preset-menu-icon :global(.svg-icon) {
    width: 1.25rem !important;
    height: 1.25rem !important;
  }

  .preset-menu-name {
    font-weight: 500;
    font-size: 0.85rem;
    color: var(--text-normal);
    line-height: 1.2;
  }

  .preset-menu-desc {
    font-size: 0.7rem;
    color: var(--text-muted);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Icon buttons (compact style) */
  .icon-btn {
    padding: 0.35rem;
    min-width: 2rem;
    min-height: 2rem;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--interactive-normal);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Ensure SVG icons inside buttons don't capture clicks */
  .icon-btn :global(svg),
  .icon-btn :global(svg *) {
    pointer-events: none;
  }

  .icon-btn:hover {
    background: var(--interactive-hover);
  }

  .icon-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  /* Spacing Controls (Line Height & Padding) */
  .spacing-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: var(--background-secondary);
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
  }

  .spacing-controls button {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--interactive-normal);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .spacing-controls button:hover {
    background: var(--interactive-hover);
  }

  .spacing-display {
    font-weight: 600;
    min-width: 3rem;
    text-align: center;
    color: var(--text-accent);
    font-size: 0.875rem;
  }

  /* Eyeline Indicator - Draggable Triangle Marker */
  .eyeline-indicator {
    position: fixed;
    left: 0;
    right: 0;
    height: 0;
    z-index: 200;
    cursor: ns-resize;
    pointer-events: auto;
    transform: translateY(-50%);
  }

  .eyeline-indicator::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(var(--interactive-accent-rgb), 0.4) 20%,
      rgba(var(--interactive-accent-rgb), 0.6) 50%,
      rgba(var(--interactive-accent-rgb), 0.4) 80%,
      transparent 100%
    );
    pointer-events: none;
  }

  .eyeline-indicator:hover::before {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(var(--interactive-accent-rgb), 0.6) 20%,
      rgba(var(--interactive-accent-rgb), 0.8) 50%,
      rgba(var(--interactive-accent-rgb), 0.6) 80%,
      transparent 100%
    );
  }

  .eyeline-indicator.dragging {
    cursor: grabbing;
  }

  .eyeline-indicator.dragging::before {
    height: 4px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(var(--interactive-accent-rgb), 0.7) 20%,
      rgba(var(--interactive-accent-rgb), 0.9) 50%,
      rgba(var(--interactive-accent-rgb), 0.7) 80%,
      transparent 100%
    );
  }

  .eyeline-triangle {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
    pointer-events: all;
  }

  .eyeline-triangle path {
    fill: var(--interactive-accent);
    stroke: var(--interactive-accent);
    stroke-width: 8;
    stroke-linejoin: round;
    stroke-linecap: round;
    transition: all 0.2s ease;
  }

  .eyeline-indicator:hover .eyeline-triangle path {
    fill: var(--interactive-accent-hover);
    stroke: var(--interactive-accent-hover);
    stroke-width: 10;
  }

  .eyeline-indicator.dragging .eyeline-triangle path {
    fill: var(--interactive-accent-hover);
    stroke: var(--interactive-accent-hover);
    stroke-width: 12;
  }

  /* ==============================================
     PROGRESS INDICATOR STYLES
     Option A: Progress Bar (horizontal at bottom)
     Option B: Enhanced Scrollbar (vertical on right)
     Option C: None (no indicator)
     ============================================== */

  /* Option A: Simple Progress Bar - At bottom, above status bar */
  .progress-bar-container {
    position: relative;
    width: 100%;
    height: 20px;
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: height 0.2s ease, background 0.2s ease;
    flex-shrink: 0;
    /* Natural flex order: after main-content, before status-bar */
  }

  .progress-bar-container:hover {
    height: 28px;
    background: var(--background-secondary-alt);
  }

  .progress-bar-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--interactive-accent);
    opacity: 0.75;
    transition: width 0.15s ease-out;
    pointer-events: none;
    border-radius: 0 4px 4px 0;
  }

  .progress-bar-container:hover .progress-bar-fill {
    opacity: 0.85;
  }

  .progress-bar-marker {
    position: absolute;
    top: 0;
    width: 2px;
    height: 100%;
    background: var(--text-accent);
    opacity: 0.5;
    pointer-events: none;
    transition: all 0.2s ease;
  }

  .progress-bar-marker[data-level="1"] {
    width: 3px;
    opacity: 0.7;
    background: var(--interactive-accent);
  }

  .progress-bar-marker[data-level="2"] {
    width: 2px;
    opacity: 0.6;
  }

  .progress-bar-marker[data-level="3"] {
    width: 1px;
    opacity: 0.4;
  }

  .progress-bar-container:hover .progress-bar-marker {
    opacity: 0.8;
  }

  .progress-bar-info {
    position: absolute;
    left: 12px; /* Left side to avoid Obsidian's status bar on right */
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 2;
    pointer-events: none;
  }

  .progress-percentage {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-normal);
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .progress-time-remaining {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--background-primary);
    padding: 2px 8px;
    border-radius: 10px;
  }

  /* Option B: Enhanced Scrollbar - Vertical bar on right */
  .progress-scrollbar {
    position: absolute;
    right: 0;
    top: 50px; /* Below toolbar */
    bottom: 54px; /* Above progress bar / status bar */
    width: 20px;
    background: rgba(var(--background-secondary-alt-rgb), 0.4);
    border-left: 1px solid var(--background-modifier-border);
    cursor: pointer;
    z-index: 100;
    opacity: 0.7;
    transition: all 0.2s ease;
    backdrop-filter: blur(4px);
  }

  .progress-scrollbar:hover {
    opacity: 1;
    width: 32px;
    background: rgba(var(--background-secondary-alt-rgb), 0.6);
    border-left: 2px solid var(--interactive-accent);
  }

  .progress-scrollbar-viewport {
    position: absolute;
    left: 2px;
    right: 2px;
    background: var(--interactive-accent);
    opacity: 0.5;
    border-radius: 4px;
    min-height: 30px;
    transition: all 0.15s ease;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(var(--interactive-accent-rgb), 0.4);
  }

  .progress-scrollbar:hover .progress-scrollbar-viewport {
    opacity: 0.7;
    left: 4px;
    right: 4px;
    box-shadow: 0 4px 12px rgba(var(--interactive-accent-rgb), 0.6);
  }

  .progress-scrollbar-percentage {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--text-on-accent);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .progress-scrollbar:hover .progress-scrollbar-percentage {
    opacity: 1;
  }

  .progress-scrollbar-marker {
    position: absolute;
    left: 4px;
    right: 4px;
    height: 3px;
    background: var(--text-accent);
    opacity: 0.5;
    border-radius: 1px;
    transition: all 0.2s ease;
    z-index: 2;
  }

  .progress-scrollbar-marker[data-level="1"] {
    height: 4px;
    opacity: 0.7;
    background: var(--interactive-accent);
  }

  .progress-scrollbar-marker[data-level="2"] {
    height: 3px;
    opacity: 0.6;
  }

  .progress-scrollbar-marker[data-level="3"] {
    height: 2px;
    opacity: 0.4;
  }

  .progress-scrollbar:hover .progress-scrollbar-marker {
    opacity: 0.8;
  }

  .progress-scrollbar-marker:hover {
    opacity: 1;
    transform: scaleY(1.5);
  }
</style>
