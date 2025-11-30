param(
    [string]$ProjectName = "voice-agent-desktop"
)

Write-Host "Setting up project '$ProjectName'..." -ForegroundColor Cyan

# 1. Create project folder
$projectRoot = Join-Path $PSScriptRoot $ProjectName
if (!(Test-Path $projectRoot)) {
    New-Item -ItemType Directory -Path $projectRoot | Out-Null
    Write-Host "Created folder: $projectRoot"
} else {
    Write-Host "Folder already exists: $projectRoot (files may be overwritten)" -ForegroundColor Yellow
}

Set-Location $projectRoot

# 2. package.json
@'
{
  "name": "voice-agent-desktop",
  "version": "1.0.0",
  "description": "Desktop UI wrapper for ElevenLabs + Twilio",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "pack": "electron-builder --dir",
    "dist": "electron-builder"
  },
  "build": {
    "appId": "com.yourcompany.voiceagent",
    "productName": "Voice Agent Desktop",
    "win": {
      "target": "nsis"
    }
  },
  "author": "You",
  "license": "MIT",
  "dependencies": {
    "electron-store": "^8.2.0",
    "twilio": "^5.2.0"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0"
  }
}
'@ | Set-Content -Encoding UTF8 "package.json"

# 3. main.js
@'
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const twilio = require('twilio');

// Simple config store for API keys + agent settings
const store = new Store();

// Paths for local JSON history
let historyPath;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#111111',
    title: 'Voice Agent Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  historyPath = path.join(app.getPath('userData'), 'call-history.json');

  // Ensure history file exists
  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, JSON.stringify([]), 'utf8');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC HANDLERS ----------

// Load config (ElevenLabs + Twilio + agent settings)
ipcMain.handle('load-config', async () => {
  // Default structure
  const defaultConfig = {
    elevenLabs: {
      apiKey: '',
      voiceId: '',
      language: '',
      systemPrompt: '',
      greeting: '',
      speed: 1.0,
      stability: 0.5,
      similarityBoost: 0.75
    },
    twilio: {
      accountSid: '',
      authToken: '',
      fromNumber: ''
    }
  };

  const saved = store.get('config') || defaultConfig;
  return saved;
});

// Save config
ipcMain.handle('save-config', async (_event, config) => {
  store.set('config', config);
  return { ok: true };
});

// Get call history
ipcMain.handle('get-history', async () => {
  try {
    const content = fs.readFileSync(historyPath, 'utf8');
    const data = JSON.parse(content);
    return data;
  } catch (err) {
    console.error('Error reading history:', err);
    return [];
  }
});

