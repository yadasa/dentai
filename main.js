const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const twilio = require('twilio');
const crypto = require('crypto');

// ====== CONFIG / STORAGE ======

// .env stored in project directory (alongside main.js)
const ENV_PATH = path.join(__dirname, '.env');
// passphrase you specified
const PASSPHRASE = 'xinihpredro';

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
    // strip quotes if present
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
  const lines = Object.entries(envObj).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');
}

// Default config shape
function defaultConfig() {
  return {
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
    elevenLabs: { ...base.elevenLabs, ...(decrypted.elevenLabs || {}) },
    twilio: { ...base.twilio, ...(decrypted.twilio || {}) },
    payment: { ...base.payment, ...(decrypted.payment || {}) }
  };
}

// Save config to .env
function saveConfigToEnv(config) {
  const env = readEnvFile();
  const enc = encryptConfig(config);
  env.CONFIG_ENC = enc;
  writeEnvFile(env);
}

// ====== ELECTRON WINDOW ======

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

// ====== IPC HANDLERS ======

// Load config (ElevenLabs + Twilio + payment)
ipcMain.handle('load-config', async () => {
  const cfg = loadConfigFromEnv();
  return cfg;
});

// Save config
ipcMain.handle('save-config', async (_event, config) => {
  try {
    saveConfigToEnv(config);
    return { ok: true };
  } catch (err) {
    console.error('Error saving config:', err);
    return { ok: false, error: err.message };
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
      // TODO: populate summary/transcript from Twilio or ElevenLabs once you have that wiring
    }

    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

    return { ok: true, call };
  } catch (err) {
    console.error('Error refreshing call:', err);
    return { ok: false, error: err.message };
  }
});
