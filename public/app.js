// J.A.R.V.I.S. – Oberfläche (Phase 1)
// Chats werden in Phase 1 lokal auf dem Gerät gespeichert (localStorage).
// Ab Phase 2 werden sie sicher im Benutzerkonto auf dem Server gespeichert.

const $ = (id) => document.getElementById(id);
const els = {
  sidebar: $("sidebar"), backdrop: $("backdrop"), chatList: $("chatList"), search: $("searchChats"),
  welcome: $("welcome"), messages: $("messages"), main: $("main"), reactor: $("reactor"),
  form: $("composer"), input: $("input"), send: $("sendBtn"), stop: $("stopBtn"), mic: $("micBtn"),
  toast: $("toast"),
};

const STORE_KEY = "jarvis.chats.v1";
let chats = loadChats();
let currentId = null;
let controller = null; // zum Stoppen einer laufenden Antwort

// ---------- Speicher ----------
function loadChats() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
function saveChats() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(chats)); }
  catch { toast("Chat konnte auf diesem Gerät nicht gespeichert werden."); }
}
const currentChat = () => chats.find((c) => c.id === currentId) || null;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

// ---------- Sicheres Markdown ----------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function inline(s) {
  // s ist bereits escaped
  return s
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
function renderMarkdown(src) {
  const parts = src.split(/```/);
  let html = "";
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const nl = part.indexOf("\n");
      const lang = nl > -1 ? part.slice(0, nl).trim() : "";
      const code = nl > -1 ? part.slice(nl + 1) : part;
      html += `<div class="codeblock"><div class="codeblock-head"><span>${escapeHtml(lang || "Code")}</span>` +
        `<button class="small-btn copy-code">Kopieren</button></div><pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre></div>`;
    } else {
      html += renderBlocks(part);
    }
  });
  return html;
}
function renderBlocks(text) {
  const lines = escapeHtml(text).split("\n");
  let out = "", list = null, para = [];
  const flushPara = () => { if (para.length) { out += `<p>${inline(para.join("<br>"))}</p>`; para = []; } };
  const flushList = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of lines) {
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); const n = m[1].length; out += `<h${n}>${inline(m[2])}</h${n}>`; continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { flushPara(); if (list !== "ul") { flushList(); out += "<ul>"; list = "ul"; } out += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== "ol") { flushList(); out += "<ol>"; list = "ol"; } out += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { flushPara(); flushList(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out;
}

// ---------- Darstellung ----------
function renderChatList() {
  const q = els.search.value.trim().toLowerCase();
  els.chatList.innerHTML = "";
  const list = [...chats]
    .sort((a, b) => b.updated - a.updated)
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)));
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "sidebar-note";
    li.textContent = q ? "Keine Treffer." : "Noch keine Chats.";
    els.chatList.append(li);
    return;
  }
  for (const c of list) {
    const li = document.createElement("li");
    li.className = "chat-item" + (c.id === currentId ? " active" : "");
    const title = document.createElement("button");
    title.className = "title"; title.textContent = c.title;
    title.onclick = () => { openChat(c.id); closeSidebar(); };
    const ren = document.createElement("button");
    ren.className = "icon-btn"; ren.textContent = "✎"; ren.setAttribute("aria-label", "Chat umbenennen");
    ren.onclick = () => renameChat(c.id);
    const del = document.createElement("button");
    del.className = "icon-btn"; del.textContent = "🗑"; del.setAttribute("aria-label", "Chat löschen");
    del.onclick = () => deleteChat(c.id);
    li.append(title, ren, del);
    els.chatList.append(li);
  }
}

function renderMessages() {
  const chat = currentChat();
  els.messages.innerHTML = "";
  const empty = !chat || chat.messages.length === 0;
  els.welcome.classList.toggle("hidden", !empty);
  if (empty) return;
  chat.messages.forEach((m, i) => els.messages.append(messageEl(m, i === chat.messages.length - 1)));
  scrollDown();
}

function messageEl(m, isLast) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${m.role}${m.error ? " error" : ""}`;
  if (m.role === "user") {
    const b = document.createElement("div");
    b.className = "bubble"; b.textContent = m.content;
    wrap.append(b);
    return wrap;
  }
  const icon = document.createElement("div"); icon.className = "mini-reactor";
  const content = document.createElement("div"); content.className = "content";
  const b = document.createElement("div"); b.className = "bubble";
  b.innerHTML = renderMarkdown(m.content);
  content.append(b);
  if (!m.error || isLast) content.append(actionsEl(m, isLast));
  wrap.append(icon, content);
  return wrap;
}

function actionsEl(m, isLast) {
  const bar = document.createElement("div"); bar.className = "actions";
  if (!m.error) {
    const copy = document.createElement("button");
    copy.className = "small-btn"; copy.textContent = "Kopieren";
    copy.onclick = () => copyText(m.content, copy);
    bar.append(copy);
  }
  if (isLast) {
    const regen = document.createElement("button");
    regen.className = "small-btn"; regen.textContent = "Neu generieren";
    regen.onclick = regenerate;
    bar.append(regen);
  }
  return bar;
}

function scrollDown() { els.main.scrollTop = els.main.scrollHeight; }

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const old = btn.textContent; btn.textContent = "Kopiert ✓"; setTimeout(() => (btn.textContent = old), 1500); }
  } catch { toast("Kopieren nicht möglich."); }
}

