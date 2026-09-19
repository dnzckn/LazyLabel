"""Recovering legacy class names without letting the file run code.

The test that matters most is `test_refuses_a_hostile_pickle`. Everything else here is about not
corrupting a dataset; that one is about a converter being pointed at files whose provenance nobody
is sure of, which is the entire reason it exists.
"""

from __future__ import annotations

import io
import json
import pathlib
import zipfile

import numpy as np
import pytest

from lazylabel_converter.aliases import (
    ALIAS_MEMBER,
    JSON_MEMBER,
    NotConvertible,
    UnsafePickle,
    encode_json_member,
    read_legacy_aliases,
    rewrite_archive,
)


def legacy_archive(aliases: object, *, mask_shape: tuple[int, int, int] = (4, 6, 2)) -> bytes:
    """An archive shaped the way legacy writes one: masks, class order, pickled aliases."""
    mask = np.arange(int(np.prod(mask_shape)), dtype=np.uint8).reshape(mask_shape) % 2
    buffer = io.BytesIO()
    np.savez(
        buffer,
        mask=mask,
        class_order=np.array([3, 7], dtype=np.int64),
        class_aliases=np.array(aliases, dtype=object),
    )
    return buffer.getvalue()


class Hostile:
    """A payload that runs a command on unpickling, which is what `allow_pickle=True` permits."""

    def __reduce__(self):
        import os

        return (os.system, ("echo THIS_SHOULD_NEVER_RUN",))


class TestReadingTheTable:
    def test_recovers_the_names(self) -> None:
        result = read_legacy_aliases(legacy_archive({3: "cat", 7: "dog"}))
        assert result.aliases == {3: "cat", 7: "dog"}
        assert result.discarded == 0

    def test_recovers_non_ascii_names(self) -> None:
        result = read_legacy_aliases(legacy_archive({1: "café", 2: "日本語"}))
        assert result.aliases == {1: "café", 2: "日本語"}

    def test_drops_entries_that_are_not_an_id_to_a_name(self) -> None:
        # A converter that coerces a malformed table writes names the user never chose.
        result = read_legacy_aliases(legacy_archive({3: "cat", "seven": "dog", 9: 12, True: "yes"}))
        assert result.aliases == {3: "cat"}
        assert result.discarded == 3

    def test_refuses_an_archive_that_already_has_a_json_table(self) -> None:
        archive = rewrite_archive(legacy_archive({1: "a"}), {1: "a"})
        with pytest.raises(NotConvertible, match="already carries"):
            read_legacy_aliases(archive)

    def test_refuses_an_archive_with_no_alias_table(self) -> None:
        buffer = io.BytesIO()
        np.savez(buffer, mask=np.zeros((2, 2, 1), dtype=np.uint8))
        with pytest.raises(NotConvertible, match="no class-alias table"):
            read_legacy_aliases(buffer.getvalue())

    def test_refuses_a_table_that_is_not_a_mapping(self) -> None:
        with pytest.raises(NotConvertible, match="not a mapping"):
            read_legacy_aliases(legacy_archive(["cat", "dog"]))


class TestNotRunningTheFile:
    def test_refuses_a_hostile_pickle(self, capfd) -> None:
        """The whole reason the allow-list exists.

        `np.load(..., allow_pickle=True)` would execute this. The restricted unpickler refuses at
        `find_class`, before anything is constructed, because `os.system` is not one of the four
        names rebuilding a NumPy array needs.
        """
        archive = legacy_archive(Hostile())

        # The module name is platform-dependent: `os.system` pickles as `posix.system` on Linux
        # and `nt.system` on Windows. The refusal is the same either way, which is the property.
        with pytest.raises(UnsafePickle, match=r"(os|nt|posix)\.system"):
            read_legacy_aliases(archive)

        # And it really did not run: the payload would have printed on the way past.
        assert "THIS_SHOULD_NEVER_RUN" not in capfd.readouterr().out

    def test_the_same_payload_does_execute_under_allow_pickle(self, tmp_path: pathlib.Path) -> None:
        """Proof the threat is real rather than theoretical, so the refusal above means something."""
        path = tmp_path / "hostile.npz"
        path.write_bytes(legacy_archive(Hostile()))

        loaded = np.load(path, allow_pickle=True)
        # os.system returns an exit status, so unpickling yields a number where a dict should be:
        # the payload ran during load.
        assert isinstance(loaded["class_aliases"].item(), int)

    def test_refuses_a_payload_asking_for_any_other_name(self) -> None:
        # Not a blocklist: anything outside the four permitted names is refused, whatever it is.
        class Builtin:
            def __reduce__(self):
                return (dict, ({1: "a"},))

        with pytest.raises(UnsafePickle):
            read_legacy_aliases(legacy_archive(Builtin()))


class TestRewriting:
    def test_replaces_the_pickled_member_with_a_json_one(self) -> None:
        archive = rewrite_archive(legacy_archive({3: "cat"}), {3: "cat"})

        with zipfile.ZipFile(io.BytesIO(archive)) as zf:
            names = set(zf.namelist())
        assert JSON_MEMBER in names
        assert ALIAS_MEMBER not in names

    def test_copies_every_other_member_byte_for_byte(self) -> None:
        original = legacy_archive({3: "cat"})
        converted = rewrite_archive(original, {3: "cat"})

        with zipfile.ZipFile(io.BytesIO(original)) as before, zipfile.ZipFile(io.BytesIO(converted)) as after:
            for name in before.namelist():
                if name == ALIAS_MEMBER:
                    continue
                # The masks are the irreplaceable part. A converter that re-encodes them is a
                # converter that can corrupt them.
                assert before.read(name) == after.read(name), name

    def test_the_converted_archive_still_loads_in_numpy(self) -> None:
        converted = rewrite_archive(legacy_archive({3: "cat", 7: "dog"}), {3: "cat", 7: "dog"})

        # Without allow_pickle, which is the point: the new member is plain data.
        loaded = np.load(io.BytesIO(converted))
        assert json.loads(str(loaded["class_aliases_json"])) == {"3": "cat", "7": "dog"}
        assert loaded["mask"].shape == (4, 6, 2)

    @pytest.mark.parametrize(
        "aliases",
        [{}, {0: "zero"}, {3: "café"}, {1: "日本語", 2: "x" * 200}, {i: f"class {i}" for i in range(50)}],
    )
    def test_the_json_member_round_trips(self, aliases: dict[int, str]) -> None:
        member = encode_json_member(aliases)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            zf.writestr("class_aliases_json.npy", member)

        loaded = np.load(io.BytesIO(buffer.getvalue()))
        assert json.loads(str(loaded["class_aliases_json"])) == {str(k): v for k, v in aliases.items()}

    def test_writes_the_names_in_a_stable_order(self) -> None:
        # Two runs over the same dataset should produce identical bytes, or a diff of a converted
        # folder is noise.
        first = rewrite_archive(legacy_archive({7: "dog", 3: "cat"}), {7: "dog", 3: "cat"})
        second = rewrite_archive(legacy_archive({3: "cat", 7: "dog"}), {3: "cat", 7: "dog"})

        with zipfile.ZipFile(io.BytesIO(first)) as a, zipfile.ZipFile(io.BytesIO(second)) as b:
            assert a.read(JSON_MEMBER) == b.read(JSON_MEMBER)
