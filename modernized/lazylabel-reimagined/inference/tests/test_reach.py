"""Which public functions does no production code call? The Python half of the reach guard.

The TypeScript guard (`web/test/reach/unreached.test.ts`) has found eleven functions that were
written, tested and called by nothing. It never scanned this package -- and this package is where
the most serious one was hiding. `assert_weights_only_loading` is SEC-03's runtime check that
`torch.load` will not execute a checkpoint; two docstrings called it "what keeps that true rather
than assumed", and its only caller was a test. With `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` set, a SAM 1
checkpoint would have executed whatever it carried, in production, with CI green.

COMMENTS AND DOCSTRINGS DO NOT COUNT AS USES. The TypeScript guard learned that the hard way: it
once reported a function reached because a comment near it mentioned its name. That lesson is built
in here from the start, by tokenizing rather than by searching text.

Every unreached function is recorded below with the slice it waits for. A new one fails the first
test; a recorded one that becomes reached fails the second, so an excuse cannot outlive its reason.
"""

from __future__ import annotations

import ast
import io
import pathlib
import re
import tokenize

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "src" / "lazylabel_inference"

#: Unreached on purpose, with what each waits for. Long enough to name the rule or the missing piece.
UNREACHED: dict[str, str] = {
    "content_identity": (
        "RULE-091's key allows 'a content hash when the pipeline has already read the bytes'. The "
        "cache keys on size and mtime today, which is correct and cheaper; this waits for a store "
        "whose files have no trustworthy mtime, where content is the only identity left."
    ),
    "estimate_megabytes": (
        "RULE-026's warning when Streaming is turned off on a long sequence. Nothing in the web app "
        "offers a streaming toggle, so there is nothing yet to warn about -- the day one is added, "
        "the estimate is what makes turning it off a choice rather than an out-of-memory."
    ),
    "seed_points": (
        "propagation seeded from CLICKS rather than from a mask the user already drew. Legacy has "
        "the path (`add_video_points`) and it is differential-tested here, but every propagation "
        "this app starts carries the reference frame's own annotation, which is `seed_mask`."
    ),
}


def _code_only(text: str) -> str:
    """The source with comments and docstrings removed, so a mention in prose is not a use."""
    tree = ast.parse(text)
    docstring_lines: set[int] = set()
    for node in ast.walk(tree):
        body = getattr(node, "body", None)
        if not isinstance(body, list) or not body:
            continue
        first = body[0]
        if (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            docstring_lines.update(range(first.lineno, (first.end_lineno or first.lineno) + 1))

    kept = []
    for token in tokenize.generate_tokens(io.StringIO(text).readline):
        if token.type == tokenize.COMMENT:
            continue
        if token.type == tokenize.STRING and token.start[0] in docstring_lines:
            continue
        kept.append(token.string)
    return " ".join(kept)


def _sweep() -> tuple[dict[str, str], list[str]]:
    texts = {path: path.read_text(encoding="utf-8") for path in SOURCE.glob("*.py")}

    declared: dict[str, str] = {}
    for path, text in texts.items():
        for node in ast.parse(text).body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_"):
                declared[node.name] = path.name

    code = " ".join(_code_only(text) for text in texts.values())
    unreached = sorted(
        name
        for name in declared
        # Minus one for its own `def` line, which is the one mention that is never a call.
        if len(re.findall(rf"\b{re.escape(name)}\b", code)) - 1 <= 0
    )
    return declared, unreached


def test_the_sweep_found_the_source() -> None:
    # An empty sweep would make every assertion below vacuously true.
    declared, _unreached = _sweep()

    assert len(declared) > 20


def test_every_unreached_function_is_explained() -> None:
    _declared, unreached = _sweep()

    surprises = [name for name in unreached if name not in UNREACHED]

    assert surprises == [], (
        "these are public, probably tested, and no production code calls them -- which is how "
        "SEC-03's guard sat unused while two docstrings said it was in force. Wire it up, delete "
        f"it, or record why it is waiting: {surprises}"
    )


def test_no_entry_outlives_its_reason() -> None:
    # The other direction. Once something is wired up its excuse has to go, or the next person
    # believes a working feature is still missing.
    declared, unreached = _sweep()

    stale = [name for name in UNREACHED if name in declared and name not in unreached]
    gone = [name for name in UNREACHED if name not in declared]

    assert stale == [], f"these are reached now; remove their entries: {stale}"
    assert gone == [], f"these no longer exist; remove their entries: {gone}"


def test_every_reason_is_a_reason() -> None:
    for name, why in UNREACHED.items():
        assert len(why) > 60, f"{name} does not say what it waits for"


def test_the_weights_only_guard_is_reached() -> None:
    # Pinned by name, because it is the finding that justified this file.
    _declared, unreached = _sweep()

    assert "assert_weights_only_loading" not in unreached
    assert "ensure_weights_only_loading" not in unreached
