let callsChart = null;
let billingChart = null;


function logDialer(message) {
  const logEl = document.getElementById('dialer-log');
  if (!logEl) return; // safe if call log UI was removed
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

    if (target === 'appointments') {
      loadAppointments();
    }


    navButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    views.forEach((v) => v.classList.remove('active-view'));
    document.getElementById(`view-${target}`).classList.add('active-view');
  });
});

// ---- SLIDER LABELS ----
// Talking speed
const speedSlider = document.getElementById('xi-speed');
const speedValue = document.getElementById('xi-speed-value');

// Latency (this used to be “stability”; same element id, different meaning)
const latencySlider = document.getElementById('xi-stability');
const latencyValue = document.getElementById('xi-stability-value');

// Similarity
const similaritySlider = document.getElementById('xi-similarity');
const similarityValue = document.getElementById('xi-similarity-value');

if (speedSlider) {
  speedSlider.addEventListener('input', () => {
    speedValue.textContent = `${Number(speedSlider.value).toFixed(2)}x`;
  });
}
if (latencySlider) {
  latencySlider.min = '0';
  latencySlider.max = '5';
  latencySlider.step = '1';
  latencySlider.addEventListener('input', () => {
    latencyValue.textContent = Number(latencySlider.value).toFixed(0);
  });
}
if (similaritySlider) {
  similaritySlider.addEventListener('input', () => {
    similarityValue.textContent = Number(similaritySlider.value).toFixed(2);
  });
}

// ---- KNOWLEDGE BASE STATE ----
let knowledgeBaseLinks = [];

// Render knowledge base list (links + delete buttons)
function renderKnowledgeBase() {
  const listEl = document.getElementById('kb-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  knowledgeBaseLinks.forEach((url, index) => {
    const row = document.createElement('div');
    row.className = 'kb-row';

    const linkSpan = document.createElement('span');
    linkSpan.className = 'kb-link-text';
    linkSpan.textContent = url;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'kb-delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Remove link';
    deleteBtn.addEventListener('click', () => {
      knowledgeBaseLinks.splice(index, 1);
      renderKnowledgeBase();
    });

    row.appendChild(linkSpan);
    row.appendChild(deleteBtn);
    listEl.appendChild(row);
  });

  if (knowledgeBaseLinks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kb-empty';
    empty.textContent = 'No links added yet.';
    listEl.appendChild(empty);
  }
}

// Attach handlers for “Add link” / save link
function attachKnowledgeBaseHandlers() {
  const addBtn = document.getElementById('kb-add-btn');
  const inputEl = document.getElementById('kb-new-link');
  const saveBtn = document.getElementById('kb-save-link');

  if (!addBtn || !inputEl || !saveBtn) return;

  function showInput() {
    inputEl.classList.remove('hidden');
    saveBtn.classList.remove('hidden');
    inputEl.focus();
  }

  function hideInput() {
    inputEl.value = '';
    inputEl.classList.add('hidden');
    saveBtn.classList.add('hidden');
  }

  addBtn.addEventListener('click', () => {
    showInput();
  });

  saveBtn.addEventListener('click', () => {
    const value = inputEl.value.trim();
    if (!value) {
      hideInput();
      return;
    }
    // Basic de-duplication
    if (!knowledgeBaseLinks.includes(value)) {
      knowledgeBaseLinks.push(value);
      renderKnowledgeBase();
    }
    hideInput();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveBtn.click();
    } else if (e.key === 'Escape') {
      hideInput();
    }
  });
}

