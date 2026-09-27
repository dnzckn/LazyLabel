"""`lazylabel-models`: an opt-in, verified checkpoint fetch (DEPLOYABILITY.md R7).

Enabling the AI tools took about ten manual steps, one of them a trap: the example manifest had the
wrong size for SAM 2.1 large, so a good download was reported as "partial" and fetched again. This
holds the replacement to RULE-087: ask first, download beside the real name, resume rather than
restart, check the size and the SHA-256 before the file takes its name, and only then list it in the
manifest the service reads -- and holds the service to never importing any of it (SEC-05).

Every download here is from a checkpoint host on loopback, started by the test. Nothing is fetched
from the internet.
"""

from __future__ import annotations

import ast
import hashlib
import io
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

import lazylabel_inference
from lazylabel_inference.fetch import (
    CATALOG,
    Checkpoint,
    FetchError,
    default_model_dir,
    fetch,
    find,
    load_catalog,
    main,
    model_dir,
)
from lazylabel_inference.manifest import check_checkpoint, load_manifest, parse_manifest

# A megabyte and a bit: more than one read, and a size no chunk boundary lands on.
PAYLOAD = bytes(range(256)) * 4096 + b"tail"
DIGEST = hashlib.sha256(PAYLOAD).hexdigest()


class _Host:
    """What the loopback host serves, how, and what it was asked for."""

    def __init__(self) -> None:
        self.body = PAYLOAD
        self.honour_range = True
        self.cut_after: int | None = None
        self.ranges: list[str | None] = []
        self.url = ""


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - the standard library's name
        host: _Host = self.server.host  # type: ignore[attr-defined]
        wanted = self.headers.get("Range")
        host.ranges.append(wanted)
        start = 0
        if wanted is not None and host.honour_range:
            start = int(wanted.removeprefix("bytes=").split("-")[0])
            if start >= len(host.body):
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{len(host.body)}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{len(host.body) - 1}/{len(host.body)}")
        else:
            self.send_response(200)
        rest = host.body[start:]
        self.send_header("Content-Length", str(len(rest)))
        self.end_headers()
        # A dropped connection: the length promised, part of it sent, then the socket closes.
        self.wfile.write(rest if host.cut_after is None else rest[: host.cut_after])

    def log_message(self, fmt: str, *args: object) -> None:
        pass


@pytest.fixture
def host():
    state = _Host()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.host = state  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    state.url = f"http://127.0.0.1:{server.server_address[1]}/sam2.1_hiera_large.pt"
    yield state
    server.shutdown()
    server.server_close()


def _checkpoint(url: str | None, **changed: object) -> Checkpoint:
    fields: dict[str, object] = {
        "id": "sam2.1-large",
        "name": "SAM 2.1 large",
        "family": "sam2",
        "size": "large",
        "filename": "sam2.1_hiera_large.pt",
        "sha256": DIGEST,
        "bytes": len(PAYLOAD),
        "url": url,
        "source": None,
    }
    fields.update(changed)
    return Checkpoint(**fields)  # type: ignore[arg-type]


def _never_asked(question: str) -> bool:
    raise AssertionError(f"asked {question!r} with --yes")


