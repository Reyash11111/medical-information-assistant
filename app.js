
const API_BASE = ""; 
let sessionId        = null;
let isLoading        = false;
let documentList     = [];

/* ── DOM refs ─────────────────────────────────────────────── */
const messagesContainer = document.getElementById("messagesContainer");
const chatMessages      = document.getElementById("chatMessages");
const welcomeScreen     = document.getElementById("welcomeScreen");
const questionInput     = document.getElementById("questionInput");
const sendBtn           = document.getElementById("sendBtn");
const fileInput         = document.getElementById("fileInput");
const uploadZone        = document.getElementById("uploadZone");
const uploadProgress    = document.getElementById("uploadProgress");
const progressFill      = document.getElementById("progressFill");
const progressLabel     = document.getElementById("progressLabel");
const docList           = document.getElementById("docList");
const docStats          = document.getElementById("docStats");
const statusDot         = document.getElementById("statusDot");
const statusText        = document.getElementById("statusText");
const sidebarToggle     = document.getElementById("sidebarToggle");
const sidebar           = document.getElementById("sidebar");
const newChatBtn        = document.getElementById("newChatBtn");

async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (res.ok) {
      const data = await res.json();
      statusDot.className = "status-dot online";
      statusText.textContent = `Online · ${data.documents_loaded} doc chunks indexed`;
    } else {
      throw new Error();
    }
  } catch {
    statusDot.className = "status-dot error";
    statusText.textContent = "Backend offline – start the server";
  }
}

/* ── Fetch documents ──────────────────────────────────────── */
async function loadDocuments() {
  try {
    const res  = await fetch(`${API_BASE}/documents`);
    const data = await res.json();
    documentList = data.documents || [];
    renderDocList();
  } catch {
    // silent
  }
}

function renderDocList() {
  if (documentList.length === 0) {
    docList.innerHTML = `
      <div class="doc-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 9h6m-6 4h6m-3 4h.01M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-2-2H8L6 6H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>
        </svg>
        <p>No documents yet.<br/>Upload a PDF to start.</p>
      </div>`;
    docStats.textContent = "";
    return;
  }

  docList.innerHTML = documentList.map(name => `
    <div class="doc-item" id="doc-${CSS.escape(name)}">
      <div class="doc-icon">PDF</div>
      <div class="doc-info">
        <div class="doc-name" title="${name}">${name}</div>
        <div class="doc-meta">Indexed</div>
      </div>
      <button class="doc-delete" onclick="deleteDocument('${name}')" aria-label="Remove ${name}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/>
        </svg>
      </button>
    </div>`).join("");

  docStats.textContent = `${documentList.length} document${documentList.length > 1 ? "s" : ""} in knowledge base`;
}

/* ── Upload ───────────────────────────────────────────────── */
fileInput.addEventListener("change", handleFiles);

uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.style.borderColor = "var(--accent-teal)"; });
uploadZone.addEventListener("dragleave", () => { uploadZone.style.borderColor = ""; });
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.style.borderColor = "";
  handleFiles({ target: { files: e.dataTransfer.files } });
});

async function handleFiles(e) {
  const files = Array.from(e.target.files || []).filter(f => f.name.endsWith(".pdf"));
  if (!files.length) { showToast("Please select PDF files only.", "error"); return; }

  for (const file of files) {
    await uploadFile(file);
  }
  fileInput.value = "";
}

async function uploadFile(file) {
  uploadProgress.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressLabel.textContent = `Uploading ${file.name}…`;

  // Pseudo-progress animation
  let prog = 0;
  const interval = setInterval(() => {
    if (prog < 80) { prog += 4; progressFill.style.width = prog + "%"; }
  }, 120);

  try {
    const form = new FormData();
    form.append("file", file);

    const res  = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
    clearInterval(interval);

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Upload failed");
    }

    const data = await res.json();
    progressFill.style.width = "100%";
    progressLabel.textContent = `✓ ${data.filename} – ${data.chunks} chunks indexed`;

    setTimeout(() => uploadProgress.classList.add("hidden"), 2500);

    documentList.push(data.filename);
    renderDocList();
    showToast(`"${data.filename}" added to knowledge base`, "success");
    await checkHealth();

  } catch (err) {
    clearInterval(interval);
    progressLabel.textContent = `✗ ${err.message}`;
    progressFill.style.background = "#ff6b8a";
    setTimeout(() => {
      uploadProgress.classList.add("hidden");
      progressFill.style.background = "";
    }, 3000);
    showToast(err.message, "error");
  }
}