// Clear history
ipcMain.handle('clear-history', async () => {
  try {
    fs.writeFileSync(historyPath, JSON.stringify([]), 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('Error clearing history:', err);
    return { ok: false, error: err.message };
  }
});

// Start a call via Twilio (basic example)
ipcMain.handle('start-call', async (_event, payload) => {
  const { toNumber } = payload;
  const config = store.get('config');

  if (
    !config ||
    !config.twilio ||
    !config.twilio.accountSid ||
    !config.twilio.authToken ||
    !config.twilio.fromNumber
  ) {
    return { ok: false, error: 'Twilio settings are missing.' };
  }

  const { accountSid, authToken, fromNumber } = config.twilio;

  const client = twilio(accountSid, authToken);

  try {
    // BASIC DEMO CALL:
    // This uses Twilio’s demo TwiML URL. Replace with your own webhook/ElevenLabs integration later.
    const call = await client.calls.create({
      to: toNumber,
      from: fromNumber,
      url: 'https://demo.twilio.com/docs/voice.xml',
      record: true
    });

    // Append to local history immediately (status = initiated)
    const content = fs.readFileSync(historyPath, 'utf8');
    const history = JSON.parse(content);

    const entry = {
      id: call.sid,
      timestamp: new Date().toISOString(),
      to: toNumber,
      from: fromNumber,
      durationSeconds: null,
      status: 'initiated',
      summary: 'Call initiated (demo TwiML).',
      transcript: null
    };

    history.unshift(entry);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

    return { ok: true, callSid: call.sid };
  } catch (err) {
    console.error('Error starting call:', err);
    return { ok: false, error: err.message };
  }
});

// (Optional) Fetch updated call details from Twilio (e.g., duration, final status, transcript)
ipcMain.handle('refresh-call', async (_event, callSid) => {
  const config = store.get('config');
  if (
    !config ||
    !config.twilio ||
    !config.twilio.accountSid ||
    !config.twilio.authToken
  ) {
    return { ok: false, error: 'Twilio settings are missing.' };
  }

  const { accountSid, authToken } = config.twilio;
  const client = twilio(accountSid, authToken);

  try {
    const call = await client.calls(callSid).fetch();

    // (Optional) fetch recordings/transcriptions here.

    const content = fs.readFileSync(historyPath, 'utf8');
    const history = JSON.parse(content);

    const index = history.findIndex((h) => h.id === callSid);
    if (index !== -1) {
      history[index].durationSeconds = call.duration
        ? Number(call.duration)
        : null;
      history[index].status = call.status;
      // TODO: populate summary/transcript from Twilio or ElevenLabs once you have that wiring
    }

    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

    return { ok: true, call };
  } catch (err) {
    console.error('Error refreshing call:', err);
    return { ok: false, error: err.message };
  }
});
'@ | Set-Content -Encoding UTF8 "main.js"

# 4. preload.js
@'
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  startCall: (payload) => ipcRenderer.invoke('start-call', payload),
  refreshCall: (callSid) => ipcRenderer.invoke('refresh-call', callSid)
});
'@ | Set-Content -Encoding UTF8 "preload.js"

