#!/usr/bin/env python3
"""Apply/check/revert the pinned native theme with Python 3; no Git required.

The complete upstream source inventory and both payload states are checked
before any write. User edits, partial patches and different upstream versions
are rejected rather than overwritten. CRLF/LF differences in text are allowed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import tempfile

PACKAGE = Path(__file__).resolve().parents[1]


def canonical(data):
    if b"\0" not in data:
        try:
            data.decode("utf-8")
            return data.replace(b"\r\n", b"\n")
        except UnicodeDecodeError:
            pass
    return data


def digest(data):
    return hashlib.sha256(canonical(data)).hexdigest()


def safe_path(root, relative):
    parts = PurePosixPath(relative)
    if parts.is_absolute() or ".." in parts.parts or "\\" in relative or ":" in relative:
        raise ValueError(f"Unsafe manifest path: {relative}")
    path = root.joinpath(*parts.parts)
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Path leaves source root: {relative}")
    for part in (path, *path.parents):
        if part == root:
            break
        if part.is_symlink():
            raise ValueError(f"Symlink not allowed in patched path: {relative}")
    return path


def load_manifest():
    return json.loads((PACKAGE / "manifest.json").read_text(encoding="utf-8"))


def verify(source, manifest):
    changes = {entry["path"]: entry for entry in manifest["changes"]}
    for entry in changes.values():
        for state in ("before", "after"):
            expected = entry[state]
            if expected is not None:
                payload = safe_path(PACKAGE / "payload" / state, entry["path"])
                if not payload.is_file() or digest(payload.read_bytes()) != expected:
                    raise ValueError(f"Package integrity failure: {state}/{entry['path']}")
    for relative, expected in manifest["source"].items():
        if relative in changes:
            continue
        path = safe_path(source, relative)
        if not path.is_file() or digest(path.read_bytes()) != expected:
            raise ValueError(f"Source differs from {manifest['upstreamTag']}: {relative}")
    states = set()
    for relative, entry in changes.items():
        path = safe_path(source, relative)
        actual = digest(path.read_bytes()) if path.is_file() else None
        if actual == entry["before"]:
            states.add("before")
        elif actual == entry["after"]:
            states.add("after")
        else:
            raise ValueError(f"Local edit or unsupported source; refusing overwrite: {relative}")
    if len(states) != 1:
        raise ValueError("Partially applied patch; restore source from your backup before continuing")
    return states.pop()


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".jellytv-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def change(source, manifest, target):
    previous = {}
    try:
        for entry in manifest["changes"]:
            path = safe_path(source, entry["path"])
            previous[path] = path.read_bytes() if path.exists() else None
            if entry[target] is None:
                path.unlink(missing_ok=True)
            else:
                payload = safe_path(PACKAGE / "payload" / target, entry["path"])
                data = canonical(payload.read_bytes())
                old = previous[path]
                if old and b"\r\n" in old:
                    data = data.replace(b"\n", b"\r\n")
                atomic_write(path, data)
        if verify(source, manifest) != target:
            raise ValueError("Post-write verification failed")
    except BaseException:
        for path, data in previous.items():
            if data is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, data)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "apply", "revert"))
    parser.add_argument("source", type=Path, help="Extracted v0.19.10 source directory")
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    manifest = load_manifest()
    current = verify(source, manifest)
    target = "after" if args.action == "apply" else "before"
    if args.action != "check" and current != target:
        change(source, manifest, target)
        current = target
    state = "APPLIED" if current == "after" else "PRISTINE"
    print(f"PASS {args.action}: {state}; {manifest['upstreamTag']} ({manifest['upstreamCommit']}); "
          f"{len(manifest['source'])} upstream files verified")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
