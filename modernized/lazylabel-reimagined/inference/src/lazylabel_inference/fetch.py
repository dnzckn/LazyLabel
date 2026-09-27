"""`lazylabel-models`: fetch a verified checkpoint, once, when asked.

DEPLOYABILITY.md R7. Enabling the AI tools took about ten manual steps: read MODEL_MANIFEST.md,
download gigabytes by hand, copy the example manifest, paste in three hashes, and correct a size the
example had wrong -- or be told a good download was "partial" and fetch 898 MB again for nothing.
This does it in one command, and does it the way RULE-087 asks:

- only when asked, with the size and the source shown first (``--yes`` skips the question);
- into ``<file>.part``, resumed with an HTTP Range request when a download was interrupted, so a
  partial file is never where the service looks;
- checked for its size, then its SHA-256, against ``models/manifest.verified.json`` BEFORE it is
  renamed into place, so a file with the checkpoint's name is always the verified bytes;
- and only then written into the model folder's ``manifest.json``, beside any entries already there.

THE SERVICE NEVER IMPORTS THIS (SEC-03, SEC-05, SEC-17): nothing is downloaded at runtime, and
``tests/test_fetch.py`` holds every server module to that. It is a tool a person runs.

Standard library only, so it runs before anything else is installed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, TextIO
from urllib.parse import urlparse

from .manifest import ManifestError, parse_manifest, sha256_of

CATALOG = Path(__file__).resolve().parents[2] / "models" / "manifest.verified.json"
"""The checkpoints this can fetch: the verified entries of MODEL_MANIFEST.md, with where to get them."""

_CHUNK = 1024 * 1024
_TIMEOUT_S = 60


class FetchError(Exception):
    """A checkpoint could not be fetched, in words for the person who asked."""


@dataclass(frozen=True)
class Checkpoint:
    """One entry of the verified catalog."""

    id: str
    name: str
    family: str
    size: str
    filename: str
    sha256: str
    bytes: int
    url: str | None
    source: str | None

    def manifest_entry(self) -> dict[str, object]:
        """What the service reads, and where the bytes came from."""
        entry: dict[str, object] = {
            "name": self.name,
            "family": self.family,
            "size": self.size,
            "filename": self.filename,
            "sha256": self.sha256,
            "bytes": self.bytes,
        }
        if self.url is not None:
            entry["url"] = self.url
        return entry


def default_model_dir(
    env: dict[str, str] | None = None, platform: str | None = None, home: Path | None = None
) -> Path:
    """Where checkpoints go when nobody says: per user, outside the repository and every dataset.

    ``%LOCALAPPDATA%\\LazyLabel\\models`` on Windows, ``~/Library/Application Support/LazyLabel/models``
    on macOS, ``${XDG_DATA_HOME:-~/.local/share}/lazylabel/models`` elsewhere. `npm start` looks in
    the same place (`api/src/launcher.ts`), so a fetched model is found without configuring anything.
    """
    environ = os.environ if env is None else env
    platform = sys.platform if platform is None else platform
    home = Path.home() if home is None else home
    if platform == "win32":
        local = environ.get("LOCALAPPDATA", "").strip()
        return (Path(local) if local else home / "AppData" / "Local") / "LazyLabel" / "models"
    if platform == "darwin":
        return home / "Library" / "Application Support" / "LazyLabel" / "models"
    # The XDG spec says a relative XDG_DATA_HOME is invalid and is to be ignored.
    data = environ.get("XDG_DATA_HOME", "").strip()
    return (Path(data) if data.startswith("/") else home / ".local" / "share") / "lazylabel" / "models"


def model_dir(env: dict[str, str] | None = None) -> Path:
    """LAZYLABEL_MODEL_DIR when it is set, as the service reads it, else the per-user default."""
    environ = os.environ if env is None else env
    named = environ.get("LAZYLABEL_MODEL_DIR", "").strip()
    return Path(named).resolve() if named else default_model_dir(environ)


def load_catalog(path: Path = CATALOG) -> list[Checkpoint]:
    """The verified catalog, held to the same rules as the manifest the service reads."""
    try:
        text = path.read_text(encoding="utf-8")
        parse_manifest(text)
    except (OSError, ManifestError) as exc:
        raise FetchError(f"the catalog of verified checkpoints, {path}, could not be read: {exc}") from exc

    checkpoints = []
    for raw in json.loads(text)["models"]:
        url = raw.get("url")
        if url is not None and urlparse(str(url)).scheme not in ("https", "http"):
            raise FetchError(f"{raw['name']} has a url that is not http or https: {url}")
        checkpoints.append(
            Checkpoint(
                id=str(raw.get("id") or raw["name"]),
                name=str(raw["name"]),
                family=str(raw["family"]),
                size=str(raw["size"]),
                filename=str(raw["filename"]),
                sha256=str(raw["sha256"]).lower(),
                bytes=int(raw["bytes"]),
                url=None if url is None else str(url),
                source=None if raw.get("source") is None else str(raw["source"]),
            )
        )
    return checkpoints


def find(catalog: list[Checkpoint], wanted: str) -> Checkpoint:
    """A checkpoint by its id or its name, in any case."""
    key = wanted.strip().lower()
    for checkpoint in catalog:
        if key in (checkpoint.id.lower(), checkpoint.name.lower()):
            return checkpoint
    known = ", ".join(checkpoint.id for checkpoint in catalog)
    raise FetchError(f"there is no checkpoint called {wanted!r}; the ones that can be fetched are {known}")


def human_size(count: int) -> str:
    """898083611 -> '898 MB': decimal units, as a download page states them."""
    if count >= 1_000_000_000:
        return f"{count / 1_000_000_000:.1f} GB"
    if count >= 1_000_000:
        return f"{count / 1_000_000:.0f} MB"
    return f"{count / 1_000:.0f} kB"


def _ask_on_terminal(question: str) -> bool:
    unanswered = "this asks before downloading, and nobody is at a terminal to answer: pass --yes"
    if not sys.stdin.isatty():
        raise FetchError(unanswered)
    try:
        answer = input(question)
    except EOFError:
        # Windows calls NUL a terminal, so `< NUL` passes the check above and answers nothing.
        raise FetchError(unanswered) from None
    return answer.strip().lower() in ("y", "yes")


def fetch(
    checkpoint: Checkpoint,
    directory: Path,
    *,
    yes: bool = False,
    ask: Callable[[str], bool] = _ask_on_terminal,
    out: TextIO = sys.stdout,
    opener: Callable[..., object] = urllib.request.urlopen,
) -> bool:
    """Put `checkpoint` in `directory`, verified, and list it in `directory/manifest.json`.

    False when the person declined. A file of the checkpoint's name that is not the verified one is
    left where it is and reported: legacy deleted and re-downloaded such a file, which silently
    discards whatever a user put there.
    """
    final = directory / checkpoint.filename
    if final.exists():
        problem = _mismatch(final, checkpoint)
        if problem is not None:
            raise FetchError(
                f"{final} is already there and is not the verified {checkpoint.name}: {problem}. "
                "Move it or delete it, and run this again."
            )
        print(f"{checkpoint.name} is already in {directory}, and verified.", file=out)
        merge_into_manifest(directory, checkpoint)
        return True

    if checkpoint.url is None:
        raise FetchError(
            f"{checkpoint.name} has no download: {checkpoint.source or 'no source is recorded'}. "
            f"Put {checkpoint.filename} in {directory} and run this again to check it and list it."
        )

    host = urlparse(checkpoint.url).hostname or checkpoint.url
    if not yes and not ask(f"Download {checkpoint.name} ({human_size(checkpoint.bytes)}) from {host} into {directory}? [y/N] "):
        print("Nothing was downloaded.", file=out)
        return False

    directory.mkdir(parents=True, exist_ok=True)
    part = directory / f"{checkpoint.filename}.part"
    _download(checkpoint, part, out, opener)

    got = part.stat().st_size
    if got < checkpoint.bytes:
        raise FetchError(
            f"the download stopped at {got:,} of {checkpoint.bytes:,} bytes. "
            "Run the same command again: it carries on from there."
        )
    if got > checkpoint.bytes:
        part.unlink()
        raise FetchError(
            f"the server sent {got:,} bytes, and the verified {checkpoint.name} is {checkpoint.bytes:,}. "
            "Nothing was kept; the file at the source may have changed."
        )
    print(f"Checking its SHA-256 ({human_size(checkpoint.bytes)})...", file=out)
    digest = sha256_of(part)
    if digest != checkpoint.sha256:
        part.unlink()
        raise FetchError(
            f"the download hashes to {digest}, and the verified {checkpoint.name} to {checkpoint.sha256}. "
            "Nothing was kept: the download was corrupted, or the file at the source has changed."
        )
    os.replace(part, final)
    manifest = merge_into_manifest(directory, checkpoint)
    print(
        f"Verified {checkpoint.name}: {checkpoint.bytes:,} bytes, SHA-256 {checkpoint.sha256}.\n"
        f"Listed in {manifest}.",
        file=out,
    )
    return True


def _mismatch(path: Path, checkpoint: Checkpoint) -> str | None:
    """Why the file at `path` is not the verified checkpoint, or None when it is."""
    size = path.stat().st_size
    if size != checkpoint.bytes:
        return f"it is {size:,} bytes, and the verified file is {checkpoint.bytes:,}"
    digest = sha256_of(path)
    if digest != checkpoint.sha256:
        return f"it hashes to {digest[:12]}..., and the verified file to {checkpoint.sha256[:12]}..."
    return None


def _download(checkpoint: Checkpoint, part: Path, out: TextIO, opener: Callable[..., object]) -> None:
    """Stream the checkpoint into `part`, resuming what an earlier attempt left there."""
    have = part.stat().st_size if part.exists() else 0
    if have == checkpoint.bytes:
        return  # Everything arrived last time; only the check was left to do.
    if have > checkpoint.bytes:
        part.unlink()
        have = 0

    headers = {"User-Agent": "lazylabel-models"}
    if have > 0:
        headers["Range"] = f"bytes={have}-"
    request = urllib.request.Request(checkpoint.url, headers=headers)
    try:
        response = opener(request, timeout=_TIMEOUT_S)
    except urllib.error.HTTPError as exc:
        if exc.code == 416:
            part.unlink()
            raise FetchError("the server could not resume the earlier download, so it was discarded; run this again") from exc
        raise FetchError(f"{checkpoint.url} answered {exc.code} {exc.reason}") from exc
    except (urllib.error.URLError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise FetchError(f"{checkpoint.url} could not be reached: {reason}") from exc

    with response:
        status = getattr(response, "status", 200)
        if status == 206 and not _resumes_at(response.headers.get("Content-Range", ""), have):
            raise FetchError("the server resumed from somewhere else than asked; run this again")
        if status == 200:
            if have > 0:
                print("The server does not resume downloads, so this one starts again.", file=out)
            have = 0
        elif status != 206:
            raise FetchError(f"{checkpoint.url} answered {status}")

        length = response.headers.get("Content-Length")
        if length is not None and have + int(length) != checkpoint.bytes:
            raise FetchError(
                f"the server offers {have + int(length):,} bytes, and the verified {checkpoint.name} is "
                f"{checkpoint.bytes:,}. Nothing was downloaded; the file at the source may have changed."
            )

        progress = _Progress(checkpoint.bytes, have, out)
        with part.open("ab" if have > 0 else "wb") as handle:
            while chunk := response.read(_CHUNK):
                handle.write(chunk)
                progress.advance(len(chunk))
        progress.finish()


def _resumes_at(content_range: str, have: int) -> bool:
    """Whether `bytes START-END/TOTAL` starts where the part file ends."""
    try:
        unit, spec = content_range.split(" ", 1)
        return unit == "bytes" and int(spec.split("-", 1)[0]) == have
    except ValueError:
        return False


class _Progress:
    """How far the download has got: a line redrawn on a terminal, a line per tenth elsewhere."""

    def __init__(self, total: int, done: int, out: TextIO) -> None:
        self.total, self.done, self.out = total, done, out
        self.redraw = getattr(out, "isatty", lambda: False)()
        self.shown = -1

    def advance(self, count: int) -> None:
        self.done += count
        percent = self.done * 100 // max(self.total, 1)
        step = percent if self.redraw else percent // 10 * 10
        if step != self.shown:
            self.shown = step
            line = f"  {human_size(self.done)} of {human_size(self.total)} ({percent}%)"
            print(f"\r{line}   " if self.redraw else line, end="" if self.redraw else "\n", file=self.out, flush=True)

    def finish(self) -> None:
        if self.redraw:
            print(file=self.out)


def merge_into_manifest(directory: Path, checkpoint: Checkpoint) -> Path:
    """Add `checkpoint` to `directory/manifest.json`, keeping every other entry, and return its path.

    An entry with the same name, or for the same file, is replaced. A manifest that cannot be read
    is left alone and reported rather than overwritten: it may hold entries someone wrote by hand.
    The result is parsed as the service parses it before it is written, and it is written whole
    (a temporary file renamed over it), so the service never meets half a manifest.
    """
    path = directory / "manifest.json"
    document: dict[str, object] = {"models": []}
    if path.exists():
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(document, dict) or not isinstance(document.get("models"), list):
                raise ValueError("it is not an object with a 'models' list")
        except (OSError, ValueError) as exc:
            raise FetchError(
                f"{path} could not be read ({exc}), so it was left as it is. Fix it or move it, and run this again."
            ) from exc

    kept = [
        entry
        for entry in document["models"]
        if not (isinstance(entry, dict) and (entry.get("name") == checkpoint.name or entry.get("filename") == checkpoint.filename))
    ]
    document["models"] = [*kept, checkpoint.manifest_entry()]
    text = json.dumps(document, indent=2) + "\n"
    try:
        parse_manifest(text)
    except ManifestError as exc:
        raise FetchError(f"{path} would not be a manifest the service can read ({exc}), so it was left as it is.") from exc

    temporary = path.with_name("manifest.json.tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)
    return path


def _list(catalog: list[Checkpoint], directory: Path, out: TextIO) -> None:
    print(f"Checkpoints that can be fetched, each checked against its SHA-256, into {directory}:", file=out)
    for checkpoint in catalog:
        installed = (directory / checkpoint.filename).is_file() and (
            (directory / checkpoint.filename).stat().st_size == checkpoint.bytes
        )
        where = urlparse(checkpoint.url).hostname if checkpoint.url else "no download of its own"
        print(
            f"  {checkpoint.id:<20} {checkpoint.name:<19} {human_size(checkpoint.bytes):>7}  {where}"
            + ("  (installed)" if installed else ""),
            file=out,
        )
    print("Fetch one with: npm run ai:models sam2.1-large", file=out)


def main(argv: list[str] | None = None, *, out: TextIO = sys.stdout, err: TextIO = sys.stderr) -> int:
    parser = argparse.ArgumentParser(
        prog="lazylabel-models",
        description="Fetch the checkpoints the AI tools use, verified by SHA-256. Nothing is downloaded "
        "unless you ask here; the inference service never downloads anything.",
    )
    parser.add_argument("--catalog", type=Path, default=CATALOG, help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list", help="the checkpoints that can be fetched, and which are installed")
    listing.add_argument("--dir", type=Path, help="the model folder (default: LAZYLABEL_MODEL_DIR, else per user)")
    getting = commands.add_parser("fetch", help="download one, verify it, and list it in the folder's manifest.json")
    getting.add_argument("name", help="its id or name, such as sam2.1-large")
    getting.add_argument("--dir", type=Path, help="the model folder (default: LAZYLABEL_MODEL_DIR, else per user)")
    getting.add_argument("--yes", action="store_true", help="do not ask before downloading")
    args = parser.parse_args(argv)

    directory = args.dir.resolve() if args.dir is not None else model_dir()
    try:
        catalog = load_catalog(args.catalog)
        if args.command == "list":
            _list(catalog, directory, out)
            return 0
        if not fetch(find(catalog, args.name), directory, yes=args.yes, out=out):
            return 1
    except FetchError as exc:
        print(f"lazylabel-models: {exc}", file=err)
        return 1
    except KeyboardInterrupt:
        print("\nStopped. Run the same command again to carry on from where it stopped.", file=err)
        return 130

    if directory != model_dir():
        print(
            f"npm start looks in {model_dir()}; set LAZYLABEL_MODEL_DIR={directory} to use this folder.",
            file=out,
        )
    else:
        print('npm start "<folder>" now starts the AI tools with the app.', file=out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