class TestFetching:
    def test_downloads_verifies_and_lists_it_where_the_service_reads_it(self, host, tmp_path):
        out = io.StringIO()
        assert fetch(_checkpoint(host.url), tmp_path, yes=True, ask=_never_asked, out=out)

        assert (tmp_path / "sam2.1_hiera_large.pt").read_bytes() == PAYLOAD
        assert not (tmp_path / "sam2.1_hiera_large.pt.part").exists()
        # The service's own reading of the result: parsed, present, and verified in full.
        (entry,) = load_manifest(tmp_path / "manifest.json")
        assert (entry.name, entry.family, entry.size, entry.sha256) == ("SAM 2.1 large", "sam2", "large", DIGEST)
        assert check_checkpoint(entry, tmp_path).usable
        assert DIGEST in out.getvalue()

    def test_asks_first_naming_the_size_and_the_source_and_downloads_nothing_on_no(self, host, tmp_path):
        questions: list[str] = []

        def decline(question: str) -> bool:
            questions.append(question)
            return False

        assert not fetch(_checkpoint(host.url), tmp_path / "models", ask=decline, out=io.StringIO())

        (question,) = questions
        assert "SAM 2.1 large (1 MB)" in question and "127.0.0.1" in question
        assert host.ranges == []
        assert not (tmp_path / "models").exists()

    def test_downloads_on_yes(self, host, tmp_path):
        assert fetch(_checkpoint(host.url), tmp_path, ask=lambda question: True, out=io.StringIO())
        assert (tmp_path / "sam2.1_hiera_large.pt").read_bytes() == PAYLOAD

    def test_an_interrupted_download_is_kept_aside_and_resumed_from_where_it_stopped(self, host, tmp_path):
        # RULE-087: legacy left a partial file under the checkpoint's own name, so the next start
        # skipped the download and failed to load it with no message saying why.
        host.cut_after = 300_000
        with pytest.raises(FetchError, match="stopped at 300,000 of 1,048,580 bytes"):
            fetch(_checkpoint(host.url), tmp_path, yes=True, out=io.StringIO())
        assert (tmp_path / "sam2.1_hiera_large.pt.part").stat().st_size == 300_000
        assert not (tmp_path / "sam2.1_hiera_large.pt").exists()
        assert not (tmp_path / "manifest.json").exists()

        host.cut_after = None
        assert fetch(_checkpoint(host.url), tmp_path, yes=True, out=io.StringIO())

        assert host.ranges == [None, "bytes=300000-"]
        assert (tmp_path / "sam2.1_hiera_large.pt").read_bytes() == PAYLOAD

    def test_starts_again_when_the_server_will_not_resume(self, host, tmp_path):
        (tmp_path / "sam2.1_hiera_large.pt.part").write_bytes(b"\xff" * 1000)
        host.honour_range = False
        out = io.StringIO()

        assert fetch(_checkpoint(host.url), tmp_path, yes=True, out=out)

        assert (tmp_path / "sam2.1_hiera_large.pt").read_bytes() == PAYLOAD
        assert "starts again" in out.getvalue()

    def test_a_complete_part_file_is_checked_rather_than_fetched_again(self, host, tmp_path):
        (tmp_path / "sam2.1_hiera_large.pt.part").write_bytes(PAYLOAD)
        assert fetch(_checkpoint(host.url), tmp_path, yes=True, out=io.StringIO())
        assert host.ranges == []
        assert (tmp_path / "sam2.1_hiera_large.pt").read_bytes() == PAYLOAD

    def test_bytes_that_do_not_hash_to_the_verified_digest_are_not_kept(self, host, tmp_path):
        with pytest.raises(FetchError, match="Nothing was kept"):
            fetch(_checkpoint(host.url, sha256="0" * 64), tmp_path, yes=True, out=io.StringIO())
        assert sorted(tmp_path.iterdir()) == []

    def test_a_source_that_offers_another_size_is_refused_before_anything_is_written(self, host, tmp_path):
        host.body = PAYLOAD + b"changed upstream"
        with pytest.raises(FetchError, match="the server offers 1,048,596 bytes"):
            fetch(_checkpoint(host.url), tmp_path, yes=True, out=io.StringIO())
        assert sorted(tmp_path.iterdir()) == []

    def test_a_verified_file_already_there_is_listed_without_downloading(self, host, tmp_path):
        (tmp_path / "sam2.1_hiera_large.pt").write_bytes(PAYLOAD)
        assert fetch(_checkpoint(host.url), tmp_path, ask=_never_asked, out=io.StringIO())
        assert host.ranges == []
        assert [entry.name for entry in load_manifest(tmp_path / "manifest.json")] == ["SAM 2.1 large"]

    def test_a_file_of_that_name_that_is_not_the_verified_one_is_left_alone(self, host, tmp_path):
        # Legacy deleted such a file and downloaded again, silently discarding what a user put there.
        (tmp_path / "sam2.1_hiera_large.pt").write_bytes(b"my fine-tuned weights")
        with pytest.raises(FetchError, match="Move it or delete it"):
            fetch(_checkpoint(host.url), tmp_path, yes=True, out=io.StringIO())
        assert (tmp_path / "sam2.1_hiera_large.pt").read_bytes() == b"my fine-tuned weights"
        assert host.ranges == []

    def test_a_checkpoint_with_no_download_says_where_it_comes_from(self, tmp_path):
        embedder = _checkpoint(
            None,
            id="mobilenet-v3-small",
            name="MobileNetV3 small",
            family="embedder",
            size="mobilenet_v3_small",
            filename="mobilenetv3_small_tv.pth",
            source="torchvision's weights, saved as a state dict",
        )
        with pytest.raises(FetchError, match="torchvision's weights, saved as a state dict"):
            fetch(embedder, tmp_path, yes=True, out=io.StringIO())