// ---- LOAD CONFIG ON START ----
async function loadConfigIntoUI() {
  try {
    const config = await window.api.loadConfig();
    const safeConfig = config || {};

    const xi = safeConfig.xiLabs || {};
    const twilio = safeConfig.twilio || {};
    const payment = safeConfig.payment || {};
    knowledgeBaseLinks = safeConfig.knowledgeBase || [];

    //
    const apiKeyEl = document.getElementById('xi-api-key');
    const voiceEl = document.getElementById('xi-voice');
    const promptEl = document.getElementById('xi-system-prompt');
    const greetingEl = document.getElementById('xi-greeting');
    const googleCalendar = safeConfig.googleCalendar || {};

    if (apiKeyEl) apiKeyEl.value = xi.apiKey || '';
    if (voiceEl) voiceEl.value = xi.voiceId || '';
    if (promptEl) promptEl.value = xi.systemPrompt || '';
    if (greetingEl) greetingEl.value = xi.greeting || '';
      // Google Calendar
    const gcalIdEl = document.getElementById('gcal-id');
    const gcalKeyEl = document.getElementById('gcal-key-path');

    if (gcalIdEl) {
      gcalIdEl.value = googleCalendar.calendarId || '';
    }
    if (gcalKeyEl) {
      gcalKeyEl.value = googleCalendar.serviceAccountKeyPath || '';
    }


    // Languages as checkboxes (multiple)
    const languageCheckboxes = document.querySelectorAll(
      'input[name="xi-language"]'
    );
    if (languageCheckboxes.length > 0) {
      const selectedLanguages =
        xi.languages ||
        (xi.language ? [xi.language] : []); // backwards compatible

      languageCheckboxes.forEach((cb) => {
        cb.checked = selectedLanguages.includes(cb.value);
      });
    }

    // Talking speed
    if (speedSlider) {
      const speedVal = xi.speed != null ? xi.speed : 1.0;
      speedSlider.value = speedVal;
      speedValue.textContent = `${Number(speedVal).toFixed(2)}x`;
    }

    // Latency (fallback to old “stability” if present)
    if (latencySlider) {
      const latencyVal =
        xi.latency != null
          ? xi.latency
          : xi.stability != null
          ? xi.stability
          : 3; // middle by default
      latencySlider.value = latencyVal;
      latencyValue.textContent = Number(latencyVal).toFixed(0);
    }

    // Similarity
    if (similaritySlider) {
      const simVal =
        xi.similarityBoost != null ? xi.similarityBoost : 0.75;
      similaritySlider.value = simVal;
      similarityValue.textContent = Number(simVal).toFixed(2);
    }

    // Twilio / Phone Settings
    const accSidEl = document.getElementById('twilio-account-sid');
    const authTokenEl = document.getElementById('twilio-auth-token');
    const fromNumEl = document.getElementById('twilio-from-number');

    if (accSidEl) accSidEl.value = twilio.accountSid || '';
    if (authTokenEl) authTokenEl.value = twilio.authToken || '';
    if (fromNumEl) fromNumEl.value = twilio.fromNumber || '';

    // Billing (card + billing) – mapping to payment object
    const cardNumberEl = document.getElementById('billing-card-number');
    const cvvEl = document.getElementById('billing-cvv');
    const expiryEl = document.getElementById('billing-expiry');
    const nameEl = document.getElementById('billing-name');
    const addrEl = document.getElementById('billing-address');
    const cityEl = document.getElementById('billing-city');
    const stateEl = document.getElementById('billing-state');
    const postalEl = document.getElementById('billing-postal');
    const countryEl = document.getElementById('billing-country');

    if (cardNumberEl) cardNumberEl.value = payment.cardNumber || '';
    if (cvvEl) cvvEl.value = payment.cvv || '';
    if (expiryEl) expiryEl.value = payment.expiry || '';
    if (nameEl) nameEl.value = payment.name || '';
    if (addrEl) addrEl.value = payment.address || '';
    if (cityEl) cityEl.value = payment.city || '';
    if (stateEl) stateEl.value = payment.state || '';
    if (postalEl) postalEl.value = payment.postalCode || '';
    if (countryEl) countryEl.value = payment.country || '';

    // Knowledge base
    renderKnowledgeBase();
    attachKnowledgeBaseHandlers();
  } catch (err) {
    console.error('Failed to load config', err);
  }
}

