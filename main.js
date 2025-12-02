const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const twilio = require('twilio');
const crypto = require('crypto');
const { exec } = require('child_process'); // 👈 NEW
const { google } = require('googleapis');
const { autoUpdater } = require('electron-updater');

// Log version on startup:
console.log('[SmartVoiceX] app version:', app.getVersion());

ipcMain.handle('get-version', () => app.getVersion());

// ========= AUTO-UPDATER GLOBAL CONFIG =========

// Use console for logging
autoUpdater.logger = console;

// We control install manually after download
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

// Basic diagnostics
autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] error:', err);
});

autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdater] checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdater] update available:', info.version);
});

autoUpdater.on('update-not-available', () => {
  console.log('[AutoUpdater] no update available');
});

autoUpdater.on('download-progress', (p) => {
  console.log(
    '[AutoUpdater] download progress:',
    `${p.percent.toFixed(1)}%`
  );
});

// 👇 KEY: when the update is fully downloaded, close app, run installer, relaunch
autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdater] update downloaded:', info.version);
  // quitAndInstall(isSilent, isForceRunAfter)
  autoUpdater.quitAndInstall(false, true);
});

// 🔐 Google Drive constants (no UI / not in .env)
const GOOGLE_DRIVE_FOLDER_ID = '1foIeWLJKiuhwXwcIxLcOxNssdv6UPMJr';

// If you're using OAuth (credentials.json + token.json):
const GOOGLE_OAUTH_CREDENTIALS_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'k', 'c.json')
  : path.join(__dirname, 'k', 'c.json');

const GOOGLE_OAUTH_TOKEN_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'k', 't.json')
  : path.join(__dirname, 'k', 't.json');

function getEnvPath() {
  // In production: store .env in userData (e.g. C:\Users\<you>\AppData\Roaming\<AppName>\)
  // In dev: keep using the project folder (next to main.js)
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), '.env');
  }
  return path.join(__dirname, '.env');
}

const xi_BASE_URL = 'https://api.elevenlabs.io';

function getXiApiKey() {
  const cfg = loadConfigFromEnv();
  const apiKey = cfg.xiLabs && cfg.xiLabs.apiKey;
  if (!apiKey) {
    throw new Error('Missing AI API key in .env.');
  }
  return apiKey;
}

function getxiConfig() {
  const cfg = loadConfigFromEnv();
  const apiKey = cfg.xiLabs?.apiKey;
  const agentId = cfg.xiLabs?.agentId;
  if (!apiKey || !agentId) {
    throw new Error('Ai API key or agent ID missing in config.');
  }
  return { apiKey, agentId };
}

