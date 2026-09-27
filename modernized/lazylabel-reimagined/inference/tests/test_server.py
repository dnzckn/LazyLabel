"""The HTTP binding: a client that leaves before its answer is one line, not a traceback.

DEPLOYABILITY.md walkthrough row 30: a curl with a one-second timeout during the first /health, which
imports PyTorch and takes about four seconds, made the service print several full tracebacks,
`ConnectionAbortedError: [WinError 10053] An established connection was aborted by the software in
your host machine`. Harmless, and it read like a crash -- in the window `npm start` now shares with
the app, where a user sees it (R8).
"""

from __future__ import annotations

import socket
import struct
import threading
import time

import pytest

from lazylabel_inference import server as binding
from lazylabel_inference.app import Response
from lazylabel_inference.log import Logger


@pytest.fixture
def running(monkeypatch):
    """`serve`, on a free loopback port in a thread, with its lines kept and a way to stop it."""
    servers: list[binding.ThreadingHTTPServer] = []

    class Kept(binding.ThreadingHTTPServer):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            servers.append(self)

    monkeypatch.setattr(binding, "ThreadingHTTPServer", Kept)
    lines: list[str] = []
    answer = threading.Event()

    def handle(request):
        # Answer only once the client has gone, so the answer has nobody to go to.
        answer.wait(5)
        return Response(200, '{"status": "ok", "padding": "' + "x" * 1_000_000 + '"}', {"content-type": "application/json"})

    thread = threading.Thread(target=binding.serve, args=(handle, "127.0.0.1", 0, Logger(sink=lines.append)), daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not servers and time.monotonic() < deadline:
        time.sleep(0.01)
    yield servers[0].server_address[1], answer, lines
    servers[0].shutdown()
    thread.join(5)


def test_a_client_that_leaves_before_its_answer_is_one_line_and_no_traceback(running, capsys):
    port, answer, lines = running
    client = socket.create_connection(("127.0.0.1", port))
    client.sendall(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
    time.sleep(0.2)
    # Gone without a goodbye: a reset, as a client that timed out leaves.
    client.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
    client.close()
    time.sleep(0.2)
    answer.set()

    deadline = time.monotonic() + 5
    while not any("went away" in line for line in lines) and time.monotonic() < deadline:
        time.sleep(0.02)

    (gone,) = [line for line in lines if "went away" in line]
    assert '"path": "/health"' in gone and '"status": 200' in gone
    assert "Traceback" not in capsys.readouterr().err