let toastTimer;
function toast(text) {
  els.toast.textContent = text; els.toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (els.toast.hidden = true), 3000);
}

// ---------- Chat-Verwaltung ----------
function newChat() {
  if (controller) return toast("Bitte warten Sie, bis die Antwort fertig ist, oder stoppen Sie sie.");
  currentId = null;
  renderMessages(); renderChatList(); closeSidebar();
  els.input.focus();
}
function openChat(id) {
  if (controller) return toast("Bitte stoppen Sie zuerst die laufende Antwort.");
  currentId = id; renderMessages(); renderChatList();
}
function renameChat(id) {
  const c = chats.find((x) => x.id === id); if (!c) return;
  const name = prompt("Neuer Name für den Chat:", c.title);
  if (name && name.trim()) { c.title = name.trim().slice(0, 80); saveChats(); renderChatList(); }
}
function deleteChat(id) {
  if (controller && id === currentId) return toast("Bitte stoppen Sie zuerst die laufende Antwort.");
  if (!confirm("Diesen Chat wirklich löschen?")) return;
  chats = chats.filter((c) => c.id !== id);
  if (currentId === id) currentId = null;
  saveChats(); renderChatList(); renderMessages();
}

// ---------- Senden & Empfangen ----------
async function send(text) {
  text = text.trim();
  if (!text || controller) return;
  let chat = currentChat();
  if (!chat) {
    chat = { id: newId(), title: text.slice(0, 40) + (text.length > 40 ? "…" : ""), messages: [], updated: Date.now() };
    chats.push(chat); currentId = chat.id;
  }
  chat.messages.push({ role: "user", content: text });
  chat.updated = Date.now();
  saveChats(); renderChatList(); renderMessages();
  els.input.value = ""; autoGrow();
  await requestAnswer(chat);
}

async function regenerate() {
  const chat = currentChat();
  if (!chat || controller) return;
  if (chat.messages.at(-1)?.role === "assistant") chat.messages.pop();
  if (chat.messages.at(-1)?.role !== "user") return;
  saveChats(); renderMessages();
  await requestAnswer(chat);
}

async function requestAnswer(chat) {
  const history = chat.messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));

  // Platzhalter für die Antwort
  const wrap = document.createElement("div"); wrap.className = "msg assistant";
  const icon = document.createElement("div"); icon.className = "mini-reactor thinking";
  const content = document.createElement("div"); content.className = "content";
  const bubble = document.createElement("div"); bubble.className = "bubble cursor";
  content.append(bubble); wrap.append(icon, content); els.messages.append(wrap); scrollDown();

  setBusy(true);
  controller = new AbortController();
  let answer = "";
  let failed = false;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      let msg = "Es ist ein Fehler aufgetreten.";
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let frame = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      if (++frame % 2 === 0 || answer.length < 200) { bubble.innerHTML = renderMarkdown(answer); scrollDown(); }
    }
    answer += decoder.decode();
    if (!answer.trim()) throw new Error("Die KI hat keine Antwort geliefert. Bitte erneut versuchen.");
  } catch (err) {
    if (err.name === "AbortError") {
      if (!answer.trim()) answer = "_Antwort gestoppt._";
    } else {
      failed = true;
      answer = "⚠️ " + (err.message || "Verbindungsfehler. Bitte prüfen Sie Ihre Internetverbindung.");
    }
  } finally {
    controller = null;
    setBusy(false);
  }

  chat.messages.push(failed ? { role: "assistant", content: answer, error: true } : { role: "assistant", content: answer });
  chat.updated = Date.now();
  saveChats(); renderChatList(); renderMessages();
}

function setBusy(busy) {
  els.send.hidden = busy; els.stop.hidden = !busy;
  els.reactor.classList.toggle("active", busy);
}

// ---------- Eingabe ----------
function autoGrow() {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 160) + "px";
  els.send.disabled = !els.input.value.trim();
}

els.form.addEventListener("submit", (e) => { e.preventDefault(); send(els.input.value); });
els.input.addEventListener("input", autoGrow);
els.input.addEventListener("keydown", (e) => {
  // Enter sendet am Computer, Umschalt+Enter macht eine neue Zeile. Auf dem Handy bleibt Enter ein Zeilenumbruch.
  const touch = matchMedia("(pointer: coarse)").matches;
  if (e.key === "Enter" && !e.shiftKey && !touch && !e.isComposing) { e.preventDefault(); send(els.input.value); }
});
els.stop.addEventListener("click", () => controller?.abort());
els.mic.addEventListener("click", () => toast("Die Spracheingabe ist geplant und folgt in Phase 3."));
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => send(c.dataset.prompt)));
els.messages.addEventListener("click", (e) => {
  const btn = e.target.closest(".copy-code");
  if (btn) copyText(btn.closest(".codeblock").querySelector("code").textContent, btn);
});

// ---------- Seitenleiste ----------
function openSidebar() { els.sidebar.classList.add("open"); els.backdrop.hidden = false; }
function closeSidebar() { els.sidebar.classList.remove("open"); els.backdrop.hidden = true; }
$("openSidebar").onclick = openSidebar;
$("closeSidebar").onclick = closeSidebar;
els.backdrop.onclick = closeSidebar;
$("newChatTop").onclick = newChat;
$("newChatSide").onclick = newChat;
els.search.addEventListener("input", renderChatList);

// ---------- Start ----------
autoGrow();
renderChatList();
renderMessages();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
