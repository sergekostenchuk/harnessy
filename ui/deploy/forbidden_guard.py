#!/usr/bin/env python3
"""Reject private-owner markers and credential-shaped values from generated artifacts."""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

MARKER_FILE = Path(__file__).with_name("forbidden-strings.txt")


@dataclass(frozen=True)
class Marker:
    number: int
    pattern: re.Pattern[bytes]


class ForbiddenOutputError(RuntimeError):
    pass


def load_markers(path: Path = MARKER_FILE) -> list[Marker]:
    markers: list[Marker] = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        kind, separator, value = line.partition(":")
        if not separator or kind not in {"literal", "regex"} or not value:
            raise ForbiddenOutputError(f"неверный маркер в {path.name}:{number}")
        expression = re.escape(value.encode("utf-8")) if kind == "literal" else value.encode("ascii")
        try:
            markers.append(Marker(number, re.compile(expression, re.IGNORECASE)))
        except re.error as error:
            raise ForbiddenOutputError(f"неверный шаблон в {path.name}:{number}: {error}") from error
    if not markers:
        raise ForbiddenOutputError(f"в {path.name} нет маркеров")
    return markers


def _files(root: Path) -> Iterable[tuple[Path, str]]:
    if not root.exists():
        raise ForbiddenOutputError(f"выход сборки не найден: {root}")
    if root.is_file():
        yield root, root.name
        return
    for path in sorted(root.rglob("*")):
        if path.is_file():
            yield path, f"{root.name}/{path.relative_to(root)}"


def assert_clean(roots: Iterable[Path], marker_file: Path = MARKER_FILE) -> None:
    markers = load_markers(marker_file)
    marker_path = marker_file.resolve()
    findings: list[str] = []
    for raw_root in roots:
        root = Path(raw_root)
        for path, display in _files(root):
            if path.resolve() == marker_path:
                continue
            try:
                data = path.read_bytes()
            except OSError as error:
                raise ForbiddenOutputError(f"не удалось прочитать выход сборки {display}: {error}") from error
            for marker in markers:
                if marker.pattern.search(data):
                    findings.append(f"{display} (маркер {marker.number})")
    if findings:
        raise ForbiddenOutputError("запрещённые строки в выходе:\n  " + "\n  ".join(findings))


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: forbidden_guard.py OUTPUT [OUTPUT ...]", file=sys.stderr)
        return 2
    try:
        assert_clean([Path(value) for value in argv])
    except ForbiddenOutputError as error:
        print(f"сборка остановлена: {error}", file=sys.stderr)
        return 1
    print("запрещённые строки: не найдены")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
