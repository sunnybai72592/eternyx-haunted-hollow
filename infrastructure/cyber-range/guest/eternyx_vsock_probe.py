#!/usr/bin/env python3
"""Optional reference-only one-shot guest proof server for an OFFLINE image.

A qualified operator must integrate this into a trusted, independently pinned
guest rootfs manually. It is NOT installed, enabled or used by CI or production.
Run inside the microVM only. It binds AF_VSOCK port 5501 and no TCP socket.
This challenge response proves service liveness, NOT cryptographic identity.
"""
import hashlib
import json
import re
import socket

PROTOCOL = "eternyx-guest-smoke-v1"
PORT = 5501
UUID = re.compile(r"^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$")
NONCE = re.compile(r"^[a-f0-9]{64}$")


def respond(line):
    req = json.loads(line)
    if not isinstance(req, dict) or set(req) != {"protocol", "sessionId", "nonce"}:
        raise ValueError("wrong guest challenge shape")
    session = req["sessionId"]
    nonce = req["nonce"]
    if req["protocol"] != PROTOCOL or not isinstance(session, str) or not UUID.fullmatch(session):
        raise ValueError("untrusted guest session")
    if not isinstance(nonce, str) or not NONCE.fullmatch(nonce):
        raise ValueError("untrusted guest nonce")
    digest = hashlib.sha256((PROTOCOL + "\n" + session + "\n" + nonce).encode()).hexdigest()
    return {
        "protocol": PROTOCOL,
        "sessionId": session,
        "nonce": nonce,
        "digest": digest,
        "guestHealthy": True,
    }


def main():
    if not hasattr(socket, "AF_VSOCK"):
        raise RuntimeError("guest kernel has no AF_VSOCK support")
    server = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
    server.settimeout(60)
    server.bind((socket.VMADDR_CID_ANY, PORT))
    server.listen(2)
    while True:
        conn, _addr = server.accept()
        with conn:
            conn.settimeout(5)
            data = bytearray()
            while b"\n" not in data:
                piece = conn.recv(128)
                if not piece or len(data) + len(piece) > 512:
                    break
                data.extend(piece)
            try:
                line = bytes(data).split(b"\n", 1)[0].decode("utf-8", "strict")
                response = respond(line)
                conn.sendall((json.dumps(response, separators=(",", ":")) + "\n").encode())
            except (ValueError, UnicodeError, json.JSONDecodeError):
                # No echo of untrusted input.
                pass


if __name__ == "__main__":
    main()