// ---- COLLECT CONFIG FROM UI (Agent + Twilio + Billing + KB) ----
function collectConfigFromUI() {
  // languages via checkboxes
  const languageCheckboxes = document.querySelectorAll(
    'input[name="xi-language"]'
  );
  const languages = [];
  languageCheckboxes.forEach((cb) => {
    if (cb.checked) languages.push(cb.value);
  });

  const xiConfig = {
    apiKey:
      (document.getElementById('xi-api-key') || {}).value?.trim() || '',
    voiceId: (document.getElementById('xi-voice') || {}).value || '',
    // first language if any, for older fields
    language: languages[0] || '',
    languages,
    systemPrompt:
      (document.getElementById('xi-system-prompt') || {}).value?.trim() ||
      '',
    greeting:
      (document.getElementById('xi-greeting') || {}).value?.trim() || '',
    speed: speedSlider ? Number(speedSlider.value) : 1.0,
    // new latency field; this used to be “stability”
    latency: latencySlider ? Number(latencySlider.value) : 3,
    similarityBoost: similaritySlider
      ? Number(similaritySlider.value)
      : 0.75
  };

  const twilioConfig = {
    accountSid:
      (document.getElementById('twilio-account-sid') || {}).value?.trim() ||
      '',
    authToken:
      (document.getElementById('twilio-auth-token') || {}).value?.trim() ||
      '',
    fromNumber:
      (document.getElementById('twilio-from-number') || {}).value?.trim() ||
      ''
  };

  const paymentConfig = {
    cardNumber:
      (document.getElementById('billing-card-number') || {}).value?.trim() ||
      '',
    cvv:
      (document.getElementById('billing-cvv') || {}).value?.trim() || '',
    expiry:
      (document.getElementById('billing-expiry') || {}).value?.trim() || '',
    name:
      (document.getElementById('billing-name') || {}).value?.trim() || '',
    address:
      (document.getElementById('billing-address') || {}).value?.trim() || '',
    city:
      (document.getElementById('billing-city') || {}).value?.trim() || '',
    state:
      (document.getElementById('billing-state') || {}).value?.trim() || '',
    postalCode:
      (document.getElementById('billing-postal') || {}).value?.trim() || '',
    country:
      (document.getElementById('billing-country') || {}).value?.trim() || ''
  };
  // Google Calendar
  const googleCalendarConfig = {
    calendarId:
      (document.getElementById('gcal-id') || {}).value?.trim() || '',
    serviceAccountKeyPath:
      (document.getElementById('gcal-key-path') || {}).value?.trim() || ''
  };

  return {
    xiLabs: xiConfig,
    twilio: twilioConfig,
    payment: paymentConfig,
    knowledgeBase: knowledgeBaseLinks || [],
    googleCalendar: googleCalendarConfig
  };
}

// ---- STATUS HELPERS ----
function setSectionStatus(section, text) {
  let elId = null;
  if (section === 'agent') elId = 'agent-save-status';
  if (section === 'phone') elId = 'phone-save-status';
  if (section === 'billing') elId = 'billing-save-status';
  if (section === 'kb') elId = 'kb-save-status';

  if (!elId) return;
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || '';
}

// ---- SAVE CONFIG (shared for all save buttons) ----
async function saveConfig(section) {
  const config = collectConfigFromUI();
  setSectionStatus(section, 'Saving...');
  const result = await window.api.saveConfig(config);
  if (result.ok) {
    setSectionStatus(section, 'Settings saved.');
    setTimeout(() => setSectionStatus(section, ''), 2500);
  } else {
    setSectionStatus(section, `Failed: ${result.error || 'Unknown error'}`);
  }

  if (result.ok) {
    setSectionStatus(section, "Settings saved.");
    const elIdMap = {
      agent: "agent-save-status",
      phone: "phone-save-status",
      billing: "billing-save-status",
      kb: "kb-save-status"
    };
    const el = document.getElementById(elIdMap[section]);
    if (el) {
      el.classList.remove("dirty");
      el.classList.add("saved");
    }
    setTimeout(() => setSectionStatus(section, ""), 2500);
  }

}

// ---- SAVE BUTTONS ----

// Agent Settings save
const btnSaveAgent = document.getElementById('btn-save-agent');
if (btnSaveAgent) {
  btnSaveAgent.addEventListener('click', () => saveConfig('agent'));
}

// Phone / Twilio section save (you should add a button with id="btn-save-phone")
const btnSavePhone = document.getElementById('btn-save-phone');
if (btnSavePhone) {
  btnSavePhone.addEventListener('click', () => saveConfig('phone'));
}

// Billing section save (you should add a button with id="btn-save-billing")
const btnSaveBilling = document.getElementById('btn-save-billing');
if (btnSaveBilling) {
  btnSaveBilling.addEventListener('click', () => saveConfig('billing'));
}

// Knowledge base explicit save button (optional, id="btn-save-kb")
const btnSaveKb = document.getElementById('btn-save-kb');
if (btnSaveKb) {
  btnSaveKb.addEventListener('click', () => saveConfig('kb'));
}

