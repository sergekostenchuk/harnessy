#!/usr/bin/env python3
"""Reject private-owner markers and credential-shaped values from generated artifacts."""
from __future__ import annotations

import json
import re
import struct
import sys
import time
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

MARKER_FILE = Path(__file__).with_name("forbidden-strings.txt")
MAX_CONTAINER_INPUT = 64 * 1024 * 1024
MAX_CONTAINER_OUTPUT = 16 * 1024 * 1024
MAX_TOTAL_EXPANDED = 64 * 1024 * 1024
MAX_UTF16_RUN = 2 * MAX_CONTAINER_OUTPUT
MAX_ASAR_HEADER = 8 * 1024 * 1024
MAX_CONTAINER_DEPTH = 4
MAX_CONTAINER_ENTRIES = 100_000
MAX_SCAN_SECONDS = 120.0
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
GZIP_SIGNATURE = b"\x1f\x8b"
UTF16_LE_ASCII = re.compile(rb"(?:[\x09\x0a\x0d\x20-\x7e]\x00){4}")
UTF16_BE_ASCII = re.compile(rb"(?:\x00[\x09\x0a\x0d\x20-\x7e]){4}")
UNKNOWN_CONTAINER_SUFFIXES = {".7z", ".br", ".bz2", ".rar", ".xz", ".zip", ".zst"}
UNKNOWN_CONTAINER_MAGICS = (
    b"PK\x03\x04",
    b"7z\xbc\xaf\x27\x1c",
    b"Rar!\x1a\x07",
    b"BZh",
    b"\xfd7zXZ\x00",
    b"\x28\xb5\x2f\xfd",
)


@dataclass(frozen=True)
class Marker:
    number: int
    pattern: re.Pattern[bytes]


@dataclass
class ScanBudget:
    deadline: float
    expanded: int = 0
    entries: int = 0

    def check(self, display: str) -> None:
        if time.monotonic() > self.deadline:
            raise ForbiddenOutputError(f"предел времени проверки превышен: {display}")

    def add_expanded(self, size: int, display: str) -> None:
        self.expanded += size
        if self.expanded > MAX_TOTAL_EXPANDED:
            raise ForbiddenOutputError(f"контейнер превышает общий предел распаковки: {display}")

    def add_entry(self, display: str) -> None:
        self.entries += 1
        if self.entries > MAX_CONTAINER_ENTRIES:
            raise ForbiddenOutputError(f"контейнер содержит слишком много записей: {display}")


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


def _record_markers(
    data: bytes,
    display: str,
    markers: list[Marker],
    findings: set[tuple[str, int]],
) -> bool:
    found = False
    for marker in markers:
        if marker.pattern.search(data):
            findings.add((display, marker.number))
            found = True
    return found


def _container_error(display: str, reason: str) -> ForbiddenOutputError:
    return ForbiddenOutputError(f"небезопасный контейнер {display}: {reason}")


def _scan_utf16(
    data: bytes,
    display: str,
    markers: list[Marker],
    findings: set[tuple[str, int]],
    budget: ScanBudget,
) -> bool:
    def record(decoded: str) -> bool:
        encoded = decoded.encode("utf-8")
        budget.add_expanded(len(encoded), display)
        return _record_markers(encoded, display, markers, findings)

    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        if len(data) > MAX_UTF16_RUN:
            raise _container_error(display, "UTF-16 превышает предел размера")
        try:
            return record(data.decode("utf-16", errors="strict"))
        except UnicodeDecodeError as error:
            raise _container_error(display, "повреждённый UTF-16 с BOM") from error

    def text_unit(pair: bytes, encoding: str) -> bool:
        value = int.from_bytes(pair, "little" if encoding == "utf-16le" else "big")
        if value in {0x09, 0x0A, 0x0D} or 0xD800 <= value <= 0xDFFF:
            return True
        return value != 0 and chr(value).isprintable()

    found = False
    for encoding, pattern in (
        ("utf-16le", UTF16_LE_ASCII),
        ("utf-16be", UTF16_BE_ASCII),
    ):
        scanned_until = -1
        for match in pattern.finditer(data):
            if match.start() < scanned_until:
                continue
            start, end = match.start(), match.end()
            while start >= 2 and text_unit(data[start - 2 : start], encoding):
                start -= 2
            while end + 2 <= len(data) and text_unit(data[end : end + 2], encoding):
                end += 2
            scanned_until = end
            if end - start > MAX_UTF16_RUN:
                raise _container_error(display, "UTF-16 превышает предел размера")
            # Битая кодовая единица рядом с секретом не должна отключать проверку: заменяем её U+FFFD
            # и проверяем остальное (с BOM повреждение по-прежнему даёт отказ выше).
            decoded = data[start:end].decode(encoding, errors="replace")
            found = record(decoded) or found
    return found


