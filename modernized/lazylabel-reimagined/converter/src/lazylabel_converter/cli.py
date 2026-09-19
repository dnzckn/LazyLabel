"""Convert a folder of legacy NPZ files so their class names survive the move to the web app.

    lazylabel-convert-aliases <source folder> <destination folder>

The architecture's constraints, and each is load-bearing rather than ceremony:

  - it writes to a NEW path and never in place, so a conversion that goes wrong costs nothing;
  - it is a separate short-lived process, so the permission to unpickle does not live in a service
    that stays running;
  - it has no network access to lose, because it makes no network calls;
  - it is the only component permitted to load pickle, and even here the allow-list is four names.

It converts only what it can prove it understands. A file whose alias table asks for anything
outside that allow-list is REPORTED AND SKIPPED, never partially written, and the summary at the
end distinguishes "converted", "did not need it" and "refused" so a folder of ten thousand images
does not hide one refusal in a wall of dots.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

from .aliases import NotConvertible, UnsafePickle, read_legacy_aliases, rewrite_archive


@dataclass
class Summary:
    converted: list[str] = field(default_factory=list)
    already_json: list[str] = field(default_factory=list)
    no_aliases: list[str] = field(default_factory=list)
    refused: list[tuple[str, str]] = field(default_factory=list)
    failed: list[tuple[str, str]] = field(default_factory=list)

    @property
    def considered(self) -> int:
        return (
            len(self.converted)
            + len(self.already_json)
            + len(self.no_aliases)
            + len(self.refused)
            + len(self.failed)
        )


def convert_tree(source: Path, destination: Path) -> Summary:
    """Convert every .npz under `source`, writing the result under `destination`.

    The tree shape is preserved, so a converted dataset can be dropped in beside the images it
    belongs to. Files that are not .npz are not copied: this is a converter, not a backup tool, and
    quietly duplicating a hundred gigabytes of images would be a surprising thing for it to do.
    """
    summary = Summary()

    for path in sorted(source.rglob("*.npz")):
        relative = path.relative_to(source)
        name = relative.as_posix()

        try:
            archive = path.read_bytes()
        except OSError as exc:
            summary.failed.append((name, str(exc)))
            continue

        try:
            result = read_legacy_aliases(archive)
        except UnsafePickle as exc:
            # The one outcome that must never be quiet. A refused file keeps its names until
            # somebody looks at why.
            summary.refused.append((name, str(exc)))
            continue
        except NotConvertible as exc:
            reason = str(exc)
            if "already carries" in reason:
                summary.already_json.append(name)
            else:
                summary.no_aliases.append(name)
            continue

        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            # Written whole, then moved into place, so an interrupted run cannot leave a half
            # archive where a good one is expected.
            temporary = target.with_suffix(target.suffix + ".partial")
            temporary.write_bytes(rewrite_archive(archive, result.aliases))
            temporary.replace(target)
        except OSError as exc:
            summary.failed.append((name, str(exc)))
            continue

        note = f" ({result.discarded} unusable entries dropped)" if result.discarded else ""
        summary.converted.append(f"{name}: {len(result.aliases)} names{note}")

    return summary


def report(summary: Summary, out=sys.stdout) -> None:
    print(f"{summary.considered} archives considered", file=out)
    print(f"  converted       {len(summary.converted)}", file=out)
    print(f"  already JSON    {len(summary.already_json)}", file=out)
    print(f"  no alias table  {len(summary.no_aliases)}", file=out)
    print(f"  REFUSED         {len(summary.refused)}", file=out)
    print(f"  failed          {len(summary.failed)}", file=out)

    for name, reason in summary.refused:
        print(f"\nrefused: {name}\n  {reason}", file=out)
    for name, reason in summary.failed:
        print(f"\nfailed: {name}\n  {reason}", file=out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="lazylabel-convert-aliases",
        description=(
            "Rewrite legacy LazyLabel NPZ class-alias tables as JSON, so the web app can read the "
            "class names. Writes to a new folder and never modifies the source."
        ),
    )
    parser.add_argument("source", type=Path, help="folder holding the .npz files to read")
    parser.add_argument("destination", type=Path, help="folder to write the converted copies into")
    args = parser.parse_args(argv)

    if not args.source.is_dir():
        print(f"{args.source} is not a folder", file=sys.stderr)
        return 2
    if args.destination.resolve() == args.source.resolve():
        # In-place conversion is the one thing the architecture forbids outright.
        print("the destination must not be the source; this converter never writes in place", file=sys.stderr)
        return 2

    summary = convert_tree(args.source, args.destination)
    report(summary)

    # A refusal is not a crash, but it is not a success either: the exit status has to say so, or a
    # script that runs this over a dataset will not notice.
    return 1 if summary.refused or summary.failed else 0


if __name__ == "__main__":
    sys.exit(main())
