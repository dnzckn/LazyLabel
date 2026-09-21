"""The logger, and the one thing `ASSESSMENT.md` 5.4 says it must never do.

Legacy silently DROPPED records whose file names were not encodable, so the events most worth
having never arrived -- a file that could not be written was exactly the file whose log line went
missing. This module's docstring cites that, and nothing tested it: the claim was documented and
undefended.

A LONE SURROGATE is how it actually happens. A filesystem byte sequence that is not valid UTF-8
decodes to one under `surrogateescape`, and it cannot be encoded back -- so anything that writes
naively either raises `UnicodeEncodeError` or loses the record.
"""

from __future__ import annotations

import io
import json

from lazylabel_inference.log import Logger

#: `frames/<lone surrogate>.png`, as an undecodable filename reaches the service.
UNENCODABLE = "frames/\udce9.png"


def captured() -> tuple[list[str], Logger]:
    lines: list[str] = []
    return lines, Logger(sink=lines.append)


class TestARecordThatCannotBeEncoded:
    def test_is_still_logged_rather_than_dropped(self) -> None:
        lines, logger = captured()

        logger.log("error", "could not read", file=UNENCODABLE)

        assert len(lines) == 1

    def test_survives_being_written_to_a_utf8_stream(self) -> None:
        # The line is what reaches stdout. A raw surrogate here raises UnicodeEncodeError on write,
        # which is how legacy lost the record -- the failure happened at the sink, not the format.
        lines, logger = captured()
        logger.log("error", "could not read", file=UNENCODABLE)

        stream = io.TextIOWrapper(io.BytesIO(), encoding="utf-8")
        stream.write(lines[0])
        stream.flush()

    def test_still_parses_as_json_with_the_name_escaped(self) -> None:
        lines, logger = captured()

        logger.log("error", "could not read", file=UNENCODABLE)

        parsed = json.loads(lines[0])
        assert parsed["message"] == "could not read"
        assert "frames/" in parsed["file"]

    def test_keeps_the_correlation_id_that_makes_the_line_findable(self) -> None:
        # A dropped line is bad; a line nobody can join to the request that caused it is not much
        # better, and this is the one case where someone is definitely going looking.
        lines, logger = captured()

        logger.child(correlation_id="abc-123").log("error", "could not read", file=UNENCODABLE)

        assert json.loads(lines[0])["correlationId"] == "abc-123"


class TestOrdinaryRecords:
    def test_carry_the_level_message_and_fields(self) -> None:
        lines, logger = captured()

        logger.log("info", "embedded", image="frames/f01.png")

        assert json.loads(lines[0]) == {
            "level": "info",
            "message": "embedded",
            "image": "frames/f01.png",
        }

    def test_snake_case_fields_arrive_camelCased(self) -> None:
        # One shape across the Node services and this one, so a collector can query one field name.
        lines, logger = captured()

        logger.log("info", "handled", correlation_id="abc")

        assert "correlationId" in json.loads(lines[0])

    def test_a_child_inherits_without_losing_its_own_fields(self) -> None:
        lines, logger = captured()

        logger.child(service="inference").log("info", "handled", path="/health")

        record = json.loads(lines[0])
        assert record["service"] == "inference"
        assert record["path"] == "/health"

    def test_below_the_minimum_level_is_not_logged(self) -> None:
        lines: list[str] = []

        Logger(sink=lines.append, minimum="warn").log("info", "quiet")

        assert lines == []
