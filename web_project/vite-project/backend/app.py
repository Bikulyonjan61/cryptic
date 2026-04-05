from gevent import monkey
monkey.patch_all()

from flask import Flask, request, jsonify
from flask_socketio import SocketIO, join_room, emit
from flask_cors import CORS
import os, time

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-this-in-production")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "*")

CORS(app, origins=FRONTEND_URL)
socketio = SocketIO(app, cors_allowed_origins=FRONTEND_URL, async_mode="gevent")

rooms = {}
ROOM_TTL = 3600

def cleanup_empty_rooms():
    now = time.time()
    to_delete = [
        code for code, data in rooms.items()
        if len(data["members"]) == 0
        and (now - data.get("last_active", data["created_at"])) > ROOM_TTL
    ]
    for code in to_delete:
        del rooms[code]

@app.route("/")
def index():
    return jsonify({"status": "Cryptic backend running"}), 200

@app.route("/create-room", methods=["POST"])
def create_room():
    cleanup_empty_rooms()
    data = request.get_json(silent=True) or {}
    code = data.get("room_code", "").upper().strip()

    if not code:
        return jsonify({"error": "Room code cannot be empty."}), 400
    if not code.isalnum():
        return jsonify({"error": "Room code must contain only letters and numbers."}), 400
    if len(code) < 2 or len(code) > 12:
        return jsonify({"error": "Room code must be 2-12 characters."}), 400
    if code in rooms:
        return jsonify({"error": "Room code already exists. Choose a different code."}), 409

    rooms[code] = {"created_at": time.time(), "last_active": time.time(), "members": {}}
    print(f"[ROOM CREATED] {code}")
    return jsonify({"room_code": code}), 201

@app.route("/validate-room/<code>", methods=["GET"])
def validate_room(code):
    code = code.upper().strip()
    return jsonify({"valid": code in rooms}), 200

@socketio.on("join")
def on_join(data):
    code = data.get("room_code", "").upper().strip()
    if code not in rooms:
        emit("error", {"message": "Room not found."})
        return
    if request.sid in rooms[code]["members"]:
        return

    member_number = len(rooms[code]["members"]) + 1
    anon_name = f"Anon#{member_number}"
    rooms[code]["members"][request.sid] = anon_name
    rooms[code]["last_active"] = time.time()

    join_room(code)
    emit("joined", {"room_code": code, "anon_name": anon_name, "member_count": len(rooms[code]["members"])})
    emit("user_joined", {"anon_name": anon_name, "member_count": len(rooms[code]["members"])}, to=code, include_self=False)
    print(f"[JOIN] {anon_name} joined {code} ({len(rooms[code]['members'])} online)")

@socketio.on("message")
def on_message(data):
    code = data.get("room_code", "").upper().strip()
    ciphertext = data.get("ciphertext")
    iv = data.get("iv")

    if not code or code not in rooms:
        emit("error", {"message": "Room not found."})
        return
    if request.sid not in rooms[code]["members"]:
        emit("error", {"message": "Not a member of this room."})
        return
    if not ciphertext or not iv:
        emit("error", {"message": "Invalid message payload."})
        return

    sender_name = rooms[code]["members"][request.sid]
    rooms[code]["last_active"] = time.time()
    emit("message", {"from": sender_name, "ciphertext": ciphertext, "iv": iv, "timestamp": time.time()}, to=code, include_self=False)

@socketio.on("disconnect")
def on_disconnect():
    for code, room_data in list(rooms.items()):
        if request.sid in room_data["members"]:
            anon_name = room_data["members"].pop(request.sid)
            room_data["last_active"] = time.time()
            emit("user_left", {"anon_name": anon_name, "member_count": len(room_data["members"])}, to=code)
            print(f"[LEAVE] {anon_name} left {code} ({len(room_data['members'])} online)")
            break

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)