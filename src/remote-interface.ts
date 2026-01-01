/**
 * Remote Web Interface HTML
 *
 * This is the mobile-first web interface for controlling the teleprompter
 * from a phone or tablet on the same network.
 *
 * Generated from remote-interface.html
 */

export const REMOTE_INTERFACE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Teleprompter Remote</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-card: #0f3460;
      --accent: #e94560;
      --accent-hover: #ff6b6b;
      --text-primary: #ffffff;
      --text-secondary: #a0a0a0;
      --success: #4ade80;
      --warning: #fbbf24;
      --error: #ef4444;
      --border-radius: 12px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .header h1 {
      font-size: 18px;
      font-weight: 600;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--error);
      transition: background 0.3s;
    }

    .status-dot.connected {
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
    }

    .status-dot.connecting {
      background: var(--warning);
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Main Content */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 20px;
      gap: 20px;
      overflow-y: auto;
    }

    /* Play/Pause Button */
    .play-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 30px 20px;
    }

    .play-button {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), #ff6b6b);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 32px rgba(233, 69, 96, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
      touch-action: manipulation;
    }

    .play-button:active {
      transform: scale(0.95);
      box-shadow: 0 4px 16px rgba(233, 69, 96, 0.4);
    }

    .play-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .play-button svg {
      width: 60px;
      height: 60px;
      fill: white;
    }

    .play-status {
      font-size: 16px;
      color: var(--text-secondary);
    }

    .play-status.playing {
      color: var(--success);
    }

    /* Card Sections */
    .card {
      background: var(--bg-card);
      border-radius: var(--border-radius);
      padding: 20px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
    }

    .card-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--accent);
    }

    /* Speed Slider */
    .speed-slider {
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: rgba(255,255,255,0.1);
      appearance: none;
      -webkit-appearance: none;
      outline: none;
    }

    .speed-slider::-webkit-slider-thumb {
      appearance: none;
      -webkit-appearance: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent);
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }

    .speed-slider::-moz-range-thumb {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent);
      cursor: pointer;
      border: none;
    }

    .speed-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* Progress */
    .progress-bar {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.1);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), #ff6b6b);
      transition: width 0.3s;
    }

    .progress-text {
      text-align: center;
      margin-top: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    /* Sections List */
    .sections-toggle {
      width: 100%;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0;
    }

    .sections-toggle svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
      transition: transform 0.3s;
    }

    .sections-toggle.expanded svg {
      transform: rotate(180deg);
    }

    .sections-list {
      display: none;
      margin-top: 16px;
      max-height: 200px;
      overflow-y: auto;
    }

    .sections-list.visible {
      display: block;
    }

    .section-item {
      display: block;
      width: 100%;
      padding: 12px 16px;
      background: rgba(255,255,255,0.05);
      border: none;
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      margin-bottom: 8px;
      transition: background 0.2s;
    }

    .section-item:last-child {
      margin-bottom: 0;
    }

    .section-item:hover,
    .section-item:active {
      background: rgba(233, 69, 96, 0.2);
    }

    .section-item.current {
      background: var(--accent);
      font-weight: 600;
    }

    .no-sections {
      color: var(--text-secondary);
      font-size: 14px;
      font-style: italic;
    }

    /* Action Buttons */
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .action-button {
      padding: 16px;
      border-radius: var(--border-radius);
      border: 1px solid rgba(255,255,255,0.1);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s, border-color 0.2s;
    }

    .action-button:hover,
    .action-button:active {
      background: var(--bg-card);
      border-color: var(--accent);
    }

    .action-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-button svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    /* Countdown Selector */
    .countdown-selector {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .countdown-option {
      flex: 1;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      background: transparent;
      color: var(--text-primary);
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .countdown-option.selected {
      background: var(--accent);
      border-color: var(--accent);
    }

    /* Disconnected Overlay */
    .disconnected-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
    }

    .disconnected-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .disconnected-icon {
      width: 80px;
      height: 80px;
      fill: var(--error);
    }

    .disconnected-text {
      font-size: 18px;
      color: var(--text-secondary);
    }

    .reconnect-button {
      padding: 14px 32px;
      border-radius: var(--border-radius);
      background: var(--accent);
      border: none;
      color: white;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    /* Safe area for notched phones */
    @supports (padding: env(safe-area-inset-bottom)) {
      .main {
        padding-bottom: calc(20px + env(safe-area-inset-bottom));
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="header">
    <h1>Teleprompter Remote</h1>
    <div class="connection-status">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Connecting...</span>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main">
    <!-- Play/Pause Section -->
    <section class="play-section">
      <button class="play-button" id="playButton" disabled>
        <svg id="playIcon" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg id="pauseIcon" viewBox="0 0 24 24" style="display:none">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg>
      </button>
      <div class="play-status" id="playStatus">Paused</div>
    </section>

    <!-- Speed Control -->
    <section class="card">
      <div class="card-header">
        <span class="card-title">Speed</span>
        <span class="card-value" id="speedValue">2.0x</span>
      </div>
      <input type="range" class="speed-slider" id="speedSlider"
             min="0.5" max="10" step="0.5" value="2">
      <div class="speed-labels">
        <span>0.5x</span>
        <span>5x</span>
        <span>10x</span>
      </div>
    </section>

    <!-- Progress -->
    <section class="card">
      <div class="card-header">
        <span class="card-title">Progress</span>
        <span class="card-value" id="progressValue">0%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill" style="width: 0%"></div>
      </div>
    </section>

    <!-- Sections -->
    <section class="card">
      <button class="sections-toggle" id="sectionsToggle">
        <span>Sections</span>
        <svg viewBox="0 0 24 24">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
      <div class="sections-list" id="sectionsList">
        <div class="no-sections">No sections available</div>
      </div>
    </section>

    <!-- Actions -->
    <section class="actions">
      <button class="action-button" id="resetButton" disabled>
        <svg viewBox="0 0 24 24">
          <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
        </svg>
        Reset
      </button>
      <button class="action-button" id="countdownButton" disabled>
        <svg viewBox="0 0 24 24">
          <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
        </svg>
        <span id="countdownText">Countdown</span>
      </button>
    </section>

    <!-- Countdown Selector (hidden by default) -->
    <section class="card" id="countdownSelector" style="display:none">
      <div class="card-title" style="margin-bottom: 12px">Countdown Duration</div>
      <div class="countdown-selector">
        <button class="countdown-option" data-seconds="3">3s</button>
        <button class="countdown-option selected" data-seconds="5">5s</button>
        <button class="countdown-option" data-seconds="10">10s</button>
        <button class="countdown-option" data-seconds="0">Off</button>
      </div>
    </section>
  </main>

  <!-- Disconnected Overlay -->
  <div class="disconnected-overlay" id="disconnectedOverlay">
    <svg class="disconnected-icon" viewBox="0 0 24 24">
      <path d="M24 8.98C20.93 5.9 16.69 4 12 4S3.07 5.9 0 8.98L12 21 24 8.98zM2.92 9.07C5.51 7.08 8.67 6 12 6s6.49 1.08 9.08 3.07l-1.43 1.43C17.5 8.94 14.86 8 12 8s-5.5.94-7.65 2.5L2.92 9.07zM12 10c2.14 0 4.09.72 5.65 1.93l-1.43 1.43C15.04 12.51 13.58 12 12 12s-3.04.51-4.22 1.36l-1.43-1.43C7.91 10.72 9.86 10 12 10z"/>
    </svg>
    <div class="disconnected-text">Connection Lost</div>
    <button class="reconnect-button" id="reconnectButton">Reconnect</button>
  </div>

  <script>
    // State
    let ws = null;
    let state = {
      isPlaying: false,
      speed: 1.0,
      scrollPercentage: 0,
      headers: [],
      currentHeaderIndex: -1,
      countdownSeconds: 5
    };
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY = 2000;

    // DOM Elements
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const playButton = document.getElementById('playButton');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const playStatus = document.getElementById('playStatus');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    const progressValue = document.getElementById('progressValue');
    const progressFill = document.getElementById('progressFill');
    const sectionsToggle = document.getElementById('sectionsToggle');
    const sectionsList = document.getElementById('sectionsList');
    const resetButton = document.getElementById('resetButton');
    const countdownButton = document.getElementById('countdownButton');
    const countdownText = document.getElementById('countdownText');
    const countdownSelector = document.getElementById('countdownSelector');
    const disconnectedOverlay = document.getElementById('disconnectedOverlay');
    const reconnectButton = document.getElementById('reconnectButton');

    // Get WebSocket URL from current page URL
    function getWebSocketUrl() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return protocol + '//' + window.location.host;
    }

    // Connect to WebSocket
    function connect() {
      const wsUrl = getWebSocketUrl();
      setConnectionStatus('connecting');

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = function() {
          console.debug('Connected to teleprompter');
          setConnectionStatus('connected');
          reconnectAttempts = 0;
          enableControls(true);
          // Request current state
          sendCommand('get-state');
        };

        ws.onmessage = function(event) {
          try {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
          } catch (e) {
            console.error('Failed to parse message:', e);
          }
        };

        ws.onclose = function() {
          console.debug('Disconnected from teleprompter');
          setConnectionStatus('disconnected');
          enableControls(false);
          scheduleReconnect();
        };

        ws.onerror = function(error) {
          console.error('WebSocket error:', error);
        };
      } catch (e) {
        console.error('Failed to connect:', e);
        setConnectionStatus('disconnected');
        scheduleReconnect();
      }
    }

    // Schedule reconnection attempt
    function scheduleReconnect() {
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(connect, RECONNECT_DELAY);
      }
    }

    // Set connection status UI
    function setConnectionStatus(status) {
      statusDot.className = 'status-dot';
      disconnectedOverlay.classList.remove('visible');

      switch (status) {
        case 'connected':
          statusDot.classList.add('connected');
          statusText.textContent = 'Connected';
          break;
        case 'connecting':
          statusDot.classList.add('connecting');
          statusText.textContent = 'Connecting...';
          break;
        case 'disconnected':
          statusText.textContent = 'Disconnected';
          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            disconnectedOverlay.classList.add('visible');
          }
          break;
      }
    }

    // Enable/disable controls
    function enableControls(enabled) {
      playButton.disabled = !enabled;
      speedSlider.disabled = !enabled;
      resetButton.disabled = !enabled;
      countdownButton.disabled = !enabled;
    }

    // Send command to server
    function sendCommand(command, params) {
      params = params || {};
      if (ws && ws.readyState === WebSocket.OPEN) {
        var msg = { command: command };
        for (var key in params) {
          msg[key] = params[key];
        }
        ws.send(JSON.stringify(msg));
      }
    }

    // Handle incoming messages
    function handleMessage(msg) {
      if (msg.type === 'state') {
        updateState(msg.data);
      } else if (msg.type === 'error') {
        console.error('Server error:', msg.message);
      }
    }

    // Update local state and UI
    function updateState(newState) {
      // Update isPlaying
      if (newState.isPlaying !== undefined) {
        state.isPlaying = newState.isPlaying;
        updatePlayButton();
      }

      // Update speed
      if (newState.speed !== undefined) {
        state.speed = newState.speed;
        speedSlider.value = state.speed;
        speedValue.textContent = state.speed.toFixed(1) + 'x';
      }

      // Update progress
      if (newState.scrollPercentage !== undefined) {
        state.scrollPercentage = newState.scrollPercentage;
        var percentage = Math.round(state.scrollPercentage);
        progressValue.textContent = percentage + '%';
        progressFill.style.width = percentage + '%';
      }

      // Update headers/sections
      if (newState.headers !== undefined) {
        state.headers = newState.headers;
        updateSectionsList();
      }

      // Update current header index
      if (newState.currentHeaderIndex !== undefined) {
        state.currentHeaderIndex = newState.currentHeaderIndex;
        updateSectionsList();
      }

      // Update countdown duration
      if (newState.countdownSeconds !== undefined) {
        state.countdownSeconds = newState.countdownSeconds;
        updateCountdownButtons();
      }
    }

    // Update play button appearance
    function updatePlayButton() {
      if (state.isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        playStatus.textContent = 'Playing';
        playStatus.classList.add('playing');
      } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        playStatus.textContent = 'Paused';
        playStatus.classList.remove('playing');
      }
    }

    // Update sections list
    function updateSectionsList() {
      if (!state.headers || state.headers.length === 0) {
        sectionsList.innerHTML = '<div class="no-sections">No sections available</div>';
        return;
      }

      var html = '';
      for (var i = 0; i < state.headers.length; i++) {
        var header = state.headers[i];
        var text = typeof header === 'string' ? header : header.text;
        var isCurrent = i === state.currentHeaderIndex;
        html += '<button class="section-item ' + (isCurrent ? 'current' : '') + '" data-index="' + i + '">' + text + '</button>';
      }
      sectionsList.innerHTML = html;
    }

    // Update countdown selector buttons
    function updateCountdownButtons() {
      var options = document.querySelectorAll('.countdown-option');
      for (var i = 0; i < options.length; i++) {
        var btn = options[i];
        var seconds = parseInt(btn.getAttribute('data-seconds'));
        if (seconds === state.countdownSeconds) {
          btn.classList.add('selected');
        } else {
          btn.classList.remove('selected');
        }
      }
      countdownText.textContent = state.countdownSeconds > 0 ? state.countdownSeconds + 's' : 'Start';
    }

    // Event Listeners
    playButton.addEventListener('click', function() {
      sendCommand('toggle-play');
    });

    speedSlider.addEventListener('input', function(e) {
      var value = parseFloat(e.target.value);
      speedValue.textContent = value.toFixed(1) + 'x';
    });

    speedSlider.addEventListener('change', function(e) {
      var value = parseFloat(e.target.value);
      sendCommand('set-speed', { speed: value });
    });

    resetButton.addEventListener('click', function() {
      sendCommand('reset-to-top');
    });

    countdownButton.addEventListener('click', function() {
      // Toggle countdown selector visibility
      countdownSelector.style.display = countdownSelector.style.display === 'none' ? 'block' : 'none';
    });

    sectionsToggle.addEventListener('click', function() {
      sectionsToggle.classList.toggle('expanded');
      sectionsList.classList.toggle('visible');
    });

    sectionsList.addEventListener('click', function(e) {
      if (e.target.classList.contains('section-item')) {
        var index = parseInt(e.target.getAttribute('data-index'));
        sendCommand('jump-to-header', { index: index });
      }
    });

    // Countdown selector
    countdownSelector.addEventListener('click', function(e) {
      if (e.target.classList.contains('countdown-option')) {
        var seconds = parseInt(e.target.getAttribute('data-seconds'));
        state.countdownSeconds = seconds;
        updateCountdownButtons();
        sendCommand('set-countdown', { seconds: seconds });
        countdownSelector.style.display = 'none';

        // Start countdown (or just play if "Off" selected)
        if (seconds > 0) {
          sendCommand('start-countdown');
        } else {
          sendCommand('play');
        }
      }
    });


    reconnectButton.addEventListener('click', function() {
      reconnectAttempts = 0;
      connect();
    });

    // Keyboard shortcuts (for desktop testing)
    document.addEventListener('keydown', function(e) {
      if (e.code === 'Space') {
        e.preventDefault();
        sendCommand('toggle-play');
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        sendCommand('increase-speed');
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        sendCommand('decrease-speed');
      } else if (e.code === 'Home') {
        e.preventDefault();
        sendCommand('reset-to-top');
      }
    });

    // Prevent pull-to-refresh on mobile (only block upward scroll at top)
    var lastTouchY = 0;
    document.body.addEventListener('touchstart', function(e) {
      lastTouchY = e.touches[0].clientY;
    }, { passive: true });

    document.body.addEventListener('touchmove', function(e) {
      // Allow scrolling inside sections list
      if (e.target.closest('.sections-list')) return;
      // Allow scrolling inside main content
      if (e.target.closest('.main')) return;

      var touchY = e.touches[0].clientY;
      var isScrollingUp = touchY > lastTouchY;

      // Only prevent pull-to-refresh (scrolling up while at top)
      if (window.scrollY === 0 && isScrollingUp) {
        e.preventDefault();
      }
    }, { passive: false });

    // Initialize
    connect();
  </script>
</body>
</html>`;