class TestTheManifestItWrites:
    def test_keeps_every_other_entry_and_replaces_a_stale_one(self, host, tmp_path):
        sam1 = {
            "name": "SAM 1 huge",
            "family": "sam1",
            "size": "vit_h",
            "filename": "sam_vit_h_4b8939.pth",
            "sha256": "a" * 64,
            "bytes": 2564550879,
        }
        stale = {**_checkpoint(None).manifest_entry(), "sha256": "b" * 64, "bytes": 897952466}
        (tmp_path / "manifest.json").write_text(
            json.dumps({"$comment": "written by hand", "models": [sam1, stale]}), encoding="utf-8"
        )

        fetch(_checkpoint(host.url), tmp_path, yes=True, out=io.StringIO())

        document = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
        assert document["$comment"] == "written by hand"
        assert [(entry["name"], entry["sha256"]) for entry in document["models"]] == [
            ("SAM 1 huge", "a" * 64),
            ("SAM 2.1 large", DIGEST),
        ]
        assert not (tmp_path / "manifest.json.tmp").exists()

    def test_leaves_a_manifest_it_cannot_read_as_it_is(self, host, tmp_path):
        (tmp_path / "manifest.json").write_text("{ written by hand, badly", encoding="utf-8")
        with pytest.raises(FetchError, match="left as it is"):
            fetch(_checkpoint(host.url), tmp_path, yes=True, out=io.StringIO())
        assert (tmp_path / "manifest.json").read_text(encoding="utf-8") == "{ written by hand, badly"


class TestTheCatalog:
    """`models/manifest.verified.json`: MODEL_MANIFEST.md's verified entries, and where to get them."""

    VERIFIED = {
        "sam2.1_hiera_large.pt": ("2647878d5dfa5098f2f8649825738a9345572bae2d4350a2468587ece47dd318", 898083611),
        "sam_vit_h_4b8939.pth": ("a7bf3b02f3ebf1267aba913ff637d9a2d5c33d3173bb679e46d9f338c26f262e", 2564550879),
        # torchvision's published file, the one the desktop app downloads (reference_finder_worker.py:99-118);
        # its 244 tensors equal the desktop app's re-saved mobilenetv3_small_tv.pth (checked 2026-09-27).
        "mobilenet_v3_small-047dcff4.pth": ("047dcff4addef86ea5bc2eff13c9614dc11f47ab1160d0a71a25e7db994f4e1f", 10306551),
    }

    def test_holds_the_three_verified_checkpoints_and_nothing_else(self):
        catalog = load_catalog()
        assert {c.filename: (c.sha256, c.bytes) for c in catalog} == self.VERIFIED
        assert [c.id for c in catalog] == ["sam2.1-large", "sam1-huge", "mobilenet-v3-small"]
        # The service's own rules: a catalog it could not read would be a catalog of nothing.
        parse_manifest(CATALOG.read_text(encoding="utf-8"))

    def test_fetches_each_from_its_publisher_over_https(self):
        by_id = {c.id: c for c in load_catalog()}
        assert by_id["sam2.1-large"].url == (
            "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt"
        )
        assert by_id["sam1-huge"].url == "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth"
        # Find Archetypes' embedder: torchvision's IMAGENET1K_V1 weights, from where the desktop app
        # gets them, so `npm run ai:models mobilenet-v3-small` can fetch it too.
        assert by_id["mobilenet-v3-small"].url == (
            "https://download.pytorch.org/models/mobilenet_v3_small-047dcff4.pth"
        )

    def test_uses_the_example_manifests_names_so_a_saved_model_choice_still_matches(self):
        example = json.loads((CATALOG.parent / "manifest.example.json").read_text(encoding="utf-8"))
        assert {c.name for c in load_catalog()} == {entry["name"] for entry in example["models"]}

    def test_finds_by_id_or_name_in_any_case(self):
        catalog = load_catalog()
        assert find(catalog, "SAM2.1-LARGE").filename == "sam2.1_hiera_large.pt"
        assert find(catalog, "sam 1 huge").filename == "sam_vit_h_4b8939.pth"
        with pytest.raises(FetchError, match="sam2.1-large, sam1-huge, mobilenet-v3-small"):
            find(catalog, "sam3")


class TestWhereModelsGo:
    """Per user, outside the repository and every dataset. `api/test/aiScripts.test.ts` holds
    `npm start`'s TypeScript copy and the scripts' JavaScript one to this same table."""

    HOME = Path("/home/me")

    @pytest.mark.parametrize(
        ("env", "platform", "expected"),
        [
            ({"LOCALAPPDATA": "C:/Users/me/AppData/Local"}, "win32", Path("C:/Users/me/AppData/Local/LazyLabel/models")),
            ({}, "win32", HOME / "AppData" / "Local" / "LazyLabel" / "models"),
            ({}, "darwin", HOME / "Library" / "Application Support" / "LazyLabel" / "models"),
            ({"XDG_DATA_HOME": "/data/me"}, "linux", Path("/data/me/lazylabel/models")),
            ({"XDG_DATA_HOME": "relative/is/ignored"}, "linux", HOME / ".local" / "share" / "lazylabel" / "models"),
            ({}, "linux", HOME / ".local" / "share" / "lazylabel" / "models"),
        ],
    )
    def test_the_default_folder(self, env, platform, expected):
        assert default_model_dir(env, platform, self.HOME) == expected

    def test_lazylabel_model_dir_wins_as_the_service_reads_it(self, tmp_path):
        assert model_dir({"LAZYLABEL_MODEL_DIR": str(tmp_path)}) == tmp_path.resolve()