// Placeholder: Test Voice button
const btnTestVoice = document.getElementById('btn-test-voice');
if (btnTestVoice) {
  btnTestVoice.addEventListener('click', () => {
    alert(
      'Test Voice is a placeholder.\nWire this to TTS using your API key to play a sample.'
    );
  });
}

// ---- PHONE METRICS (instead of “Place a call”) ----
function updatePhoneMetrics(history) {
  const callsEl = document.getElementById('metric-total-calls');
  const minsEl = document.getElementById('metric-total-min-saved');

  if (!callsEl && !minsEl) return;

  const totalCalls = Array.isArray(history) ? history.length : 0;
  let totalSeconds = 0;

  if (Array.isArray(history)) {
    history.forEach((entry) => {
      if (typeof entry.durationSeconds === 'number') {
        totalSeconds += entry.durationSeconds;
      }
    });
  }

  const totalMinutes = totalSeconds / 60;

  if (callsEl) callsEl.textContent = String(totalCalls);
  if (minsEl) minsEl.textContent = totalMinutes.toFixed(1);
}

// ---- (OPTIONAL) DIALER: START CALL ----
// If you actually leave a Call button in your UI, this will still work.
// If you remove the call UI entirely, this safely does nothing.
const btnStartCall = document.getElementById('btn-start-call');
if (btnStartCall) {
  btnStartCall.addEventListener('click', async () => {
    const toInput = document.getElementById('dialer-to-number');
    const statusEl = document.getElementById('dialer-status');

    const toNumber = toInput ? toInput.value.trim() : '';
    if (!toNumber) {
      if (statusEl) statusEl.textContent = 'Enter a destination number.';
      return;
    }

    if (statusEl) statusEl.textContent = 'Starting call...';
    logDialer(`Attempting call to ${toNumber}`);

    const result = await window.api.startCall({ toNumber });

    if (result.ok) {
      if (statusEl)
        statusEl.textContent = `Call initiated. SID: ${result.callSid}`;
      logDialer(`Call started successfully (SID ${result.callSid})`);
      await loadHistoryIntoUI();
    } else {
      if (statusEl) statusEl.textContent = `Error: ${result.error}`;
      logDialer(`Error: ${result.error}`);
    }
  });
}

// ---- HISTORY ----
// ---- HISTORY ----
const historyTableBody = document.getElementById('history-table-body');
const historyTranscriptEl = document.getElementById('history-transcript');
const historyAnalysisEl = document.getElementById('history-analysis');

// Modal elements for glassy popup
const historyModal = document.getElementById('history-modal');
const historyModalClose = document.getElementById('history-modal-close');
const historyModalAnalysis = document.getElementById('history-modal-analysis');
const historyStatusEl = document.getElementById('history-status');
const historyModalTranscript = document.getElementById('history-modal-transcript');

let currentHistory = [];
let selectedHistoryId = null;

// Close modal
if (historyModal && historyModalClose) {
  historyModalClose.addEventListener('click', () => {
    historyModal.classList.add('hidden');
    if (historyModalTranscript) historyModalTranscript.innerHTML = '';
    if (historyModalAnalysis) historyModalAnalysis.innerHTML = '';
  });
}


async function loadHistoryIntoUI() {
  const historyStatus = document.getElementById('history-status');
  historyStatus.textContent = 'Loading call history...';

  try {
    const res = await window.api.fetchConversations();

    if (!res.ok) {
      historyStatus.textContent = `Error: ${res.error}`;
      return;
    }

    const { conversations, metrics } = res;
    currentHistory = conversations || [];

    historyTableBody.innerHTML = '';

    conversations.forEach((entry) => {
      const tr = document.createElement('tr');
      tr.dataset.id = entry.conversationId;

      const timeTd = document.createElement('td');
      if (entry.startedAtUnix) {
        const date = new Date(entry.startedAtUnix * 1000);
        timeTd.textContent = date.toLocaleString();
      } else {
        timeTd.textContent = '-';
      }

      const dirTd = document.createElement('td');
      dirTd.textContent = entry.direction || '';

      const idTd = document.createElement('td');
      idTd.textContent = entry.conversationId;

      const durTd = document.createElement('td');
      durTd.textContent =
        entry.durationSeconds != null ? entry.durationSeconds : '';

      const costTd = document.createElement('td');
      costTd.textContent =
        entry.costMarkupUsd != null
          ? `$${entry.costMarkupUsd.toFixed(2)}`
          : '';

      const summaryTd = document.createElement('td');
      summaryTd.textContent = entry.summary || '';

      tr.appendChild(timeTd);
      tr.appendChild(dirTd);
      tr.appendChild(durTd);
      tr.appendChild(costTd);
      tr.appendChild(summaryTd);

      tr.addEventListener('click', () => {
        selectHistoryRow(entry.conversationId);
      });

      historyTableBody.appendChild(tr);
    });

    historyStatus.textContent = `Loaded ${conversations.length} conversation${
      conversations.length === 1 ? '' : 's'
    }.`;

    // Update metrics + charts
    updateUsageMetrics(metrics);
    renderUsageCharts(metrics);
  } catch (err) {
    console.error('Failed to load history', err);
    const historyStatus = document.getElementById('history-status');
    historyStatus.textContent = 'Failed to load history.';
  }
}

