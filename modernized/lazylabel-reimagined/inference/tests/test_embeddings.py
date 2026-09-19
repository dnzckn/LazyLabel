"""RULE-091: the embedding cache, and the key that makes invalidation structural."""

from __future__ import annotations

from pathlib import Path

import pytest

from lazylabel_inference.embeddings import (
    DEFAULT_CAPACITY,
    EmbeddingCache,
    EmbeddingKey,
    adjustment_identity,
    content_identity,
    image_identity,
    model_identity,
)


class Clock:
    """A hand-wound clock, so a thirty-minute TTL can be tested in microseconds."""

    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


def key(image: str = "img", model: str = "model:a", adjustments: str = "original") -> EmbeddingKey:
    return EmbeddingKey(image=image, model=model, adjustments=adjustments)


class TestTheKey:
    def test_the_same_image_under_two_models_is_two_entries(self) -> None:
        # The case that matters most. Every SAM 1 variant emits a 256x64x64 embedding, so vit_b
        # features fed to a vit_h decoder are shape-compatible: no error, just a wrong mask.
        cache = EmbeddingCache()
        cache.put(key(model=model_identity("a" * 64)), "features-from-vit-b")
        assert cache.get(key(model=model_identity("b" * 64))) is None
        assert cache.get(key(model=model_identity("a" * 64))) == "features-from-vit-b"

    def test_changing_the_image_bytes_changes_the_key(self, tmp_path: Path) -> None:
        path = tmp_path / "frame.png"
        path.write_bytes(b"first")
        before = image_identity(path)

        # A path is a name for wherever the bytes currently are, not a statement about which bytes.
        path.write_bytes(b"second contents, different length")
        assert image_identity(path) != before

    def test_content_identity_is_exact(self) -> None:
        assert content_identity(b"same") == content_identity(b"same")
        assert content_identity(b"same") != content_identity(b"different")

    def test_display_adjustments_are_part_of_the_key(self) -> None:
        # RULE-089: with Operate On View on, the model encodes the ADJUSTED pixels, and the path
        # does not move when the user drags the brightness slider.
        off = adjustment_identity(None)
        assert off == adjustment_identity({})
        assert adjustment_identity({"brightness": 40.0}) != off
        assert adjustment_identity({"brightness": 40.0}) != adjustment_identity({"brightness": 41.0})

    def test_adjustment_identity_does_not_depend_on_key_order(self) -> None:
        assert adjustment_identity({"brightness": 1.0, "gamma": 2.0}) == adjustment_identity(
            {"gamma": 2.0, "brightness": 1.0}
        )

    def test_the_handle_is_opaque_and_stable(self) -> None:
        handle = key().as_handle()
        assert handle == key().as_handle()
        assert len(handle) == 32
        # Nothing about the image, model or adjustments leaks into the token the client holds.
        assert "img" not in handle and "model" not in handle


class TestTheCache:
    def test_stores_and_returns(self) -> None:
        cache = EmbeddingCache()
        cache.put(key(), "features")
        assert cache.get(key()) == "features"
        assert (cache.hits, cache.misses) == (1, 0)

    def test_a_miss_is_an_outcome_not_an_error(self) -> None:
        cache = EmbeddingCache()
        assert cache.get(key()) is None
        assert cache.misses == 1

    def test_evicts_the_least_recently_used(self) -> None:
        cache = EmbeddingCache(capacity=3)
        for name in ("a", "b", "c"):
            cache.put(key(image=name), name)

        cache.get(key(image="a"))  # a is now the most recently used
        cache.put(key(image="d"), "d")

        assert cache.get(key(image="b")) is None  # b was the oldest
        assert cache.get(key(image="a")) == "a"
        assert cache.evictions == 1

    def test_keeps_ten_by_default_as_the_rule_says(self) -> None:
        assert DEFAULT_CAPACITY == 10
        cache = EmbeddingCache()
        for i in range(15):
            cache.put(key(image=str(i)), i)
        assert len(cache) == 10
        assert cache.get(key(image="0")) is None
        assert cache.get(key(image="14")) == 14

    def test_expires_on_idle(self) -> None:
        clock = Clock()
        cache = EmbeddingCache(ttl_seconds=1800, now=clock)
        cache.put(key(), "features")

        clock.advance(1799)
        assert cache.get(key()) == "features"

        clock.advance(2)
        assert cache.get(key()) is None
        assert cache.expirations == 1

    def test_re_putting_refreshes_the_age(self) -> None:
        clock = Clock()
        cache = EmbeddingCache(ttl_seconds=100, now=clock)
        cache.put(key(), "v1")
        clock.advance(90)
        cache.put(key(), "v2")
        clock.advance(90)

        # 180 seconds after the first store, but only 90 after the second.
        assert cache.get(key()) == "v2"

    def test_a_read_does_not_refresh_the_age(self) -> None:
        # LRU ordering and TTL are different clocks: touching an entry keeps it from being evicted,
        # but it does not make stale features fresh.
        clock = Clock()
        cache = EmbeddingCache(ttl_seconds=100, now=clock)
        cache.put(key(), "features")
        clock.advance(60)
        assert cache.get(key()) == "features"
        clock.advance(60)
        assert cache.get(key()) is None

    def test_invalidating_a_model_drops_only_its_entries(self) -> None:
        cache = EmbeddingCache()
        cache.put(key(image="a", model="m1"), 1)
        cache.put(key(image="b", model="m1"), 2)
        cache.put(key(image="a", model="m2"), 3)

        assert cache.invalidate_model("m1") == 2
        assert cache.get(key(image="a", model="m2")) == 3
        assert len(cache) == 1

    def test_refuses_a_cache_that_cannot_hold_anything(self) -> None:
        with pytest.raises(ValueError):
            EmbeddingCache(capacity=0)