def _inflate_zlib(data: bytes, display: str, budget: ScanBudget) -> bytes:
    try:
        stream = zlib.decompressobj()
        expanded = stream.decompress(data, MAX_CONTAINER_OUTPUT + 1)
        if len(expanded) > MAX_CONTAINER_OUTPUT or stream.unconsumed_tail:
            raise _container_error(display, "распаковка превышает предел размера")
        expanded += stream.flush()
    except zlib.error as error:
        raise _container_error(display, f"неизвестный поток deflate: {error}") from error
    if len(expanded) > MAX_CONTAINER_OUTPUT:
        raise _container_error(display, "распаковка превышает предел размера")
    if not stream.eof or stream.unused_data:
        raise _container_error(display, "неполный или составной поток deflate")
    budget.add_expanded(len(expanded), display)
    return expanded


def _inflate_gzip(data: bytes, display: str, budget: ScanBudget) -> bytes:
    pending = data
    parts: list[bytes] = []
    total = 0
    members = 0
    while pending:
        budget.check(display)
        if not pending.startswith(GZIP_SIGNATURE):
            raise _container_error(display, "неизвестные данные после gzip")
        members += 1
        if members > 128:
            raise _container_error(display, "слишком много частей gzip")
        try:
            stream = zlib.decompressobj(16 + zlib.MAX_WBITS)
            part = stream.decompress(pending, MAX_CONTAINER_OUTPUT - total + 1)
            if total + len(part) > MAX_CONTAINER_OUTPUT or stream.unconsumed_tail:
                raise _container_error(display, "распаковка превышает предел размера")
            part += stream.flush()
        except zlib.error as error:
            raise _container_error(display, f"неизвестный поток gzip: {error}") from error
        if total + len(part) > MAX_CONTAINER_OUTPUT:
            raise _container_error(display, "распаковка превышает предел размера")
        if not stream.eof:
            raise _container_error(display, "неполный поток gzip")
        parts.append(part)
        total += len(part)
        pending = stream.unused_data
    budget.add_expanded(total, display)
    return b"".join(parts)


def _scan_png(
    data: bytes,
    display: str,
    markers: list[Marker],
    findings: set[tuple[str, int]],
    budget: ScanBudget,
    depth: int,
) -> None:
    position = len(PNG_SIGNATURE)
    chunk_number = 0
    saw_header = False
    saw_end = False
    while position < len(data):
        budget.check(display)
        budget.add_entry(display)
        chunk_number += 1
        if position + 12 > len(data):
            raise _container_error(display, "оборванный PNG-чанк")
        length = struct.unpack_from(">I", data, position)[0]
        kind = data[position + 4 : position + 8]
        if length > MAX_CONTAINER_INPUT:
            raise _container_error(display, "PNG-чанк превышает предел размера")
        end = position + 12 + length
        if end > len(data):
            raise _container_error(display, "размер PNG-чанка выходит за файл")
        payload = data[position + 8 : position + 8 + length]
        expected_crc = struct.unpack_from(">I", data, position + 8 + length)[0]
        actual_crc = zlib.crc32(payload, zlib.crc32(kind)) & 0xFFFFFFFF
        if expected_crc != actual_crc or not re.fullmatch(rb"[A-Za-z]{4}", kind):
            raise _container_error(display, "неизвестный или повреждённый PNG-чанк")
        if chunk_number == 1 and kind != b"IHDR":
            raise _container_error(display, "PNG начинается не с IHDR")
        if kind == b"IHDR":
            if saw_header or length != 13:
                raise _container_error(display, "неверный IHDR")
            saw_header = True
        elif kind == b"tEXt":
            keyword, separator, text = payload.partition(b"\x00")
            if not separator or not keyword:
                raise _container_error(display, "неверный tEXt")
            _scan_blob(text, f"{display}!tEXt[{chunk_number}]", markers, findings, budget, depth + 1)
        elif kind == b"zTXt":
            keyword, separator, rest = payload.partition(b"\x00")
            if not separator or not keyword or len(rest) < 2 or rest[0] != 0:
                raise _container_error(display, "неизвестный zTXt")
            text = _inflate_zlib(rest[1:], f"{display}!zTXt[{chunk_number}]", budget)
            _scan_blob(text, f"{display}!zTXt[{chunk_number}]", markers, findings, budget, depth + 1)
        elif kind == b"iTXt":
            keyword, separator, rest = payload.partition(b"\x00")
            if not separator or not keyword or len(rest) < 4:
                raise _container_error(display, "неверный iTXt")
            compression_flag, compression_method = rest[0], rest[1]
            language, separator, rest = rest[2:].partition(b"\x00")
            translated, separator2, text = rest.partition(b"\x00")
            if not separator or not separator2 or compression_flag not in {0, 1} or compression_method != 0:
                raise _container_error(display, "неизвестный iTXt")
            del language, translated
            if compression_flag:
                text = _inflate_zlib(text, f"{display}!iTXt[{chunk_number}]", budget)
            _scan_blob(text, f"{display}!iTXt[{chunk_number}]", markers, findings, budget, depth + 1)
        elif kind == b"IEND":
            if length != 0:
                raise _container_error(display, "неверный IEND")
            saw_end = True
            position = end
            break
        position = end
    if not saw_header or not saw_end or position != len(data):
        raise _container_error(display, "неполный PNG или данные после IEND")