# 5. index.html
@'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Voice Agent Desktop</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app">
      <header class="app-header">
        <div class="app-title">Voice Agent Desktop</div>
        <div class="app-subtitle">ElevenLabs + Twilio Control Panel</div>
      </header>

      <div class="app-body">
        <nav class="sidebar">
          <button class="nav-btn active" data-view="agent-settings">
            Agent Settings
          </button>
          <button class="nav-btn" data-view="dialer">Dialer</button>
          <button class="nav-btn" data-view="history">Call History</button>
        </nav>

        <main class="main-panel">
          <!-- Agent Settings View -->
          <section id="view-agent-settings" class="view active-view">
            <h2>ElevenLabs Agent Settings</h2>
            <div class="card">
              <h3>ElevenLabs API</h3>
              <label>
                API Key
                <input
                  type="password"
                  id="eleven-api-key"
                  placeholder="Enter ElevenLabs API key"
                />
              </label>
            </div>

            <div class="card">
              <h3>Voice & Language</h3>
              <div class="grid-2">
                <label>
                  Voice
                  <select id="eleven-voice">
                    <!-- You can populate this via API later -->
                    <option value="">Select voice</option>
                    <option value="adam">Adam (English)</option>
                    <option value="bella">Bella (English)</option>
                    <option value="antonio">Antonio (Spanish)</option>
                  </select>
                </label>

                <label>
                  Language
                  <select id="eleven-language">
                    <option value="">Auto / default</option>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                  </select>
                </label>
              </div>
            </div>

            <div class="card">
              <h3>Agent Behavior</h3>
              <label>
                System Prompt
                <textarea
                  id="eleven-system-prompt"
                  rows="4"
                  placeholder="Describe the agent's personality, role, and behavior..."
                ></textarea>
              </label>

              <label>
                Greeting (First Message)
                <textarea
                  id="eleven-greeting"
                  rows="2"
                  placeholder="What should the agent say when the call connects?"
                ></textarea>
              </label>
            </div>

            <div class="card">
              <h3>Voice Fine-Tuning</h3>
              <div class="slider-row">
                <label>
                  Talking Speed
                  <input
                    type="range"
                    id="eleven-speed"
                    min="0.6"
                    max="1.4"
                    step="0.05"
                    value="1.0"
                  />
                </label>
                <span id="eleven-speed-value">1.0x</span>
              </div>

              <div class="slider-row">
                <label>
                  Stability
                  <input
                    type="range"
                    id="eleven-stability"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value="0.5"
                  />
                </label>
                <span id="eleven-stability-value">0.50</span>
              </div>

              <div class="slider-row">
                <label>
                  Similarity Boost
                  <input
                    type="range"
                    id="eleven-similarity"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value="0.75"
                  />
                </label>
                <span id="eleven-similarity-value">0.75</span>
              </div>
            </div>

            <div class="action-row">
              <button id="btn-save-agent" class="primary-btn">
                Save Agent Settings
              </button>
              <button id="btn-test-voice" class="ghost-btn">
                Test Voice (placeholder)
              </button>
              <span id="agent-save-status" class="status-text"></span>
            </div>
          </section>

          <!-- Dialer View -->
          <section id="view-dialer" class="view">
            <h2>Dialer (Twilio)</h2>

            <div class="card">
              <h3>Twilio Credentials</h3>
              <div class="grid-3">
                <label>
                  Account SID
                  <input
                    type="text"
                    id="twilio-account-sid"
                    placeholder="ACxxxxxxxx"
                  />
                </label>
                <label>
                  Auth Token
                  <input
                    type="password"
                    id="twilio-auth-token"
                    placeholder="Your auth token"
                  />
                </label>
                <label>
                  From Number
                  <input
                    type="text"
                    id="twilio-from-number"
                    placeholder="+1XXXXXXXXXX"
                  />
                </label>
              </div>
            </div>

            <div class="card">
              <h3>Place a Call</h3>
              <div class="grid-2">
                <label>
                  To Number
                  <input
                    type="text"
                    id="dialer-to-number"
                    placeholder="+1XXXXXXXXXX"
                  />
                </label>
                <div class="dialer-controls">
                  <button id="btn-start-call" class="primary-btn">
                    Call
                  </button>
                  <span id="dialer-status" class="status-text"></span>
                </div>
              </div>
            </div>

            <div class="card">
              <h3>Call Log (Session)</h3>
              <pre id="dialer-log" class="log-box"></pre>
            </div>
          </section>

          <!-- Call History View -->
          <section id="view-history" class="view">
            <h2>Call History</h2>

            <div class="card history-header">
              <button id="btn-refresh-history" class="ghost-btn">
                Refresh
              </button>
              <button id="btn-clear-history" class="danger-btn">
                Clear History
              </button>
              <span id="history-status" class="status-text"></span>
            </div>

            <div class="card">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>To</th>
                    <th>From</th>
                    <th>Status</th>
                    <th>Duration (s)</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody id="history-table-body"></tbody>
              </table>
            </div>

            <div class="card">
              <h3>Transcript</h3>
              <div id="history-transcript" class="transcript-box">
                Select a call to view its transcript.
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>

    <script src="./renderer.js"></script>
  </body>
</html>
'@ | Set-Content -Encoding UTF8 "index.html"

# 6. styles.css
@'
:root {
  --bg: #111111;
  --bg-elevated: #191919;
  --bg-card: #1e1e1e;
  --border-subtle: #2a2a2a;
  --text: #f0f0f0;
  --text-muted: #a0a0a0;
  --accent: #5b8dff; /* cool blue */
  --accent-soft: rgba(91, 141, 255, 0.18);
  --danger: #ff4c6a;
  --radius: 10px;
  --shadow-soft: 0 10px 30px rgba(0, 0, 0, 0.6);
  --font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font);
  background: radial-gradient(circle at top left, #161925 0, #080808 50%);
  color: var(--text);
}

/* Layout */

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: linear-gradient(90deg, #151515, #121726);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.7);
  z-index: 1;
}

.app-title {
  font-size: 20px;
  font-weight: 600;
}

.app-subtitle {
  font-size: 12px;
  color: var(--text-muted);
}

.app-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Sidebar */

.sidebar {
  width: 220px;
  padding: 16px;
  background: linear-gradient(180deg, #101318, #050608);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--text-muted);
  padding: 10px 12px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease,
    transform 0.08s ease;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text);
  border-color: var(--border-subtle);
}

