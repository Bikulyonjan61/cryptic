# app.py — Flask + Socket.IO backend
# Run with:  python app.py
# Install:   pip install flask flask-socketio flask-cors

from flask import Flask, request, jsonify
from flask_socketio import SocketIO, join_room, emit
from flask_cors import CORS
import time
import eventlet
eventlet.monkey_patch()

app = Flask(__name__)
app.config["SECRET_KEY"] = "change-this-in-production"

# ── CORS ──────────────────────────────────────────────────────────────
# Allow requests from your Vite dev server.
# Add your production domain here when you deploy, e.g. "https://cryptic.example.com"
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://192.168.1.65:5173",   # your LAN IP + Vite port
    # "https://your-production-domain.com",  # add when deploying
]

CORS(app, origins=ALLOWED_ORIGINS)

socketio = SocketIO(
    app,
    cors_allowed_origins=ALLOWED_ORIGINS,  # must match frontend origin, NOT backend URL
    async_mode="eventlet",
)

# In-memory room store  { room_code: { created_at, members: {sid: anon_name} } }
rooms = {}


# ── REST Endpoints ────────────────────────────────────────────────────

@app.route("/create-room", methods=["POST"])
def create_room():
    data = request.get_json(silent=True) or {}
    code = data.get("room_code", "").upper().strip()

    if not code:
        return jsonify({"error": "Room code cannot be empty."}), 400

    # Basic sanitisation — letters and numbers only
    if not code.isalnum():
        return jsonify({"error": "Room code must contain only letters and numbers."}), 400

    if code in rooms:
        return jsonify({"error": "Room code already exists. Choose a different code."}), 409

    rooms[code] = {
        "created_at": time.time(),
        "members": {},          # sid → anon_name
    }

    print(f"[ROOM CREATED] {code}")
    return jsonify({"room_code": code}), 201


@app.route("/validate-room/<code>", methods=["GET"])
def validate_room(code):
    code = code.upper().strip()
    exists = code in rooms
    print(f"[VALIDATE] {code} → {exists}")
    return jsonify({"valid": exists}), 200


# ── Socket.IO Events ──────────────────────────────────────────────────

@socketio.on("join")
def on_join(data):
    code = data.get("room_code", "").upper().strip()

    if code not in rooms:
        emit("error", {"message": "Room not found."})
        return

    # Assign an anonymous name based on join order
    member_number = len(rooms[code]["members"]) + 1
    anon_name = f"AnonUser#{member_number}"
    rooms[code]["members"][request.sid] = anon_name

    join_room(code)

    # Confirm to the joining client
    emit("joined", {
        "room_code": code,
        "anon_name": anon_name,
        "member_count": len(rooms[code]["members"]),
    })

    # Notify everyone else in the room
    emit("user_joined", {
        "anon_name": anon_name,
        "member_count": len(rooms[code]["members"]),
    }, to=code, include_self=False)

    print(f"[JOIN] {anon_name} joined {code}  ({len(rooms[code]['members'])} online)")


@socketio.on("message")
def on_message(data):
    """
    Relay the encrypted message payload to everyone else in the room.
    We never decrypt on the server — the ciphertext passes through opaquely.
    """
    code       = data.get("room_code", "").upper().strip()
    ciphertext = data.get("ciphertext")
    iv         = data.get("iv")

    if code not in rooms or request.sid not in rooms[code]["members"]:
        emit("error", {"message": "Not a member of this room."})
        return

    sender_name = rooms[code]["members"][request.sid]

    # Broadcast to everyone in the room EXCEPT the sender
    emit("message", {
        "from":       sender_name,
        "ciphertext": ciphertext,
        "iv":         iv,
        "timestamp":  time.time(),
    }, to=code, include_self=False)


@socketio.on("disconnect")
def on_disconnect():
    for code, room_data in rooms.items():
        if request.sid in room_data["members"]:
            anon_name = room_data["members"].pop(request.sid)

            emit("user_left", {
                "anon_name":    anon_name,
                "member_count": len(room_data["members"]),
            }, to=code)

            print(f"[LEAVE] {anon_name} left {code}  ({len(room_data['members'])} online)")
            break


# ── Run ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # host="0.0.0.0" makes the server reachable from other devices on your LAN
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)