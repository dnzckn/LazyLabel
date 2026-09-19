"""Structured JSON logging with a correlation id.

The same shape the Node services emit, so one request's browser line, API line and inference line
line up by correlation id. `AI_NATIVE_SPEC.md` section 4 requires the id to reach this service, and
`ASSESSMENT.md` 5.4 records what it is replacing: a logger that silently dropped records whose file
names were not encodable, so the events most worth having never arrived.

Hence the fallback in `_render`. A record that cannot be serialized still produces a line saying so.
Silence is the one outcome that is not allowed.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from typing import Any, Callable

_ORDER = {"debug": 10, "info": 20, "warn": 30, "error": 40}


@dataclass(frozen=True)
class Logger:
    sink: Callable[[str], None] = lambda line: print(line, file=sys.stdout, flush=True)
    base: dict[str, Any] = field(default_factory=dict)
    minimum: str = "info"

    def log(self, level: str, message: str, **fields: Any) -> None:
        if _ORDER.get(level, 0) < _ORDER.get(self.minimum, 0):
            return
        record = {"level": level, "message": message, **self.base, **fields}
        self.sink(_render({_camel(k): v for k, v in record.items()}))

    def child(self, **fields: Any) -> "Logger":
        return Logger(self.sink, {**self.base, **fields}, self.minimum)


def _camel(name: str) -> str:
    """snake_case to camelCase.

    Python code writes ``correlation_id``; the Node services emit ``correlationId``. The field name
    is what a log aggregator groups by, so one request's browser, API and inference lines only line
    up if all three spell it the same way. Converting here keeps the call sites idiomatic Python and
    the output identical to the other two services.
    """
    head, *rest = name.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in rest)


def _render(record: dict[str, Any]) -> str:
    try:
        return json.dumps(record, default=str)
    except (TypeError, ValueError) as exc:
        return json.dumps(
            {
                "level": "error",
                "message": "a log record could not be serialized",
                "reason": str(exc),
                "original": str(record.get("message", "")),
            }
        )


silent_logger = Logger(sink=lambda line: None)