// Render transcript as chat-style bubbles
function buildChatTranscript(transcriptText, container) {
  if (!container) return;

  container.innerHTML = '';

  // Normalize to string in case transcriptText is an object/array
  const text =
    transcriptText == null
      ? ''
      : typeof transcriptText === 'string'
      ? transcriptText
      : JSON.stringify(transcriptText, null, 2);

  if (!text.trim()) {
    container.textContent = 'No transcript available for this call.';
    return;
  }

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  lines.forEach((line) => {
    // Skip header lines like "Conversation Transcript" or "Analysis"
    if (/^conversation transcript/i.test(line)) return;
    if (/^analysis\b/i.test(line)) return;

    // Default values
    let role = 'user';
    let time = '';
    let messageText = line;

    // Match: [agent @ 0s] Hello there
    const m = line.match(/^\[(agent|user)[^\]]*@\s*([0-9]+s?)\]\s*(.*)$/i);
    if (m) {
      role = m[1].toLowerCase();
      time = m[2];
      messageText = m[3];
    }

    if (!messageText) return;

    const lineEl = document.createElement('div');
    lineEl.classList.add('chat-line', role === 'agent' ? 'agent' : 'user');

    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble', role === 'agent' ? 'agent' : 'user');
    bubble.textContent = messageText;

    if (time) {
      const ts = document.createElement('div');
      ts.classList.add('chat-timestamp');
      ts.textContent = time;
      bubble.appendChild(ts);
    }

    lineEl.appendChild(bubble);
    container.appendChild(lineEl);
  });
}


// Render analysis panel (tries JSON first, then falls back to raw text)
function renderAnalysis(entry, container) {
  if (!container) return;
  container.innerHTML = '';

  let analysisObj = entry && entry.analysis ? entry.analysis : null;
  let rawAnalysisText = '';

  // If no separate analysis field, try to parse it out of the transcript block
  if (!analysisObj && typeof entry.transcript === 'string') {
    const idx = entry.transcript.indexOf('\nAnalysis');
    if (idx !== -1) {
      const analysisBlock = entry.transcript.slice(idx);
      rawAnalysisText = analysisBlock.replace(/^Analysis\s*/i, '').trim();

      const firstBrace = analysisBlock.indexOf('{');
      if (firstBrace !== -1) {
        const jsonCandidate = analysisBlock.slice(firstBrace).trim();
        try {
          analysisObj = JSON.parse(jsonCandidate);
        } catch (e) {
          // ignore JSON parse failure; we'll use raw text
        }
      }
    }
  }

  // If we have a JSON object, show key info
  if (analysisObj) {
    const title = document.createElement('h4');
    title.textContent =
      analysisObj.call_summary_title || 'Call Summary';
    container.appendChild(title);

    if (analysisObj.transcript_summary) {
      const summaryP = document.createElement('p');
      summaryP.textContent = analysisObj.transcript_summary;
      container.appendChild(summaryP);
    }

    if (analysisObj.call_successful) {
      const outcomeP = document.createElement('p');
      outcomeP.textContent = `Outcome: ${analysisObj.call_successful}`;
      container.appendChild(outcomeP);
    }
  } else if (rawAnalysisText) {
    // Fallback: raw text under "Analysis"
    const p = document.createElement('p');
    p.textContent = rawAnalysisText;
    container.appendChild(p);
  } else {
    container.textContent = '(No analysis available for this call.)';
  }
}