.nav-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
  transform: translateY(-1px);
}

/* Main panel */

.main-panel {
  flex: 1;
  padding: 18px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.view {
  display: none;
  flex-direction: column;
  gap: 16px;
}

.active-view {
  display: flex;
}

h2 {
  margin: 0;
  font-size: 18px;
}

h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
}

/* Cards */

.card {
  background: var(--bg-card);
  padding: 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-soft);
}

.card + .card {
  margin-top: 8px;
}

/* Inputs */

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 12px;
}

input,
select,
textarea {
  background: #101010;
  border-radius: 8px;
  border: 1px solid #333333;
  padding: 8px 10px;
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease,
    background 0.18s ease;
}

input:focus,
select:focus,
textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft);
  background: #13131a;
}

/* Buttons */

button {
  font-family: inherit;
  font-size: 13px;
}

.primary-btn,
.ghost-btn,
.danger-btn {
  border-radius: 999px;
  padding: 8px 16px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease,
    transform 0.08s ease, box-shadow 0.18s ease;
}

.primary-btn {
  background: var(--accent);
  color: #0b0b10;
  border-color: var(--accent);
  box-shadow: 0 0 18px rgba(91, 141, 255, 0.5);
}

.primary-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 25px rgba(91, 141, 255, 0.85);
}

.ghost-btn {
  background: transparent;
  color: var(--accent);
  border-color: var(--accent);
}

.ghost-btn:hover {
  background: var(--accent-soft);
}

.danger-btn {
  background: transparent;
  color: var(--danger);
  border-color: var(--danger);
}

.danger-btn:hover {
  background: rgba(255, 76, 106, 0.12);
}

/* Status / misc */

.status-text {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 8px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 960px) {
  .grid-3 {
    grid-template-columns: 1fr;
  }
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.slider-row input[type='range'] {
  flex: 1;
}

#eleven-speed-value,
#eleven-stability-value,
#eleven-similarity-value {
  font-size: 12px;
  color: var(--accent);
}

/* Dialer */

.dialer-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
}

.log-box {
  background: #0b0b0f;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #252533;
  max-height: 180px;
  overflow-y: auto;
  font-size: 11px;
  white-space: pre-wrap;
}

/* History */

.history-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.history-table th,
.history-table td {
  padding: 8px;
  border-bottom: 1px solid #2a2a33;
}

.history-table tbody tr {
  cursor: pointer;
  transition: background 0.12s ease;
}

.history-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.03);
}

.history-table tbody tr.selected {
  background: var(--accent-soft);
}

.transcript-box {
  background: #0b0b10;
  border-radius: 8px;
  border: 1px solid #252533;
  padding: 12px;
  font-size: 12px;
  max-height: 260px;
  overflow-y: auto;
  color: var(--text-muted);
}
'@ | Set-Content -Encoding UTF8 "styles.css"