class TestTheCommand:
    def _catalog(self, tmp_path: Path, url: str) -> Path:
        path = tmp_path / "catalog.json"
        entry = {**_checkpoint(url).manifest_entry(), "id": "sam2.1-large"}
        path.write_text(json.dumps({"models": [entry]}), encoding="utf-8")
        return path

    def test_fetch(self, host, tmp_path):
        out, err = io.StringIO(), io.StringIO()
        models = tmp_path / "models"
        code = main(
            ["--catalog", str(self._catalog(tmp_path, host.url)), "fetch", "sam2.1-large", "--dir", str(models), "--yes"],
            out=out,
            err=err,
        )
        assert (code, err.getvalue()) == (0, "")
        assert (models / "sam2.1_hiera_large.pt").read_bytes() == PAYLOAD
        # Not the folder npm start looks in, so it says how to point it there.
        assert f"LAZYLABEL_MODEL_DIR={models.resolve()}" in out.getvalue()

    def test_list(self, host, tmp_path):
        out = io.StringIO()
        assert main(["--catalog", str(self._catalog(tmp_path, host.url)), "list", "--dir", str(tmp_path)], out=out) == 0
        assert "sam2.1-large" in out.getvalue() and "1 MB" in out.getvalue() and "127.0.0.1" in out.getvalue()

    @pytest.mark.parametrize("terminal", [False, True], ids=["no terminal", "a terminal that answers nothing"])
    def test_with_nobody_to_answer_it_downloads_nothing_and_says_to_pass_yes(self, host, tmp_path, monkeypatch, terminal):
        # The second is Windows' NUL, which calls itself a terminal: `< NUL` raised EOFError.
        class Silent(io.StringIO):
            def isatty(self) -> bool:
                return terminal

        monkeypatch.setattr(sys, "stdin", Silent(""))
        err = io.StringIO()
        code = main(
            ["--catalog", str(self._catalog(tmp_path, host.url)), "fetch", "sam2.1-large", "--dir", str(tmp_path / "m")],
            out=io.StringIO(),
            err=err,
        )
        assert code == 1 and "pass --yes" in err.getvalue()
        assert host.ranges == []

    def test_an_unknown_name_is_a_message_not_a_traceback(self, tmp_path):
        err = io.StringIO()
        assert main(["fetch", "sam3", "--dir", str(tmp_path), "--yes"], out=io.StringIO(), err=err) == 1
        assert err.getvalue().startswith("lazylabel-models: there is no checkpoint called 'sam3'")


class TestNothingIsDownloadedAtRuntime:
    """SEC-03, SEC-05, SEC-17: the service never downloads a checkpoint, so it never imports this."""

    PACKAGE = Path(lazylabel_inference.__file__).parent
    TOOLS = {"fetch", "doctor"}
    DOWNLOADERS = {"urllib.request", "http.client", "requests", "httpx", "urllib3", "aiohttp"}

    @staticmethod
    def _imports(module: Path) -> set[str]:
        names: set[str] = set()
        for node in ast.walk(ast.parse(module.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                names.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                base = ("." * node.level) + (node.module or "")
                names.add(base)
                names.update(f"{base}.{alias.name}" if base.strip(".") else f"{base}{alias.name}" for alias in node.names)
        return names

    def test_no_server_module_imports_fetch_or_anything_that_downloads(self):
        servers = [module for module in self.PACKAGE.glob("*.py") if module.stem not in self.TOOLS]
        assert {module.stem for module in servers} >= {"server", "app", "service", "backends", "manifest"}
        for module in servers:
            imported = self._imports(module)
            assert not [name for name in imported if name.split(".")[-1] == "fetch"], f"{module.name} imports fetch"
            assert not imported & self.DOWNLOADERS, f"{module.name} imports {imported & self.DOWNLOADERS}"

    def test_fetch_needs_nothing_beyond_the_standard_library(self):
        imported = self._imports(self.PACKAGE / "fetch.py")
        outside = {
            name
            for name in imported
            if not name.startswith(".") and name.split(".")[0] not in sys.stdlib_module_names
        }
        assert outside == set()