// ---- TRANSCRIPT RENDERING (CHAT STYLE, SAFE NORMALIZATION) ----
function renderTranscriptHtml(transcriptText) {
  // Normalize transcript into an array of { role, text } messages
  let messages = [];

  if (Array.isArray(transcriptText)) {
    // ElevenLabs-style: [{ role, time_in_call_secs, message }, ...]
    messages = transcriptText
      .filter((m) => m && (m.message || m.text))
      .map((m) => {
        const role = (m.role || 'user').toLowerCase();
        const t =
          m.time_in_call_secs != null
            ? `${m.time_in_call_secs}s`
            : '';
        const body = m.message || m.text || '';

        let label = body;
        if (t) {
          label = `[${role} @ ${t}] ${body}`;
        } else {
          label = `[${role}] ${body}`;
        }

        return { role, text: label };
      });
  } else if (typeof transcriptText === 'string') {
    // Preformatted big string → split into lines
    const lines = transcriptText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    messages = lines.map((line) => {
      const lower = line.toLowerCase();
      let role = 'user';
      if (lower.startsWith('[agent')) role = 'agent';
      else if (lower.startsWith('[user')) role = 'user';
      return { role, text: line };
    });
  } else if (transcriptText && typeof transcriptText === 'object') {
    // Some object shape → try .text, else JSON
    const raw =
      typeof transcriptText.text === 'string'
        ? transcriptText.text
        : JSON.stringify(transcriptText, null, 2);

    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    messages = lines.map((line) => ({
      role: 'user',
      text: line
    }));
  } else {
    // Nothing usable
    return '<div class="transcript-empty">No transcript available.</div>';
  }

  if (!messages.length) {
    return '<div class="transcript-empty">No transcript available.</div>';
  }

  // Build bubbles
  return messages
    .map((msg) => {
      const safe = escapeHtml(msg.text || '');
      const role = msg.role === 'agent' ? 'agent' : 'user';

      // agent → right in blue, user → left in purple
      const isAgent = role === 'agent';

      const rowClass = isAgent
        ? 'chat-row align-right'
        : 'chat-row align-left';

      const bubbleClass = isAgent
        ? 'chat-bubble bubble-agent'
        : 'chat-bubble bubble-user';

      return `
        <div class="${rowClass}">
          <div class="${bubbleClass}">
            ${safe}
          </div>
        </div>
      `
       
    })
    .join('');
}



async function selectHistoryRow(conversationId) {
  if (!conversationId || !window.api || !window.api.fetchConversationDetail) {
    return;
  }

  if (historyTranscriptEl) {
    historyTranscriptEl.innerHTML = '<div class="transcript-empty">Loading transcript…</div>';
  }
  if (historyAnalysisEl) {
    historyAnalysisEl.textContent = 'Loading analysis…';
  }

  try {
    const result = await window.api.fetchConversationDetail(conversationId);
    if (!result || !result.ok) {
      const msg = result && result.error ? result.error : 'Unable to load conversation.';
      if (historyTranscriptEl) historyTranscriptEl.textContent = msg;
      if (historyAnalysisEl) historyAnalysisEl.textContent = '';
      return;
    }

    const { transcript, analysis } = result.conversation;

    // Analysis
    if (historyAnalysisEl) {
      if (analysis && analysis.transcript_summary) {
        historyAnalysisEl.textContent = analysis.transcript_summary;
      } else if (analysis) {
        historyAnalysisEl.textContent = JSON.stringify(analysis, null, 2);
      } else {
        historyAnalysisEl.textContent = 'No analysis available.';
      }
    }

    // Transcript as chat bubbles
    if (historyTranscriptEl) {
      historyTranscriptEl.innerHTML = renderTranscriptHtml(transcript || []);
    }
  } catch (err) {
    console.error('selectHistoryRow error', err);
    if (historyTranscriptEl) {
      historyTranscriptEl.textContent = 'Error loading transcript.';
    }
    if (historyAnalysisEl) {
      historyAnalysisEl.textContent = '';
    }
  }
}

const loadConfigBtn = document.getElementById('btn-load-config');

if (loadConfigBtn) {
  loadConfigBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('agent-save-status');
    statusEl.textContent = 'Loading config from file...';

    const result = await window.api.loadConfigFromFile();

    if (result.ok) {
      statusEl.textContent = 'Config loaded.';
      // Refresh the UI with the newly loaded config
      await loadConfigIntoUI();
    } else {
      statusEl.textContent = `Failed to load: ${result.error || 'Unknown error'}`;
    }

    setTimeout(() => {
      statusEl.textContent = '';
    }, 3000);
  });
}


