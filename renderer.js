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

    navButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    views.forEach((v) => v.classList.remove('active-view'));
    document.getElementById(`view-${target}`).classList.add('active-view');
  });
});

// ---- SLIDER LABELS ----
// Talking speed
const speedSlider = document.getElementById('eleven-speed');
const speedValue = document.getElementById('eleven-speed-value');

// Latency (this used to be “stability”; same element id, different meaning)
const latencySlider = document.getElementById('eleven-stability');
const latencyValue = document.getElementById('eleven-stability-value');

// Similarity
const similaritySlider = document.getElementById('eleven-similarity');
const similarityValue = document.getElementById('eleven-similarity-value');

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

    const eleven = safeConfig.elevenLabs || {};
    const twilio = safeConfig.twilio || {};
    const payment = safeConfig.payment || {};
    knowledgeBaseLinks = safeConfig.knowledgeBase || [];

    // ElevenLabs
    const apiKeyEl = document.getElementById('eleven-api-key');
    const voiceEl = document.getElementById('eleven-voice');
    const promptEl = document.getElementById('eleven-system-prompt');
    const greetingEl = document.getElementById('eleven-greeting');

    if (apiKeyEl) apiKeyEl.value = eleven.apiKey || '';
    if (voiceEl) voiceEl.value = eleven.voiceId || '';
    if (promptEl) promptEl.value = eleven.systemPrompt || '';
    if (greetingEl) greetingEl.value = eleven.greeting || '';

    // Languages as checkboxes (multiple)
    const languageCheckboxes = document.querySelectorAll(
      'input[name="eleven-language"]'
    );
    if (languageCheckboxes.length > 0) {
      const selectedLanguages =
        eleven.languages ||
        (eleven.language ? [eleven.language] : []); // backwards compatible

      languageCheckboxes.forEach((cb) => {
        cb.checked = selectedLanguages.includes(cb.value);
      });
    }

    // Talking speed
    if (speedSlider) {
      const speedVal = eleven.speed != null ? eleven.speed : 1.0;
      speedSlider.value = speedVal;
      speedValue.textContent = `${Number(speedVal).toFixed(2)}x`;
    }

    // Latency (fallback to old “stability” if present)
    if (latencySlider) {
      const latencyVal =
        eleven.latency != null
          ? eleven.latency
          : eleven.stability != null
          ? eleven.stability
          : 3; // middle by default
      latencySlider.value = latencyVal;
      latencyValue.textContent = Number(latencyVal).toFixed(0);
    }

    // Similarity
    if (similaritySlider) {
      const simVal =
        eleven.similarityBoost != null ? eleven.similarityBoost : 0.75;
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
  // ElevenLabs: languages via checkboxes
  const languageCheckboxes = document.querySelectorAll(
    'input[name="eleven-language"]'
  );
  const languages = [];
  languageCheckboxes.forEach((cb) => {
    if (cb.checked) languages.push(cb.value);
  });

  const elevenConfig = {
    apiKey:
      (document.getElementById('eleven-api-key') || {}).value?.trim() || '',
    voiceId: (document.getElementById('eleven-voice') || {}).value || '',
    // first language if any, for older fields
    language: languages[0] || '',
    languages,
    systemPrompt:
      (document.getElementById('eleven-system-prompt') || {}).value?.trim() ||
      '',
    greeting:
      (document.getElementById('eleven-greeting') || {}).value?.trim() || '',
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

  return {
    elevenLabs: elevenConfig,
    twilio: twilioConfig,
    payment: paymentConfig,
    knowledgeBase: knowledgeBaseLinks || []
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
      'Test Voice is a placeholder.\nWire this to ElevenLabs TTS using your API key to play a sample.'
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
const historyTableBody = document.getElementById('history-table-body');
const historyTranscriptEl = document.getElementById('history-transcript');
let currentHistory = [];
let selectedHistoryId = null;

async function loadHistoryIntoUI() {
  const historyStatus = document.getElementById('history-status');
  if (historyStatus) historyStatus.textContent = 'Loading...';

  try {
    const history = await window.api.getHistory();
    currentHistory = history || [];

    if (historyTableBody) historyTableBody.innerHTML = '';

    if (Array.isArray(currentHistory) && historyTableBody) {
      currentHistory.forEach((entry) => {
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
    }

    if (historyStatus) {
      historyStatus.textContent = `Loaded ${currentHistory.length} entr${
        currentHistory.length === 1 ? 'y' : 'ies'
      }.`;
    }

    // Update phone metrics from history
    updatePhoneMetrics(currentHistory);
  } catch (err) {
    console.error('Failed to load history', err);
    if (historyStatus) historyStatus.textContent = 'Failed to load history.';
  }
}

function selectHistoryRow(id) {
  selectedHistoryId = id;

  if (historyTableBody) {
    Array.from(historyTableBody.children).forEach((row) => {
      row.classList.toggle('selected', row.dataset.id === id);
    });
  }

  const entry = currentHistory.find((e) => e.id === id);
  if (!historyTranscriptEl) return;

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

const btnRefreshHistory = document.getElementById('btn-refresh-history');
if (btnRefreshHistory) {
  btnRefreshHistory.addEventListener('click', loadHistoryIntoUI);
}

const btnClearHistory = document.getElementById('btn-clear-history');
if (btnClearHistory) {
  btnClearHistory.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all call history?')) return;
    const res = await window.api.clearHistory();
    const historyStatus = document.getElementById('history-status');
    if (res.ok) {
      if (historyStatus) historyStatus.textContent = 'History cleared.';
      await loadHistoryIntoUI();
      if (historyTranscriptEl) {
        historyTranscriptEl.textContent =
          'Select a call to view its transcript.';
      }
    } else {
      if (historyStatus)
        historyStatus.textContent = `Failed to clear: ${res.error}`;
    }
  });
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


// Initial load
loadConfigIntoUI().then(() => {
  loadHistoryIntoUI();
});
