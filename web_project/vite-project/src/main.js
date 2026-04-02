// main.js — connected to index.html (landing page)
import './style.css'
import { createRoom, joinRoom } from "./chat.js";

const tabCreate     = document.getElementById("tab-create");
const tabJoin       = document.getElementById("tab-join");
const panelCreate   = document.getElementById("panel-create");
const panelJoin     = document.getElementById("panel-join");
const btnCreate     = document.getElementById("btn-create");
const btnJoin       = document.getElementById("btn-join");
const createNameInput = document.getElementById("create-name");
const joinCodeInput   = document.getElementById("join-code");

// ── Tab switching ─────────────────────────────────────────────────────
tabCreate.addEventListener("click", () => {
  tabCreate.classList.add("text-gray-900", "border-b-2", "border-blue-500");
  tabCreate.classList.remove("text-gray-400");
  tabJoin.classList.remove("text-gray-900", "border-b-2", "border-blue-500");
  tabJoin.classList.add("text-gray-400");
  panelCreate.classList.remove("hidden");
  panelJoin.classList.add("hidden");
  document.querySelector(".error-msg")?.remove();
});

tabJoin.addEventListener("click", () => {
  tabJoin.classList.add("text-gray-900", "border-b-2", "border-blue-500");
  tabJoin.classList.remove("text-gray-400");
  tabCreate.classList.remove("text-gray-900", "border-b-2", "border-blue-500");
  tabCreate.classList.add("text-gray-400");
  panelJoin.classList.remove("hidden");
  panelCreate.classList.add("hidden");
  document.querySelector(".error-msg")?.remove();
});

// ── Create Room ───────────────────────────────────────────────────────
// User types a custom code → server registers it → redirect to chat
btnCreate.addEventListener("click", async () => {
  const code = createNameInput.value.trim().toUpperCase();

  if (!code) {
    showError("Please enter a room code.");
    return;
  }

  // Basic validation: only letters and numbers, 4–12 chars
  if (!/^[A-Z0-9]{2,12}$/.test(code)) {
    showError("Room code must be 2–12 letters/numbers, no spaces.");
    return;
  }

  setLoading(btnCreate, true);

  try {
    const roomCode = await createRoom(code); // chat.js handles the fetch
    sessionStorage.setItem("room_code", roomCode);
    window.location.href = "/main.html";     // redirect to chat page
  } catch (err) {
    showError(err.message);
    console.error(err);
  } finally {
    setLoading(btnCreate, false);
  }
});

// Allow pressing Enter in the create input
createNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnCreate.click();
});

// ── Join Room ─────────────────────────────────────────────────────────
// User types someone else's code → validate → redirect to chat
btnJoin.addEventListener("click", async () => {
  const code = joinCodeInput.value.trim().toUpperCase();

  if (!code) {
    showError("Please enter a room code.");
    return;
  }

  setLoading(btnJoin, true);

  try {
    // joinRoom validates the room exists on the server.
    // We don't fully connect here — script.js does the full join on the chat page.
    // We just validate so we can show a friendly error before redirecting.
    const res = await fetch(
      `http://192.168.1.65:5000/validate-room/${encodeURIComponent(code)}`
    );
    const data = await res.json();
    if (!data.valid) throw new Error("Room not found. Check the code and try again.");

    sessionStorage.setItem("room_code", code);
    window.location.href = "/main.html"; // redirect to chat page
  } catch (err) {
    showError(err.message);
    console.error(err);
  } finally {
    setLoading(btnJoin, false);
  }
});

// Allow pressing Enter in the join input
joinCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnJoin.click();
});

// ── Helpers ───────────────────────────────────────────────────────────
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading
    ? "Connecting..."
    : btn.id === "btn-create"
      ? "Create Room"
      : "Join Room";
}

function showError(msg) {
  document.querySelector(".error-msg")?.remove();

  const el = document.createElement("p");
  el.className = "error-msg text-red-500 text-sm text-center mt-2";
  el.textContent = msg;

  const panel = panelJoin.classList.contains("hidden") ? panelCreate : panelJoin;
  panel.appendChild(el);

  setTimeout(() => el.remove(), 4000);
}