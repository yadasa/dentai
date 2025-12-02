// get-drive-token.js
// One-time script to get an OAuth token for Google Drive (desktop flow)

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

const KEYS_DIR = path.join(__dirname, 'k');
const CREDENTIALS_PATH = path.join(KEYS_DIR, 'c.json');
const TOKEN_PATH = path.join(KEYS_DIR, 't.json');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`credentials.json not found at ${CREDENTIALS_PATH}`);
  }
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  return JSON.parse(content);
}

function getOAuth2Client() {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this URL:\n');
  console.log(authUrl, '\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      oAuth2Client.setCredentials(tokens);
      if (!fs.existsSync(KEYS_DIR)) {
        fs.mkdirSync(KEYS_DIR, { recursive: true });
      }
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
      console.log(`Token stored to ${TOKEN_PATH}`);
    } catch (err) {
      console.error('Error while trying to retrieve access token:', err);
    }
  });
}

async function main() {
  try {
    const oAuth2Client = getOAuth2Client();

    if (fs.existsSync(TOKEN_PATH)) {
      console.log(`t.json already exists at ${TOKEN_PATH}`);
      console.log('Delete it if you want to re-authorize.');
      return;
    }

    getNewToken(oAuth2Client);
  } catch (err) {
    console.error('Failed to get token:', err);
  }
}

main();