function updateUsageMetrics(metrics) {
  if (!metrics) return;
  const totalCallsEl = document.getElementById('metric-total-calls');
  const totalMinSavedEl = document.getElementById('metric-total-min-saved');

  if (totalCallsEl) {
    totalCallsEl.textContent = metrics.totalCalls.toString();
  }

  if (totalMinSavedEl) {
    // You mentioned adding 25¢ per minute markup; "minutes saved"
    // can just be totalMinutes for now or your own heuristic.
    totalMinSavedEl.textContent = metrics.totalMinutes.toFixed(1);
  }
}

function renderUsageCharts(metrics) {
  if (!metrics || !metrics.byDay) return;

  const labels = metrics.byDay.map((d) => d.date);
  const callCounts = metrics.byDay.map((d) => d.callCount);
  const minutes = metrics.byDay.map((d) => +d.minutes.toFixed(2));

  // Calls chart in Calls section
  const callsCanvas = document.getElementById('calls-chart');
  if (callsCanvas) {
    const ctx = callsCanvas.getContext('2d');
    if (callsChart) callsChart.destroy();

    callsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Calls',
            data: callCounts,
            tension: 0.3
          },
          {
            label: 'Minutes',
            data: minutes,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: { title: { display: true, text: 'Date' } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  // Minutes chart in Billing section
  const billingCanvas = document.getElementById('billing-chart');
  if (billingCanvas) {
    const ctx2 = billingCanvas.getContext('2d');
    if (billingChart) billingChart.destroy();

    billingChart = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Minutes per day',
            data: minutes
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: { title: { display: true, text: 'Date' } },
          y: { beginAtZero: true }
        }
      }
    });
  }
}

const btnRefreshHistory = document.getElementById('btn-refresh-history');
if (btnRefreshHistory) {
  btnRefreshHistory.addEventListener('click', loadHistoryIntoUI);
}



function markSectionDirty(section) {
  let elId = null;
  if (section === "agent") elId = "agent-save-status";
  if (section === "phone") elId = "phone-save-status";
  if (section === "billing") elId = "billing-save-status";
  if (section === "kb") elId = "kb-save-status";

  if (!elId) return;
  const el = document.getElementById(elId);
  if (!el) return;

  el.classList.add("dirty");
  el.classList.remove("saved");
  if (!el.textContent) {
    el.textContent = "Unsaved changes";
  }
}

const kbUrlInput = document.getElementById('kb-url-input');
const kbNameInput = document.getElementById('kb-name-input');
const kbAddBtn = document.getElementById('kb-add-btn');
const kbListEl = document.getElementById('kb-list');
const kbStatusEl = document.getElementById('kb-status');

if (kbAddBtn) {
  kbAddBtn.addEventListener('click', async () => {
    const url = kbUrlInput.value.trim();
    const name = kbNameInput.value.trim();

    if (!url) {
      kbStatusEl.textContent = 'Please enter a URL.';
      return;
    }

    kbStatusEl.textContent = 'Adding link to knowledge base...';

    const res = await window.api.addKnowledgeUrl({ url, name });
    if (!res.ok) {
      kbStatusEl.textContent = `Error: ${res.error}`;
      return;
    }

    kbStatusEl.textContent = 'Added to knowledge base.';

    const li = document.createElement('li');
    li.textContent = `${res.document.name} (${url})`;
    kbListEl.appendChild(li);

    kbUrlInput.value = '';
    kbNameInput.value = '';

    setTimeout(() => {
      kbStatusEl.textContent = '';
    }, 2500);
  });
}


// Example: mark agent section dirty on any input/textarea/select change
document.addEventListener("input", (e) => {
  const target = e.target;
  if (!target.closest) return;

  if (target.closest("#view-agent-settings")) {
    markSectionDirty("agent");
  } else if (target.closest("#view-dialer")) {
    markSectionDirty("phone");
  } else if (target.closest("#view-billing")) {
    markSectionDirty("billing");
  } else if (target.closest("#view-knowledge")) {
    markSectionDirty("kb");
  }
});

