// script.js — connected to main.html (chat page)
import { sendMessage, onMessage, onUserJoined, onUserLeft, leaveRoom, getAnonName } from "./chat.js";
import { joinRoom } from "./chat.js";

const chatArea = document.getElementById("chat-area");
const msgInput = document.getElementById("msg-input");
const sendBtn  = document.getElementById("send-btn");
const leaveBtn = document.getElementById("btm-leave");

// Read room code saved by main.js on the landing page
const roomCode = sessionStorage.getItem("room_code");

// If someone lands here directly without a room code, send them back
if (!roomCode) {
  window.location.href = "/";
}

// ── Connect to room ───────────────────────────────────────────────────
// joinRoom derives the AES key, opens the WebSocket, and waits for the
// server to confirm membership before the chat UI becomes usable.
try {
  await joinRoom(roomCode);
  appendSystemMessage(`✅ Joined room ${roomCode} as ${getAnonName()}`);
} catch (err) {
  appendSystemMessage(`❌ Could not join room: ${err.message}`);
  console.error(err);
  // Give the user a moment to read the error, then redirect home
  setTimeout(() => { window.location.href = "/"; }, 3000);
}

// ── Real-time event handlers ──────────────────────────────────────────

onMessage(({ from, plaintext, timestamp }) => {
  appendMessage(from, plaintext, timestamp, /* isSelf */ false);
});

onUserJoined(({ anon_name, member_count }) => {
  appendSystemMessage(`${anon_name} joined · ${member_count} online`);
});

onUserLeft(({ anon_name, member_count }) => {
  appendSystemMessage(`${anon_name} left · ${member_count} online`);
});

// ── Send message ──────────────────────────────────────────────────────
async function handleSend() {
  const text = msgInput.value.trim();
  if (!text) return;

  msgInput.value = "";
  msgInput.focus();

  try {
    await sendMessage(roomCode, text);
    // Optimistic UI: show sent message immediately
    appendMessage("You", text, Date.now() / 1000, /* isSelf */ true);
  } catch (err) {
    appendSystemMessage("⚠️ Failed to send message.");
    console.error(err);
  }
}

sendBtn.addEventListener("click", handleSend);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) handleSend();
});

// ── Leave room ────────────────────────────────────────────────────────
leaveBtn.addEventListener("click", () => {
  leaveRoom();
  sessionStorage.removeItem("room_code");
  window.location.href = "/";
});

// ── DOM helpers ───────────────────────────────────────────────────────

function appendMessage(sender, text, timestamp, isSelf) {
  // Remove the "Start chatting..." placeholder if still there
  document.querySelector("#chat-area .text-gray-400")?.remove();

  const time = formatTime(timestamp);
  const wrapper = document.createElement("div");
  wrapper.className = `flex flex-col ${isSelf ? "items-end" : "items-start"}`;

  wrapper.innerHTML = `
    <span class="text-xs text-gray-400 mb-1 px-1">${escapeHtml(sender)} · ${time}</span>
    <div class="max-w-xs px-4 py-2 rounded-2xl text-sm break-words
      ${isSelf
        ? "bg-purple-600 text-white rounded-br-sm"
        : "bg-white text-gray-800 shadow rounded-bl-sm border border-gray-100"}">
      ${escapeHtml(text)}
    </div>
  `;

  chatArea.appendChild(wrapper);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function appendSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "text-center text-gray-400 text-xs py-1";
  el.textContent = text;
  chatArea.appendChild(el);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function formatTime(unixTs) {
  return new Date(unixTs * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}