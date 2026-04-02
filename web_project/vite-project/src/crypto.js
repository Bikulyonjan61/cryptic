// crypto.js  —  place this in your Vite project's src/ folder
// Uses the built-in Web Crypto API (no npm package needed)

// ─────────────────────────────────────────────────────────────────────────────
// KEY DERIVATION
// Takes the room code string (e.g. "ABC123") and turns it into a real AES-256
// key using PBKDF2.  Both users derive the *same* key from the *same* code,
// so they can decrypt each other's messages without ever exchanging the key.
// ─────────────────────────────────────────────────────────────────────────────
export async function deriveKeyFromCode(roomCode) {
  const encoder = new TextEncoder();

  // Step 1: Import the room code as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(roomCode),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // Step 2: Derive a proper AES-256-GCM key
  // The salt is fixed so both users derive the same key.
  // In a real app you'd want a random salt exchanged separately.
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("encrypted-chat-salt"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,          // not extractable — the key never leaves the browser
    ["encrypt", "decrypt"]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ENCRYPT
// Returns { ciphertext, iv } both as base64 strings, ready to send over the
// WebSocket.  A fresh random IV is generated for every single message.
// ─────────────────────────────────────────────────────────────────────────────
export async function encryptMessage(plaintext, key) {
  const encoder = new TextEncoder();

  // AES-GCM requires a unique IV per encryption — never reuse one!
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DECRYPT
// Receives the base64 ciphertext + iv from the server, decrypts locally.
// ─────────────────────────────────────────────────────────────────────────────
export async function decryptMessage(ciphertextB64, ivB64, key) {
  const ciphertext = base64ToBuffer(ciphertextB64);
  const iv = base64ToBuffer(ivB64);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintextBuffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}