// ---- UPDATE CHECK (electron-updater backend) ----
async function runUpdateCheck() {
  const overlay = document.getElementById('update-overlay');
  const textEl = document.getElementById('update-overlay-text');

  // If UI or API isn't wired, just bail silently
  if (!overlay || !textEl || !window.api) return;

  const checkUpdatesFn = window.api.checkUpdates || window.api.checkForUpdates;
  if (!checkUpdatesFn) return;

  const showOverlay = () => {
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
  };

  const hideOverlay = () => {
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
  };

  showOverlay();
  textEl.textContent = 'Checking for updates…';

  try {
    const res = await checkUpdatesFn();

    if (!res || !res.ok) {
      const msg = (res && res.error) || 'Unknown error';
      textEl.textContent = `Update check failed: ${msg}`;
      setTimeout(hideOverlay, 2000);
      return;
    }

    if (res.status === 'downloading') {
      textEl.textContent = `Downloading version ${res.info?.version || ''}…`;
      setTimeout(hideOverlay, 2000);
    } else if (res.status === 'none') {
      textEl.textContent = 'You are on the latest version.';
      setTimeout(hideOverlay, 1500);
    } else if (res.dev) {
      textEl.textContent = 'Dev mode – updates disabled.';
      setTimeout(hideOverlay, 1500);
    } else {
      // any other status → just hide
      hideOverlay();
    }
  } catch (err) {
    console.error('Update check error', err);
    textEl.textContent = `Update check failed: ${err.message || err}`;
    setTimeout(hideOverlay, 2000);
  }
}



// ---- APPOINTMENTS / GOOGLE CALENDAR ----
const appointmentsCalendarEl = document.getElementById('appointments-calendar');
const appointmentsStatusEl = document.getElementById('appointments-status'); // optional if you add one

async function loadAppointments() {
  if (!appointmentsCalendarEl || !window.api || !window.api.listAppointments) {
    return;
  }

  appointmentsCalendarEl.innerHTML = '<div class="calendar-loading">Loading appointments…</div>';

  try {
    const result = await window.api.listAppointments();
    if (!result || !result.ok) {
      appointmentsCalendarEl.innerHTML = `<div class="calendar-error">${
        result?.error || 'Failed to load appointments.'
      }</div>`;
      return;
    }

    renderAppointments(result.events || []);
  } catch (err) {
    console.error('loadAppointments error', err);
    appointmentsCalendarEl.innerHTML =
      '<div class="calendar-error">Error loading appointments.</div>';
  }
}

// Simple HTML escape helper for calendar fields
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function renderAppointments(events) {
  appointmentsCalendarEl.innerHTML = '';

  if (!events.length) {
    appointmentsCalendarEl.innerHTML =
      '<div class="calendar-empty">No upcoming appointments.</div>';
    return;
  }

  events.forEach((evt) => {
    const card = document.createElement('div');
    card.className = 'calendar-event';

    const start = evt.start ? new Date(evt.start) : null;
    const end = evt.end ? new Date(evt.end) : null;

    const dateStr = start
      ? start.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        })
      : '';

    const timeStr = start
      ? start.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit'
        })
      : '';

    card.innerHTML = `
      <div class="calendar-event-date">
        <div class="calendar-event-day">${dateStr}</div>
        <div class="calendar-event-time">${timeStr}</div>
      </div>
      <div class="calendar-event-main">
        <div class="calendar-event-title">${escapeHtml(evt.summary || '(no title)')}</div>
        ${
          evt.location
            ? `<div class="calendar-event-location">${escapeHtml(evt.location)}</div>`
            : ''
        }
        ${
          evt.description
            ? `<div class="calendar-event-description">${escapeHtml(
                evt.description
              )}</div>`
            : ''
        }
      </div>
    `;

    appointmentsCalendarEl.appendChild(card);
  });
}



// Initial load: check updates, then load config + history
(async () => {
  const refreshAppointmentsBtn = document.getElementById(
    'btn-refresh-appointments'
  );
  if (refreshAppointmentsBtn) {
    refreshAppointmentsBtn.addEventListener('click', loadAppointments);
  }

  // Show version in UI / console
  if (window.api && window.api.getVersion) {
    const v = await window.api.getVersion();
    console.log('[SmartVoiceX] renderer version:', v);
    const badge = document.getElementById('app-version');
    if (badge) badge.textContent = v;
  }

  // Optionally preload on startup
  loadAppointments();

  await runUpdateCheck();
  await loadConfigIntoUI();
  await loadHistoryIntoUI();
})();