def _looks_like_asar(data: bytes) -> bool:
    if len(data) < 17:
        return False
    first_payload, header_size = struct.unpack_from("<II", data, 0)
    return first_payload == 4 and 8 <= header_size <= MAX_ASAR_HEADER and data[16:17] == b"{"


def _scan_json_strings(
    value: object,
    display: str,
    markers: list[Marker],
    findings: set[tuple[str, int]],
) -> None:
    if isinstance(value, str):
        _record_markers(value.encode("utf-8"), display, markers, findings)
    elif isinstance(value, list):
        for item in value:
            _scan_json_strings(item, display, markers, findings)
    elif isinstance(value, dict):
        for key, item in value.items():
            _scan_json_strings(str(key), display, markers, findings)
            _scan_json_strings(item, display, markers, findings)


def _scan_asar(
    data: bytes,
    display: str,
    markers: list[Marker],
    findings: set[tuple[str, int]],
    budget: ScanBudget,
    depth: int,
    source_path: Path | None,
) -> None:
    if len(data) < 16:
        raise _container_error(display, "неизвестный заголовок ASAR")
    size_payload, header_size = struct.unpack_from("<II", data, 0)
    if size_payload != 4 or header_size < 8 or header_size > MAX_ASAR_HEADER or 8 + header_size > len(data):
        raise _container_error(display, "неизвестный размер заголовка ASAR")
    header_payload, string_size = struct.unpack_from("<II", data, 8)
    if header_payload + 4 != header_size or string_size > header_payload - 4 or 16 + string_size > 8 + header_size:
        raise _container_error(display, "неизвестный Pickle-заголовок ASAR")
    try:
        header = json.loads(data[16 : 16 + string_size].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise _container_error(display, "неизвестный JSON-заголовок ASAR") from error
    if not isinstance(header, dict) or not isinstance(header.get("files"), dict):
        raise _container_error(display, "в ASAR нет таблицы файлов")
    _scan_json_strings(header, f"{display}!header", markers, findings)
    payload_base = 8 + header_size
    packed: list[tuple[int, int, str]] = []

    def walk(files: dict[object, object], prefix: str = "") -> None:
        for raw_name, raw_info in files.items():
            budget.check(display)
            budget.add_entry(display)
            if not isinstance(raw_name, str) or not raw_name or raw_name in {".", ".."} or any(char in raw_name for char in "/\\\x00"):
                raise _container_error(display, "неизвестное имя записи ASAR")
            logical = f"{prefix}/{raw_name}" if prefix else raw_name
            entry_display = f"{display}!/{logical}"
            _record_markers(logical.encode("utf-8"), entry_display, markers, findings)
            if not isinstance(raw_info, dict):
                raise _container_error(entry_display, "неизвестная запись ASAR")
            if "files" in raw_info:
                children = raw_info.get("files")
                if not isinstance(children, dict) or any(key in raw_info for key in ("size", "offset", "link")):
                    raise _container_error(entry_display, "неизвестный каталог ASAR")
                walk(children, logical)
                continue
            if "link" in raw_info:
                if not isinstance(raw_info.get("link"), str) or any(key in raw_info for key in ("size", "offset")):
                    raise _container_error(entry_display, "неизвестная ссылка ASAR")
                continue
            size = raw_info.get("size")
            offset = raw_info.get("offset")
            if isinstance(size, bool) or not isinstance(size, int) or size < 0:
                raise _container_error(entry_display, "неизвестный файл ASAR")
            if size > MAX_CONTAINER_INPUT:
                raise _container_error(entry_display, "запись ASAR превышает предел размера")
            if raw_info.get("unpacked") is True:
                if source_path is None:
                    raise _container_error(entry_display, "вложенная распакованная запись ASAR")
                unpacked = Path(f"{source_path}.unpacked") / logical
                if not unpacked.is_file():
                    raise _container_error(entry_display, "распакованная запись ASAR отсутствует")
                continue
            if not isinstance(offset, str) or not offset.isdigit():
                raise _container_error(entry_display, "у файла ASAR нет смещения")
            start = payload_base + int(offset)
            end = start + size
            if start < payload_base or end > len(data):
                raise _container_error(entry_display, "запись ASAR выходит за файл")
            packed.append((start, end, entry_display))

    walk(header["files"])
    previous_end = payload_base
    for start, end, entry_display in sorted(packed):
        if start < previous_end and end > start:
            raise _container_error(entry_display, "записи ASAR пересекаются")
        previous_end = max(previous_end, end)
        _scan_blob(data[start:end], entry_display, markers, findings, budget, depth + 1)


def _scan_blob(
    data: bytes,
    display: str,
    markers: list[Marker],
    findings: set[tuple[str, int]],
    budget: ScanBudget,
    depth: int = 0,
    source_path: Path | None = None,
) -> None:
    budget.check(display)
    if _record_markers(data, display, markers, findings):
        return
    if _scan_utf16(data, display, markers, findings, budget):
        return
    suffix = Path(display.split("!", 1)[-1]).suffix.lower()
    is_png = data.startswith(PNG_SIGNATURE) or suffix == ".png"
    is_gzip = data.startswith(GZIP_SIGNATURE) or suffix in {".gz", ".gzip"}
    is_asar = suffix == ".asar" or _looks_like_asar(data)
    if is_png or is_gzip or is_asar:
        if depth >= MAX_CONTAINER_DEPTH:
            raise _container_error(display, "превышен предел вложенности")
        if len(data) > MAX_CONTAINER_INPUT:
            raise _container_error(display, "превышен предел размера")
        if is_png:
            if not data.startswith(PNG_SIGNATURE):
                raise _container_error(display, "неизвестный PNG")
            _scan_png(data, display, markers, findings, budget, depth)
        elif is_gzip:
            if not data.startswith(GZIP_SIGNATURE):
                raise _container_error(display, "неизвестный gzip")
            expanded = _inflate_gzip(data, display, budget)
            _scan_blob(expanded, f"{display}!gzip", markers, findings, budget, depth + 1)
        else:
            _scan_asar(data, display, markers, findings, budget, depth, source_path)
        return
    if suffix in UNKNOWN_CONTAINER_SUFFIXES or any(data.startswith(magic) for magic in UNKNOWN_CONTAINER_MAGICS):
        raise _container_error(display, "неизвестный тип контейнера")
    budget.check(display)


def assert_clean(roots: Iterable[Path], marker_file: Path = MARKER_FILE) -> None:
    markers = load_markers(marker_file)
    marker_path = marker_file.resolve()
    findings: set[tuple[str, int]] = set()
    budget = ScanBudget(time.monotonic() + MAX_SCAN_SECONDS)
    for raw_root in roots:
        root = Path(raw_root)
        for path, display in _files(root):
            budget.check(display)
            if path.resolve() == marker_path:
                continue
            if _record_markers(display.encode("utf-8"), display, markers, findings):
                continue
            try:
                data = path.read_bytes()
            except OSError as error:
                raise ForbiddenOutputError(f"не удалось прочитать выход сборки {display}: {error}") from error
            _scan_blob(data, display, markers, findings, budget, source_path=path)
    if findings:
        lines = [f"{display} (маркер {number})" for display, number in sorted(findings)]
        raise ForbiddenOutputError("запрещённые строки в выходе:\n  " + "\n  ".join(lines))


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