async function xiFetch(path, options = {}) {
  const { apiKey } = getxiConfig();

  const res = await fetch(`${xi_BASE_URL}${path}`, {
    ...options,
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ai API error ${res.status}: ${body}`);
  }

  return res.json();
}


// ====== CONFIG / STORAGE ======


// passphrase you specified
const PASSPHRASE = 'xinihpredro';

// root of your git repo (project folder)
const REPO_ROOT = __dirname;

// derive a 32-byte key from passphrase
function getKey() {
  // salt is static here for simplicity since everything is local;
  // if you want stronger security, randomize and store salt as well.
  return crypto.scryptSync(PASSPHRASE, 'local_salt_v1', 32);
}

// Encrypt a JS object -> base64 string: iv:tag:ciphertext
function encryptConfig(obj) {
  const json = JSON.stringify(obj);
  const key = getKey();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(json, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');

  // iv:tag:ciphertext
  return `${iv.toString('base64')}:${tag}:${encrypted}`;
}

// Decrypt base64 string -> JS object
function decryptConfig(str) {
  try {
    const [ivB64, tagB64, encB64] = str.split(':');
    if (!ivB64 || !tagB64 || !encB64) {
      throw new Error('Malformed encrypted config');
    }

    const key = getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(encB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Failed to decrypt config:', err);
    return null;
  }
}

// Simple .env parser
function readEnvFile() {
  const ENV_PATH = getEnvPath();

  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  });

  return env;
}



// Rewrite .env preserving any unknown keys
function writeEnvFile(envObj) {
  const ENV_PATH = getEnvPath();
  const lines = Object.entries(envObj).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');
}



// Default config shape
function defaultConfig() {
  return {
    xiLabs: {
      apiKey: '',
      voiceId: '',
      agentId: 'agent_0101k74mak3re8qazy889xmc9bb8',
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
    },
    payment: {
      cardNumber: '',
      cvv: '',
      expiry: '',
      name: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    },
    googleCalendar: {
      calendarId: '',
      serviceAccountKeyPath: ''
    },
    googleDrive: {
      folderId: '',
      serviceAccountKeyPath: ''
    }
  };
}

// Load config from .env (CONFIG_ENC=...)
function loadConfigFromEnv() {
  const env = readEnvFile();
  if (!env.CONFIG_ENC) {
    return defaultConfig();
  }
  const decrypted = decryptConfig(env.CONFIG_ENC);
  if (!decrypted) {
    return defaultConfig();
  }
  // merge with default in case of older versions / missing fields
  const base = defaultConfig();
  return {
    ...base,
    ...decrypted,
    xiLabs: { ...base.xiLabs, ...(decrypted.xiLabs || {}) },
    twilio: { ...base.twilio, ...(decrypted.twilio || {}) },
    payment: { ...base.payment, ...(decrypted.payment || {}) },
    googleCalendar: {
      ...base.googleCalendar,
      ...(decrypted.googleCalendar || {})
    },
    googleDrive: { ...base.googleDrive, ...(decrypted.googleDrive || {}) }
  };
}



// Save config to .env
function saveConfigToEnv(config) {
  const env = readEnvFile();
  const enc = encryptConfig(config);
  env.CONFIG_ENC = enc;
  writeEnvFile(env);
}

/* ---------- GIT HELPERS ---------- */

function runGit(cmd) {
  return new Promise((resolve, reject) => {
    // 🔒 Never run git in the installed app
    if (app.isPackaged) {
      console.log('[Git] Skipping git command in packaged app:', cmd);
      return resolve('');
    }

    exec(cmd, { cwd: REPO_ROOT }, (error, stdout, stderr) => {
      if (error) {
        console.error(`git error (${cmd}):`, stderr || error.message);
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}



// Commit & push .env to your private repo
async function syncEnvToGitRepo() {
  try {
    await runGit('git add .env');

    // commit; ignore "nothing to commit" failures
    try {
      const now = new Date().toLocaleString();
      await runGit(`git commit -m "New Updates (${now})"`);

    } catch (err) {
      const msg = String(err.message || err);
      if (!/nothing to commit/i.test(msg)) {
        throw err;
      }
      console.warn('git commit: nothing to commit, skipping.');
    }

    await runGit('git push');
    console.log('.env pushed to GitHub');
    return { ok: true };
  } catch (err) {
    console.error('Failed to sync .env to GitHub:', err);
    return { ok: false, error: err.message || String(err) };
  }
}


// Pull latest code from GitHub while preserving local .env
async function pullLatestFromGitPreservingEnv() {
  const ENV_PATH = getEnvPath();

  // 🧊 In packaged app, do nothing
  if (app.isPackaged) {
    console.log('[Git] pullLatestFromGitPreservingEnv skipped in packaged app');
    return { ok: true, skipped: true };
  }

  let envBackup = null;

  if (fs.existsSync(ENV_PATH)) {
    envBackup = fs.readFileSync(ENV_PATH, 'utf8');
  }

  try {
    await runGit('git fetch');
    await runGit('git pull');
  } catch (err) {
    console.error('Git pull failed:', err);
    if (envBackup != null) {
      fs.writeFileSync(ENV_PATH, envBackup, 'utf8');
    }
    return { ok: false, error: err.message || String(err) };
  }

  if (envBackup != null) {
    fs.writeFileSync(ENV_PATH, envBackup, 'utf8');
  }

  return { ok: true };
}





async function uploadEnvToGoogleDrive() {
  try {
    const ENV_PATH = getEnvPath();
    console.log('[Drive] ENV_PATH =', ENV_PATH);
    console.log('[Drive] app.isPackaged =', app.isPackaged);
    console.log('[Drive] GOOGLE_OAUTH_CREDENTIALS_PATH =', GOOGLE_OAUTH_CREDENTIALS_PATH);
    console.log('[Drive] GOOGLE_OAUTH_TOKEN_PATH =', GOOGLE_OAUTH_TOKEN_PATH);
    console.log('[Drive] env exists?', fs.existsSync(ENV_PATH));
    console.log('[Drive] creds exist?', fs.existsSync(GOOGLE_OAUTH_CREDENTIALS_PATH));
    console.log('[Drive] token exists?', fs.existsSync(GOOGLE_OAUTH_TOKEN_PATH));

    if (!fs.existsSync(ENV_PATH)) {
      throw new Error('.env not found for upload');
    }

    // 🔐 Still use your constant folder ID
    const folderId = GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      console.log(
        'No gid configured; skipping env backup upload.'
      );
      return { ok: true, skipped: true };
    }

    // ---- LOAD OAUTH CLIENT CREDENTIALS (c.json) ----
    if (!fs.existsSync(GOOGLE_OAUTH_CREDENTIALS_PATH)) {
      throw new Error(
        `Missing  OAuth credentials at: ${GOOGLE_OAUTH_CREDENTIALS_PATH}`
      );
    }

    const credentials = JSON.parse(
      fs.readFileSync(GOOGLE_OAUTH_CREDENTIALS_PATH, 'utf8')
    );

    // c.json can be of type "installed" or "web"
    const oauthInfo = credentials.installed || credentials.web;
    if (!oauthInfo) {
      throw new Error(
        'OAuth credentials file must contain "installed" or "web" section.'
      );
    }

    const { client_id, client_secret, redirect_uris } = oauthInfo;
    if (!client_id || !client_secret || !redirect_uris || !redirect_uris.length) {
      throw new Error('OAuth credentials file is missing client_id/client_secret/redirect_uris.');
    }

    const redirectUri = redirect_uris[0];

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );

    // ---- LOAD STORED TOKENS (t.json) ----
    if (!fs.existsSync(GOOGLE_OAUTH_TOKEN_PATH)) {
      throw new Error(
        `Missing Google OAuth token at: ${GOOGLE_OAUTH_TOKEN_PATH}`
      );
    }

    const token = JSON.parse(
      fs.readFileSync(GOOGLE_OAUTH_TOKEN_PATH, 'utf8')
    );

    // Token should contain at least access_token and refresh_token
    oAuth2Client.setCredentials(token);

    const drive = google.drive({
      version: 'v3',
      auth: oAuth2Client
    });

    // ---- UPLOAD THE .env FILE ----
    const now = new Date();
    const iso = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const fileName = `env-backup-${iso}.env`;

    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: 'text/plain',
      body: fs.createReadStream(ENV_PATH)
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id'
    });

    console.log('Memory added to Neural map.  AIID:', res.data.id);
    return { ok: true, fileId: res.data.id };
  } catch (err) {
    console.error('Google Drive upload failed:', err);
    return { ok: false, error: err.message };
  }
}






// ====== ELECTRON WINDOW ======

let historyPath;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#111111',
    title: 'SmartVoiceX Beta',
    icon: path.join(__dirname, 'build', 'icon.ico'),   // 👈 add this
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

  // No direct autoUpdater.checkForUpdatesAndNotify() here;
  // updates are driven via ipcMain "check-updates" + renderer overlay.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ====== IPC HANDLERS ======

// Load config
ipcMain.handle('load-config', async () => {
  const cfg = loadConfigFromEnv();
  return cfg;
});

ipcMain.handle('save-config', async (_event, partialConfig) => {
  try {
    // Load existing decrypted config (includes hidden googleDrive)
    const existing = loadConfigFromEnv();

    // Merge: keep anything the UI doesn’t know about (like googleDrive)
    const merged = {
      ...existing,
      ...partialConfig,

      elevenLabs: {
        ...existing.elevenLabs,
        ...(partialConfig.elevenLabs || {})
      },

      twilio: {
        ...existing.twilio,
        ...(partialConfig.twilio || {})
      },

      payment: {
        ...existing.payment,
        ...(partialConfig.payment || {})
      },

      googleDrive: {
        ...existing.googleDrive,
        ...(partialConfig.googleDrive || {})
        // in normal use, partialConfig.googleDrive is undefined,
        // so the original secrets are preserved.
      }
    };

    // 1) Save encrypted config locally
    saveConfigToEnv(merged);

    // 2) Upload .env backup to Google Drive
    const driveResult = await uploadEnvToGoogleDrive(merged);

    if (!driveResult.ok) {
      // Local save succeeded, backup failed – report soft warning
      return { ok: true, driveError: driveResult.error };
    }

    return { ok: true };
  } catch (err) {
    console.error('Error saving config:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('load-config-from-file', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow();

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select .env config file',
      properties: ['openFile'],
      filters: [
        { name: 'Config Files', extensions: ['env', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { ok: false, error: 'No file selected.' };
    }

    const srcPath = filePaths[0];
    const ENV_PATH = getEnvPath();

    // Ensure parent dir exists
    const envDir = path.dirname(ENV_PATH);
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }

    // Copy the selected .env into the app's env location
    fs.copyFileSync(srcPath, ENV_PATH);

    // Now parse/decrypt using your existing loader
    const loadedConfig = loadConfigFromEnv();

    return { ok: true, config: loadedConfig };
  } catch (err) {
    console.error('load-config-from-file error:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

/**
 * Check for updates from renderer.
 * - In dev: returns { ok: true, dev: true }
 * - In prod: triggers checkForUpdates, which:
 *   - returns "none" if no newer version
 *   - returns "downloading" if an update is available (autoDownload is true)
 *
 * The actual install happens in the global `update-downloaded` listener
 * via `autoUpdater.quitAndInstall(true, true)`.
 */
ipcMain.handle('check-updates', async () => {
  if (!app.isPackaged) {
    console.log('[AutoUpdater] dev mode – skipping real update check');
    return {
      ok: true,
      dev: true,
      status: 'none',
      message: 'Dev mode – no auto-updates.'
    };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    const info = result && result.updateInfo;

    // If no update or same version, tell renderer "none"
    if (!info || !info.version || info.version === app.getVersion()) {
      console.log('[AutoUpdater] up to date:', app.getVersion());
      return { ok: true, status: 'none' };
    }

    // autoDownload = true means download starts automatically.
    console.log('[AutoUpdater] update check result, downloading:', info.version);
    return { ok: true, status: 'downloading', info };
  } catch (err) {
    console.error('[AutoUpdater] checkForUpdates() failed', err);
    return { ok: false, error: err.message || String(err) };
  }
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

ipcMain.handle('xi-get-conversations', async () => {
  try {
    const { agentId } = getxiConfig();

    const query = new URLSearchParams({
      agent_id: agentId,
      summary_mode: 'include', // include transcript_summary in list response
      page_size: '100'
    });

    const data = await xiFetch(`/v1/convai/conversations?${query.toString()}`);

    const conversations = (data.conversations || []).map((c) => {
      const startSec = c.start_time_unix_secs || null;
      const durationSec = c.call_duration_secs || 0;
      const minutes = durationSec / 60;
      const costMarkupUsd = +(minutes * 0.28).toFixed(2); 

      return {
        conversationId: c.conversation_id,
        agentId: c.agent_id,
        startedAtUnix: startSec,
        direction: c.direction || 'unknown',
        status: c.status || '',
        callSuccessful: c.call_successful || '',
        durationSeconds: durationSec,
        messageCount: c.message_count || 0,
        agentName: c.agent_name || '',
        summary: c.transcript_summary || c.call_summary_title || '',
        costMarkupUsd
      };
    });

    // Aggregate metrics for charts: last 14 days by date
    const byDayMap = new Map();
    let totalCalls = 0;
    let totalMinutes = 0;

    conversations.forEach((c) => {
      if (!c.startedAtUnix) return;
      const d = new Date(c.startedAtUnix * 1000);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD

      const durationMinutes = c.durationSeconds / 60;
      totalCalls += 1;
      totalMinutes += durationMinutes;

      const existing = byDayMap.get(key) || { date: key, callCount: 0, minutes: 0 };
      existing.callCount += 1;
      existing.minutes += durationMinutes;
      byDayMap.set(key, existing);
    });

    const byDay = Array.from(byDayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return {
      ok: true,
      conversations,
      metrics: {
        totalCalls,
        totalMinutes,
        byDay
      }
    };
  } catch (err) {
    console.error('xi-get-conversations error', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('xi-get-conversation-detail', async (_event, conversationId) => {
  try {
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const data = await xiFetch(`/v1/convai/conversations/${conversationId}`);

    // shape down a bit for renderer
    const metadata = data.metadata || {};
    const transcript = data.transcript || [];

    return {
      ok: true,
      conversation: {
        conversationId: data.conversation_id,
        agentId: data.agent_id,
        status: data.status,
        transcript,
        metadata,
        hasAudio: data.has_audio,
        hasUserAudio: data.has_user_audio,
        hasResponseAudio: data.has_response_audio,
        analysis: data.analysis || null,
        clientData: data.conversation_initiation_client_data || null
      }
    };
  } catch (err) {
    console.error('xi-get-conversation-detail error', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('xi-add-knowledge-url', async (_event, { url, name }) => {
  try {
    if (!url) throw new Error('URL is required');
    // Ensure config exists (even though this endpoint only needs API key)
    getxiConfig();

    const body = { url, name: name || url };

    const data = await xiFetch('/v1/convai/knowledge-base/url', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    // data: { id, name }
    return { ok: true, document: data };
  } catch (err) {
    console.error('xi-add-knowledge-url error', err);
    return { ok: false, error: err.message };
  }
});

// Start a call via Twilio (basic example)
ipcMain.handle('start-call', async (_event, payload) => {
  const { toNumber } = payload;
  const config = loadConfigFromEnv();

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
    // This uses Twilio
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

ipcMain.handle('gcal-list-appointments', async () => {
  try {
    const config = loadConfigFromEnv();
    const gcalCfg = (config && config.googleCalendar) || {};

    const calendarId = gcalCfg.calendarId;
    const keyPath = gcalCfg.serviceAccountKeyPath;

    if (!calendarId || !keyPath) {
      return { ok: false, error: 'Google Calendar not configured.' };
    }

    // Make sure the key file exists
    if (!fs.existsSync(keyPath)) {
      return {
        ok: false,
        error: `Key file not found at path: ${keyPath}`
      };
    }

    // Use GoogleAuth with the service account JSON key file
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly']
    });

    const calendar = google.calendar({
      version: 'v3',
      auth
    });

    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(now.getDate() + 30);

    const res = await calendar.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: in30Days.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = (res.data.items || []).map((evt) => ({
      id: evt.id,
      summary: evt.summary || '(no title)',
      start: evt.start?.dateTime || evt.start?.date || '',
      end: evt.end?.dateTime || evt.end?.date || '',
      location: evt.location || '',
      description: evt.description || ''
    }));

    return { ok: true, events };
  } catch (err) {
    console.error('gcal-list-appointments error', err);
    return {
      ok: false,
      error: err.message || String(err)
    };
  }
});



// (Optional) Fetch updated call details from Twilio (e.g., duration, final status, transcript)
ipcMain.handle('refresh-call', async (_event, callSid) => {
  const config = loadConfigFromEnv();
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
      // TODO: populate summary/transcript  once you have that wiring
    }

    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

    return { ok: true, call };
  } catch (err) {
    console.error('Error refreshing call:', err);
    return { ok: false, error: err.message };
  }
});