# 7. renderer.js
@'
function logDialer(message) {
  const logEl = document.getElementById('dialer-log');
  const timestamp = new Date().toLocaleTimeString();
  logEl.textContent += `[${timestamp}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- NAV / VIEW SWITCHING ----
const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-view');

    navButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    views.forEach((v) => v.classList.remove('active-view'));
    document.getElementById(`view-${target}`).classList.add('active-view');
  });
});

// ---- SLIDER LABELS ----
const speedSlider = document.getElementById('eleven-speed');
const speedValue = document.getElementById('eleven-speed-value');

const stabilitySlider = document.getElementById('eleven-stability');
const stabilityValue = document.getElementById('eleven-stability-value');

const similaritySlider = document.getElementById('eleven-similarity');
const similarityValue = document.getElementById('eleven-similarity-value');

if (speedSlider) {
  speedSlider.addEventListener('input', () => {
    speedValue.textContent = `${Number(speedSlider.value).toFixed(2)}x`;
  });
}
if (stabilitySlider) {
  stabilitySlider.addEventListener('input', () => {
    stabilityValue.textContent = Number(stabilitySlider.value).toFixed(2);
  });
}
if (similaritySlider) {
  similaritySlider.addEventListener('input', () => {
    similarityValue.textContent = Number(similaritySlider.value).toFixed(2);
  });
}

// ---- LOAD CONFIG ON START ----
async function loadConfigIntoUI() {
  try {
    const config = await window.api.loadConfig();

    // ElevenLabs
    document.getElementById('eleven-api-key').value =
      config.elevenLabs.apiKey || '';
    document.getElementById('eleven-voice').value =
      config.elevenLabs.voiceId || '';
    document.getElementById('eleven-language').value =
      config.elevenLabs.language || '';
    document.getElementById('eleven-system-prompt').value =
      config.elevenLabs.systemPrompt || '';
    document.getElementById('eleven-greeting').value =
      config.elevenLabs.greeting || '';

    if (config.elevenLabs.speed != null) {
      speedSlider.value = config.elevenLabs.speed;
      speedValue.textContent = `${Number(config.elevenLabs.speed).toFixed(
        2
      )}x`;
    }

    if (config.elevenLabs.stability != null) {
      stabilitySlider.value = config.elevenLabs.stability;
      stabilityValue.textContent = Number(
        config.elevenLabs.stability
      ).toFixed(2);
    }

    if (config.elevenLabs.similarityBoost != null) {
      similaritySlider.value = config.elevenLabs.similarityBoost;
      similarityValue.textContent = Number(
        config.elevenLabs.similarityBoost
      ).toFixed(2);
    }

    // Twilio
    document.getElementById('twilio-account-sid').value =
      config.twilio.accountSid || '';
    document.getElementById('twilio-auth-token').value =
      config.twilio.authToken || '';
    document.getElementById('twilio-from-number').value =
      config.twilio.fromNumber || '';
  } catch (err) {
    console.error('Failed to load config', err);
  }
}

// ---- SAVE CONFIG ----
document
  .getElementById('btn-save-agent')
  .addEventListener('click', async () => {
    const agentSaveStatus = document.getElementById('agent-save-status');

    const config = {
      elevenLabs: {
        apiKey: document.getElementById('eleven-api-key').value.trim(),
        voiceId: document.getElementById('eleven-voice').value,
        language: document.getElementById('eleven-language').value,
        systemPrompt: document
          .getElementById('eleven-system-prompt')
          .value.trim(),
        greeting: document.getElementById('eleven-greeting').value.trim(),
        speed: Number(document.getElementById('eleven-speed').value),
        stability: Number(document.getElementById('eleven-stability').value),
        similarityBoost: Number(
          document.getElementById('eleven-similarity').value
        )
      },
      twilio: {
        accountSid: document
          .getElementById('twilio-account-sid')
          .value.trim(),
        authToken: document
          .getElementById('twilio-auth-token')
          .value.trim(),
        fromNumber: document
          .getElementById('twilio-from-number')
          .value.trim()
      }
    };

    const result = await window.api.saveConfig(config);
    if (result.ok) {
      agentSaveStatus.textContent = 'Settings saved.';
      setTimeout(() => {
        agentSaveStatus.textContent = '';
      }, 2500);
    } else {
      agentSaveStatus.textContent = 'Failed to save settings.';
    }
  });

// Placeholder: Test Voice button
document
  .getElementById('btn-test-voice')
  .addEventListener('click', () => {
    alert(
      'Test Voice is a placeholder.\nWire this to ElevenLabs TTS using your API key to play a sample.'
    );
  });

// ---- DIALER: START CALL ----
document.getElementById('btn-start-call').addEventListener('click', async () => {
  const toNumber = document.getElementById('dialer-to-number').value.trim();
  const statusEl = document.getElementById('dialer-status');

  if (!toNumber) {
    statusEl.textContent = 'Enter a destination number.';
    return;
  }

  statusEl.textContent = 'Starting call...';
  logDialer(`Attempting call to ${toNumber}`);

  const result = await window.api.startCall({ toNumber });

  if (result.ok) {
    statusEl.textContent = `Call initiated. SID: ${result.callSid}`;
    logDialer(`Call started successfully (SID ${result.callSid})`);
    await loadHistoryIntoUI();
  } else {
    statusEl.textContent = `Error: ${result.error}`;
    logDialer(`Error: ${result.error}`);
  }
});

// ---- HISTORY ----
const historyTableBody = document.getElementById('history-table-body');
const historyTranscriptEl = document.getElementById('history-transcript');
let currentHistory = [];
let selectedHistoryId = null;

async function loadHistoryIntoUI() {
  const historyStatus = document.getElementById('history-status');
  historyStatus.textContent = 'Loading...';

  try {
    const history = await window.api.getHistory();
    currentHistory = history;

    historyTableBody.innerHTML = '';

    history.forEach((entry) => {
      const tr = document.createElement('tr');
      tr.dataset.id = entry.id;

      const timeTd = document.createElement('td');
      const date = new Date(entry.timestamp);
      timeTd.textContent = date.toLocaleString();

      const toTd = document.createElement('td');
      toTd.textContent = entry.to || '';

      const fromTd = document.createElement('td');
      fromTd.textContent = entry.from || '';

      const statusTd = document.createElement('td');
      statusTd.textContent = entry.status || '';

      const durTd = document.createElement('td');
      durTd.textContent =
        entry.durationSeconds != null ? entry.durationSeconds : '';

      const summaryTd = document.createElement('td');
      summaryTd.textContent = entry.summary || '';

      tr.appendChild(timeTd);
      tr.appendChild(toTd);
      tr.appendChild(fromTd);
      tr.appendChild(statusTd);
      tr.appendChild(durTd);
      tr.appendChild(summaryTd);

      tr.addEventListener('click', () => {
        selectHistoryRow(entry.id);
      });

      historyTableBody.appendChild(tr);
    });

    historyStatus.textContent = `Loaded ${history.length} entr${
      history.length === 1 ? 'y' : 'ies'
    }.`;
  } catch (err) {
    console.error('Failed to load history', err);
    historyStatus.textContent = 'Failed to load history.';
  }
}

function selectHistoryRow(id) {
  selectedHistoryId = id;

  Array.from(historyTableBody.children).forEach((row) => {
    row.classList.toggle('selected', row.dataset.id === id);
  });

  const entry = currentHistory.find((e) => e.id === id);
  if (!entry) {
    historyTranscriptEl.textContent = 'No transcript found for this call.';
    return;
  }

  if (entry.transcript) {
    historyTranscriptEl.textContent = entry.transcript;
  } else {
    historyTranscriptEl.textContent =
      'No transcript stored yet.\n\nOnce you wire Twilio or ElevenLabs transcription, populate the transcript field in history entries.';
  }
}

document
  .getElementById('btn-refresh-history')
  .addEventListener('click', loadHistoryIntoUI);

document.getElementById('btn-clear-history').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear all call history?')) return;
  const res = await window.api.clearHistory();
  const historyStatus = document.getElementById('history-status');
  if (res.ok) {
    historyStatus.textContent = 'History cleared.';
    await loadHistoryIntoUI();
    historyTranscriptEl.textContent = 'Select a call to view its transcript.';
  } else {
    historyStatus.textContent = `Failed to clear: ${res.error}`;
  }
});

// Initial load
loadConfigIntoUI().then(() => {
  loadHistoryIntoUI();
});
'@ | Set-Content -Encoding UTF8 "renderer.js"

Write-Host "Files created."

# 8. Install dependencies
Write-Host "Running npm install (this may take a bit)..." -ForegroundColor Cyan
try {
    npm install
    Write-Host "npm install completed." -ForegroundColor Green
} catch {
    Write-Host "npm install failed. Make sure Node.js and npm are installed and in PATH." -ForegroundColor Red
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Project folder: $projectRoot"
Write-Host "To run the app:" -ForegroundColor Yellow
Write-Host "  cd `"$projectRoot`""
Write-Host "  npm start"
Write-Host ""
Read-Host "Press Enter to close this window"
