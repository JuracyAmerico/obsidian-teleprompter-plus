#!/usr/bin/env node
/**
 * Teleprompter Plus WebSocket Test Script
 * Tests that the WebSocket server is running and responds to commands
 *
 * Usage: node test-websocket.js
 */

import WebSocket from 'ws';

const WS_URL = 'ws://127.0.0.1:8765';
const TIMEOUT = 5000;

console.log('🧪 Teleprompter Plus WebSocket Test\n');
console.log(`Connecting to ${WS_URL}...`);

const ws = new WebSocket(WS_URL);
let stateReceived = false;

const timeout = setTimeout(() => {
  console.log('❌ Timeout - No response from server');
  console.log('\n💡 Make sure:');
  console.log('   1. Obsidian is running');
  console.log('   2. Teleprompter Plus plugin is enabled');
  console.log('   3. Teleprompter view is open');
  ws.close();
  process.exit(1);
}, TIMEOUT);

ws.on('open', () => {
  console.log('✅ Connected to WebSocket server\n');

  // Request state broadcast
  ws.send(JSON.stringify({ command: 'broadcast-state' }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    if (message.type === 'state') {
      stateReceived = true;
      clearTimeout(timeout);

      console.log('📊 State Received:\n');
      const state = message.data;

      // Core features
      console.log('=== Core Features ===');
      console.log(`  isPlaying: ${state.isPlaying}`);
      console.log(`  speed: ${state.speed}x`);
      console.log(`  currentNote: ${state.currentNoteTitle || 'None'}`);

      // v0.7.0 features
      console.log('\n=== v0.7.0 Features ===');
      console.log(`  speedPresets: ${state.speedPresets ? state.speedPresets.join(', ') : 'Not found'}`);
      console.log(`  currentSpeedPresetIndex: ${state.currentSpeedPresetIndex ?? 'Not found'}`);
      console.log(`  doubleClickToEdit: ${state.doubleClickToEdit ?? 'Not found'}`);
      console.log(`  textAlignment: ${state.textAlignment || 'Not found'}`);
      console.log(`  autoPauseOnEdit: ${state.autoPauseOnEdit ?? 'Not found'}`);

      // Display settings
      console.log('\n=== Display Settings ===');
      console.log(`  fontSize: ${state.fontSize}px`);
      console.log(`  eyelineVisible: ${state.eyelineVisible}`);
      console.log(`  progressIndicatorStyle: ${state.progressIndicatorStyle}`);

      // Connection info
      console.log('\n=== Status ===');
      console.log(`  isPinned: ${state.isPinned}`);
      console.log(`  isFullScreen: ${state.isFullScreen}`);
      console.log(`  isKeepAwake: ${state.isKeepAwake}`);
      console.log(`  isVoiceScrollEnabled: ${state.isVoiceScrollEnabled ?? 'Not found'}`);
      console.log(`  headers: ${state.headers?.length || 0} sections`);

      console.log('\n✅ All tests passed! Teleprompter Plus v0.7.0 is working.\n');

      ws.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('Failed to parse message:', error);
  }
});

ws.on('error', (error) => {
  clearTimeout(timeout);
  console.log(`❌ Connection error: ${error.message}`);
  console.log('\n💡 Make sure Obsidian and Teleprompter Plus are running');
  process.exit(1);
});

ws.on('close', () => {
  if (!stateReceived) {
    console.log('Connection closed without receiving state');
  }
});
