// chat.js — core connection + crypto logic
// Place this at: src/chat.js

import { io } from "socket.io-client";
import { deriveKeyFromCode, encryptMessage, decryptMessage } from "./crypto.js";

// ── IMPORTANT: Change this to your deployed backend URL in production ──
// For local dev use your machine's LAN IP so other devices can reach it.
// Example: "http://192.168.1.65:5000"
// For production deploy: "https://your-backend.onrender.com"
const BACKEND = "http://localhost:5000";

let socket      = null;
let aesKey      = null;
let myAnonName  = null;
let currentRoom = null;

// ── Event callback registries ─────────────────────────────────────────
const handlers = {
  message:    [],
  userJoined: [],
  userLeft:   [],
};

export function onMessage(fn)    { handlers.message.push(fn); }
export function onUserJoined(fn) { handlers.userJoined.push(fn); }
export function onUserLeft(fn)   { handlers.userLeft.push(fn); }

function emit(event, data) {
  handlers[event].forEach(fn => fn(data));
}

export function getAnonName() { return myAnonName; }

// ── Create Room ───────────────────────────────────────────────────────
// Sends POST /create-room with a user-supplied code.
export async function createRoom(code) {
  const res = await fetch(`${BACKEND}/create-room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_code: code }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create room.");
  return data.room_code;
}

// ── Join Room ──────────────────────────────────────────────────────────
// 1. Validates the room exists  2. Derives AES key  3. Opens socket
export async function joinRoom(code) {
  // Step 1: Validate room exists on server
  const res = await fetch(`${BACKEND}/validate-room/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error("Server error while validating room.");
  const data = await res.json();
  if (!data.valid) throw new Error("Room not found. Check the code and try again.");

  // Step 2: Derive AES-256 key from room code (stays in browser memory only)
  aesKey = await deriveKeyFromCode(code);

  // Step 3: Connect socket and join room
  await connectToRoom(code);
  return code;
}

// ── Internal: open WebSocket + register server events ─────────────────
async function connectToRoom(roomCode) {
  currentRoom = roomCode;

  socket = io(BACKEND, {
    transports: ["websocket", "polling"], // fallback to polling if ws blocked
  });

  // Wait for socket to connect before emitting "join"
  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", (err) => reject(new Error("Connection failed: " + err.message)));
  });

  // Tell the server which room we're joining
  socket.emit("join", { room_code: roomCode });

  // Wait for server confirmation
  await new Promise((resolve, reject) => {
    socket.once("joined", (payload) => {
      myAnonName = payload.anon_name;
      console.log(`[Cryptic] Joined as ${payload.anon_name} · ${payload.member_count} online`);
      resolve(payload);
    });
    socket.once("error", (err) => reject(new Error(err.message)));
  });

  // ── Ongoing socket event handlers ──────────────────────────────────

  // Incoming encrypted message → decrypt → fire handler
  socket.on("message", async ({ from, ciphertext, iv, timestamp }) => {
    try {
      const plaintext = await decryptMessage(ciphertext, iv, aesKey);
      emit("message", { from, plaintext, timestamp });
    } catch {
      console.warn("[Cryptic] Failed to decrypt a message — wrong key or corrupted data.");
    }
  });

  socket.on("user_joined", (data) => emit("userJoined", data));
  socket.on("user_left",   (data) => emit("userLeft",   data));

  socket.on("error", ({ message }) => {
    console.error("[Cryptic] Server error:", message);
  });

  socket.on("disconnect", () => {
    console.log("[Cryptic] Disconnected from server.");
  });
}

// ── Send an encrypted message ──────────────────────────────────────────
export async function sendMessage(roomCode, plaintext) {
  if (!socket || !aesKey) throw new Error("Not connected to a room.");

  const { ciphertext, iv } = await encryptMessage(plaintext, aesKey);

  socket.emit("message", {
    room_code: currentRoom,
    ciphertext,
    iv,
  });
}

// ── Leave + cleanup ────────────────────────────────────────────────────
export function leaveRoom() {
  if (socket) {
    socket.disconnect();
    socket      = null;
    aesKey      = null;
    myAnonName  = null;
    currentRoom = null;
    handlers.message    = [];
    handlers.userJoined = [];
    handlers.userLeft   = [];
  }
}