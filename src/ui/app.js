/**
 * Orium Web UI - Client Application
 */

// ── State ──
const state = {
  ws: null,
  connected: false,
  messages: [],
  currentAdapter: null,
  currentModel: null,
  settings: {
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 4096,
    wsUrl: 'ws://localhost:3001',
  },
  adapters: [],
  skills: [],
  isTyping: false,
};

// ── DOM Elements ──
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  initEventListeners();
  loadSettings();
});

// ── WebSocket ──
function initWebSocket() {
  const wsUrl = state.settings.wsUrl;

  try {
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      state.connected = true;
      updateConnectionStatus(true);
      // Initialize with default adapter
      sendWS({ type: 'init', adapter: state.currentAdapter, model: state.currentModel });
    };

    state.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleWSMessage(msg);
    };

    state.ws.onclose = () => {
      state.connected = false;
      updateConnectionStatus(false);
      // Reconnect after 3s
      setTimeout(initWebSocket, 3000);
    };

    state.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  } catch (err) {
    console.error('Failed to connect:', err);
    updateConnectionStatus(false);
  }
}

function sendWS(data) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(data));
  }
}

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'connected':
      console.log('Connected:', msg.clientId);
      break;

    case 'initialized':
      state.currentAdapter = msg.adapter;
      state.currentModel = msg.model;
      updateModelList();
      if (msg.skills) {
        msg.skills.forEach((name) => {
          const skill = state.skills.find((s) => s.name === name);
          if (skill) skill.active = true;
        });
        updateSkillList();
      }
      break;

    case 'response':
      addMessage('assistant', msg.content, msg.id, msg.model);
      state.isTyping = false;
      hideTyping();
      break;

    case 'stream_start':
      state.isTyping = true;
      showTyping();
      break;

    case 'stream_chunk':
      appendStreamChunk(msg.chunk);
      break;

    case 'stream_end':
      state.isTyping = false;
      hideTyping();
      finalizeStream(msg.content);
      break;

    case 'tool_call':
      showToolCall(msg.tool, msg.arguments);
      break;

    case 'tool_result':
      showToolResult(msg.tool, msg.result);
      break;

    case 'error':
      showError(msg.error);
      state.isTyping = false;
      hideTyping();
      break;

    case 'history':
      loadHistory(msg.messages);
      break;

    case 'cleared':
      clearMessages();
      break;

    case 'adapter_switched':
      state.currentAdapter = msg.adapter;
      state.currentModel = msg.model;
      updateModelList();
      showSystemMessage(`Switched to ${msg.adapter}${msg.model ? ` (${msg.model})` : ''}`);
      break;

    default:
      console.log('Unknown message:', msg);
  }
}

// ── Event Listeners ──
function initEventListeners() {
  // Send message
  $('sendBtn').addEventListener('click', sendMessage);
  $('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  $('messageInput').addEventListener('input', autoResize);

  // New chat
  $('newChatBtn').addEventListener('click', () => {
    clearMessages();
    sendWS({ type: 'clear' });
  });

  // Clear chat
  $('clearBtn').addEventListener('click', () => {
    clearMessages();
    sendWS({ type: 'clear' });
  });

  // Sidebar toggle (mobile)
  $('sidebarToggle').addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
  });

  // Settings
  $('settingsBtn').addEventListener('click', () => {
    $('settingsModal').classList.add('show');
  });
  $('closeSettings').addEventListener('click', () => {
    $('settingsModal').classList.remove('show');
  });
  $('saveSettings').addEventListener('click', saveSettings);

  // Temperature slider
  $('temperature').addEventListener('input', (e) => {
    $('tempValue').textContent = e.target.value;
  });

  // Quick action buttons
  $$('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      $('messageInput').value = prompt;
      sendMessage();
      hideWelcome();
    });
  });

  // Image upload
  $('imageBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', handleFileUpload);

  // Skill panel
  $('skillBtn').addEventListener('click', () => {
    $('skillPanel').classList.add('open');
    loadSkills();
  });
  $('closeSkillPanel').addEventListener('click', () => {
    $('skillPanel').classList.remove('open');
  });

  // Export
  $('exportBtn').addEventListener('click', exportChat);

  // Close modal on backdrop click
  $('settingsModal').addEventListener('click', (e) => {
    if (e.target === $('settingsModal')) {
      $('settingsModal').classList.remove('show');
    }
  });
}