/* ── Delete document ──────────────────────────────────────── */
async function deleteDocument(name) {
  if (!confirm(`Remove "${name}" from the knowledge base?`)) return;
  try {
    await fetch(`${API_BASE}/documents/${encodeURIComponent(name)}`, { method: "DELETE" });
    documentList = documentList.filter(d => d !== name);
    renderDocList();
    showToast(`"${name}" removed.`, "info");
    await checkHealth();
  } catch {
    showToast("Could not remove document.", "error");
  }
}

/* ── Chat ─────────────────────────────────────────────────── */
sendBtn.addEventListener("click", sendMessage);
questionInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Auto-resize textarea
questionInput.addEventListener("input", () => {
  questionInput.style.height = "auto";
  questionInput.style.height = Math.min(questionInput.scrollHeight, 160) + "px";
});

// Suggestion cards
document.querySelectorAll(".suggestion-card").forEach(btn => {
  btn.addEventListener("click", () => {
    questionInput.value = btn.dataset.q;
    questionInput.dispatchEvent(new Event("input"));
    sendMessage();
  });
});

function hideWelcome() {
  if (welcomeScreen.style.display !== "none") {
    welcomeScreen.style.opacity = "0";
    welcomeScreen.style.transition = "opacity 0.3s ease";
    setTimeout(() => { welcomeScreen.style.display = "none"; }, 300);
  }
}

async function sendMessage() {
  const q = questionInput.value.trim();
  if (!q || isLoading) return;

  hideWelcome();
  appendMessage("user", q);
  questionInput.value = "";
  questionInput.style.height = "auto";

  const typingId = appendTyping();
  isLoading = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, session_id: sessionId }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Something went wrong");
    }

    const data = await res.json();
    sessionId = data.session_id;
    removeTyping(typingId);
    appendMessage("assistant", data.answer, data.sources);

  } catch (err) {
    removeTyping(typingId);
    appendMessage("assistant", `⚠️ ${err.message}`, []);
    showToast(err.message, "error");
  } finally {
    isLoading  = false;
    sendBtn.disabled = false;
    questionInput.focus();
  }
}

function appendMessage(role, text, sources = []) {
  const id  = "msg-" + Date.now();
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const html = `
    <div class="message ${role}" id="${id}">
      <div class="msg-avatar">${role === "user" ? "You" : "🩺"}</div>
      <div class="msg-content">
        <div class="msg-bubble">${role === "user" ? escapeHtml(text) : formatMarkdown(text)}</div>
        ${sources.length ? `
        <div class="msg-sources">
          ${sources.map(s => `
            <span class="source-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
              ${escapeHtml(s)}
            </span>`).join("")}
        </div>` : ""}
        <div class="msg-time">${now}</div>
      </div>
    </div>`;

  chatMessages.insertAdjacentHTML("beforeend", html);
  scrollToBottom();
  return id;
}

function appendTyping() {
  const id = "typing-" + Date.now();
  const html = `
    <div class="message assistant" id="${id}">
      <div class="msg-avatar">🩺</div>
      <div class="msg-content">
        <div class="msg-bubble">
          <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>
      </div>
    </div>`;
  chatMessages.insertAdjacentHTML("beforeend", html);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function scrollToBottom() {
  messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: "smooth" });
}

/* ── New conversation ─────────────────────────────────────── */
newChatBtn.addEventListener("click", () => {
  sessionId = null;
  chatMessages.innerHTML = "";
  welcomeScreen.style.display = "";
  welcomeScreen.style.opacity  = "1";
});

/* ── Sidebar toggle ───────────────────────────────────────── */
sidebarToggle.addEventListener("click", () => {
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle("mobile-open");
  } else {
    sidebar.classList.toggle("collapsed");
  }
});

/* ── Helpers ─────────────────────────────────────────────── */
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMarkdown(text) {
  // Basic markdown → HTML (bold, italic, lists, line breaks)
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/^[-•] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^(.+)$/, "<p>$1</p>");
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${type === "success" ? "✓" : type === "error" ? "✗" : "ℹ"}
    ${escapeHtml(message)}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ── Init ─────────────────────────────────────────────────── */
(async function init() {
  await Promise.all([checkHealth(), loadDocuments()]);
  questionInput.focus();
})();