// ── Message Handling ──
function sendMessage() {
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text || state.isTyping) return;

  // Check for commands
  if (text.startsWith('/')) {
    handleCommand(text);
    input.value = '';
    autoResize();
    return;
  }

  hideWelcome();
  addMessage('user', text);
  input.value = '';
  autoResize();

  state.isTyping = true;
  showTyping();

  sendWS({ type: 'message', content: text });
}

function handleCommand(text) {
  const parts = text.slice(1).split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);

  switch (cmd) {
    case 'model':
      if (args[0]) {
        sendWS({ type: 'switch_adapter', adapter: args[0], model: args[1] });
      }
      break;
    case 'system':
      state.settings.systemPrompt = args.join(' ');
      sendWS({ type: 'init', systemPrompt: state.settings.systemPrompt });
      showSystemMessage('System prompt updated');
      break;
    case 'clear':
      clearMessages();
      sendWS({ type: 'clear' });
      break;
    case 'help':
      showSystemMessage('Commands: /model <adapter>, /system <prompt>, /clear, /help');
      break;
    default:
      showSystemMessage(`Unknown command: /${cmd}`);
  }
}

let currentStreamMessage = null;

function addMessage(role, content, id = null, model = null) {
  const area = $('messagesArea');
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;
  msgEl.dataset.id = id || `msg-${Date.now()}`;

  const avatar = role === 'user' ? '👤' : role === 'assistant' ? '◈' : '⚙️';
  const name = role === 'user' ? 'You' : role === 'assistant' ? 'Orium' : 'System';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const html = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-name">${name}</span>
        <span class="message-time">${time}${model ? ` · ${model}` : ''}</span>
      </div>
      <div class="message-body">${renderContent(content)}</div>
    </div>
  `;

  msgEl.innerHTML = html;
  area.appendChild(msgEl);
  scrollToBottom();

  // Highlight code
  msgEl.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });

  state.messages.push({ role, content, id, model });
  currentStreamMessage = msgEl;
  return msgEl;
}

function renderContent(content) {
  if (!content) return '';
  // Use marked for markdown
  return marked.parse(content, { breaks: true });
}

function appendStreamChunk(chunk) {
  if (!currentStreamMessage) {
    hideWelcome();
    currentStreamMessage = addMessage('assistant', '');
  }
  const body = currentStreamMessage.querySelector('.message-body');
  const currentText = body.textContent || '';
  body.innerHTML = renderContent(currentText + chunk);
  scrollToBottom();
}

function finalizeStream(content) {
  if (currentStreamMessage) {
    const body = currentStreamMessage.querySelector('.message-body');
    body.innerHTML = renderContent(content);
    body.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
  currentStreamMessage = null;
}

function showSystemMessage(text) {
  addMessage('system', text);
}

function showError(error) {
  addMessage('system', `Error: ${error}`);
}

function showToolCall(tool, args) {
  const area = $('messagesArea');
  const el = document.createElement('div');
  el.className = 'tool-call';
  el.innerHTML = `
    <div class="tool-call-header">🛠️ ${tool}</div>
    <div style="color: var(--text-muted); margin-top: 4px;">${JSON.stringify(args)}</div>
  `;
  area.appendChild(el);
  scrollToBottom();
}

function showToolResult(tool, result) {
  const area = $('messagesArea');
  const el = document.createElement('div');
  el.className = 'tool-result';
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  el.innerHTML = `<strong>${tool}:</strong> ${resultStr.slice(0, 500)}${resultStr.length > 500 ? '...' : ''}`;
  area.appendChild(el);
  scrollToBottom();
}

function clearMessages() {
  $('messagesArea').innerHTML = '';
  state.messages = [];
  showWelcome();
}

function showTyping() {
  $('typingIndicator').style.display = 'flex';
  scrollToBottom();
}

function hideTyping() {
  $('typingIndicator').style.display = 'none';
}

function hideWelcome() {
  const welcome = $('welcomeScreen');
  if (welcome) welcome.style.display = 'none';
}

function showWelcome() {
  const welcome = $('welcomeScreen');
  if (welcome) welcome.style.display = 'flex';
}

function scrollToBottom() {
  const area = $('messagesArea');
  area.scrollTop = area.scrollHeight;
}

function autoResize() {
  const textarea = $('messageInput');
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

// ── File Upload ──
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target.result;
      hideWelcome();
      addMessage('user', `[Image: ${file.name}]`);

      // Show image preview in message
      const msgs = $$('.message.user');
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) {
        const body = lastMsg.querySelector('.message-body');
        body.innerHTML += `<img src="${imageUrl}" class="message-image" onclick="previewImage('${imageUrl}')">`;
      }

      state.isTyping = true;
      showTyping();
      sendWS({ type: 'message', content: 'Describe this image.', imageUrl });
    };
    reader.readAsDataURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      hideWelcome();
      addMessage('user', `[File: ${file.name}]`);
      sendWS({ type: 'message', content: `File content:\n\n${content}` });
    };
    reader.readAsText(file);
  }

  e.target.value = '';
}

// ── Model & Skill Lists ──
function updateModelList() {
  const list = $('modelList');
  list.innerHTML = state.adapters.map((a) => `
    <div class="model-item ${a.name === state.currentAdapter ? 'active' : ''}" data-name="${a.name}">
      ${a.name}
    </div>
  `).join('');

  $$('.model-item').forEach((item) => {
    item.addEventListener('click', () => {
      sendWS({ type: 'switch_adapter', adapter: item.dataset.name });
    });
  });
}

function updateSkillList() {
  const list = $('skillList');
  list.innerHTML = state.skills.map((s) => `
    <div class="skill-item" data-name="${s.name}">
      <span>${s.name}</span>
      <div class="skill-toggle ${s.active ? 'on' : ''}" data-name="${s.name}"></div>
    </div>
  `).join('');

  $$('.skill-toggle').forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = toggle.dataset.name;
      const skill = state.skills.find((s) => s.name === name);
      if (skill) {
        skill.active = !skill.active;
        toggle.classList.toggle('on');
        // TODO: Send skill toggle to server
      }
    });
  });
}

function loadSkills() {
  // Fetch skills from HTTP API
  fetch('http://localhost:3000/v1/skills')
    .then((res) => res.json())
    .then((data) => {
      state.skills = data.skills || [];
      updateSkillPanel();
    })
    .catch((err) => console.error('Failed to load skills:', err));
}

function updateSkillPanel() {
  const body = $('skillPanelBody');
  body.innerHTML = state.skills.map((s) => `
    <div class="skill-item" style="margin-bottom: 12px; padding: 12px; background: var(--bg-primary); border-radius: var(--radius-sm);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <strong>${s.name}</strong>
        <span style="color: ${s.active ? 'var(--accent)' : 'var(--text-muted)'};">${s.active ? '● On' : '○ Off'}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary);">${s.description}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Category: ${s.category}</div>
    </div>
  `).join('');
}

// ── Settings ──
function loadSettings() {
  const saved = localStorage.getItem('orium_settings');
  if (saved) {
    state.settings = { ...state.settings, ...JSON.parse(saved) };
  }

  $('systemPrompt').value = state.settings.systemPrompt;
  $('temperature').value = state.settings.temperature;
  $('tempValue').textContent = state.settings.temperature;
  $('maxTokens').value = state.settings.maxTokens;
  $('wsUrl').value = state.settings.wsUrl;
}

function saveSettings() {
  state.settings.systemPrompt = $('systemPrompt').value;
  state.settings.temperature = parseFloat($('temperature').value);
  state.settings.maxTokens = parseInt($('maxTokens').value, 10);
  state.settings.wsUrl = $('wsUrl').value;

  localStorage.setItem('orium_settings', JSON.stringify(state.settings));
  $('settingsModal').classList.remove('show');

  // Reconnect with new settings
  if (state.ws) state.ws.close();
  initWebSocket();
}

// ── Utils ──
function updateConnectionStatus(connected) {
  const status = $('connectionStatus');
  status.className = 'connection-status' + (connected ? '' : ' disconnected');
  status.textContent = connected ? '●' : '●';
  status.title = connected ? 'Connected' : 'Disconnected';
}

function exportChat() {
  const data = {
    title: $('headerTitle').textContent,
    timestamp: new Date().toISOString(),
    messages: state.messages,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orium-chat-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function previewImage(url) {
  const modal = document.createElement('div');
  modal.className = 'image-preview-modal show';
  modal.innerHTML = `<img src="${url}" alt="Preview">`;
  modal.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

function loadHistory(messages) {
  clearMessages();
  messages.forEach((m) => {
    addMessage(m.role, m.content, m.id, m.model);
  });
}

// ── Fetch Adapters ──
function fetchAdapters() {
  fetch('http://localhost:3000/v1/adapters')
    .then((res) => res.json())
    .then((data) => {
      state.adapters = data.adapters || [];
      updateModelList();
    })
    .catch((err) => console.error('Failed to fetch adapters:', err));
}

// Load adapters on init
setTimeout(fetchAdapters, 1000);
