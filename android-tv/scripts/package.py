#!/usr/bin/env python3
"""Maintainer tool: generate payload, full source checksums and unified patch."""
import difflib
import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

from theme import PACKAGE, canonical, digest

COMMIT = "984181a3d6ab14e9a6d2dcc850c582e1c138bd95"
source = Path(sys.argv[1]).resolve()
if subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() != COMMIT:
    raise SystemExit("Source must be exactly v0.19.10")
archive = subprocess.check_output(["git", "-C", str(source), "archive", "--format=zip", COMMIT])
version = json.loads((PACKAGE.parent / 'package.json').read_text(encoding='utf-8'))['version']
manifest = {"format": 1, "version": version, "upstreamTag": "v0.19.10", "upstreamCommit": COMMIT,
            "source": {}, "changes": []}
patch = []
allowed_paths = (
    "app/src/", "playback/media3/session/src/",
)
allowed_build_files = {"playback/media3/session/build.gradle.kts", "android-lint.xml"}


def allowed(name):
    return name.startswith(allowed_paths) or name in allowed_build_files


with zipfile.ZipFile(io.BytesIO(archive)) as baseline:
    originals = {name: baseline.read(name) for name in baseline.namelist() if not name.endswith("/")}
    changed = set(subprocess.check_output(["git", "-C", str(source), "diff", "--name-only"], text=True).splitlines())
    added = set(subprocess.check_output(["git", "-C", str(source), "ls-files", "--others", "--exclude-standard"], text=True).splitlines())
    # Generated Gradle diagnostics are excluded; include only reviewed source locations.
    changed |= {name for name in added if allowed(name)}
    for name, data in sorted(originals.items()):
        manifest["source"][name] = digest(data)
    for name in sorted(changed):
        if not allowed(name):
            raise SystemExit(f"Unexpected source change: {name}")
        before = canonical(originals[name]) if name in originals else None
        after = canonical((source / name).read_bytes()) if (source / name).exists() else None
        manifest["changes"].append({"path": name, "before": digest(before) if before is not None else None,
                                    "after": digest(after) if after is not None else None})
        for state, data in (("before", before), ("after", after)):
            if data is not None:
                target = PACKAGE / "payload" / state / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        patch.append(f"diff --git a/{name} b/{name}\n")
        patch.extend(difflib.unified_diff((before or b"").decode().splitlines(keepends=True),
                                         (after or b"").decode().splitlines(keepends=True),
                                         fromfile=f"a/{name}" if before is not None else "/dev/null",
                                         tofile=f"b/{name}" if after is not None else "/dev/null"))
(PACKAGE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
(PACKAGE / "patches" / "jellytv-v0.19.10.patch").write_text("".join(patch), encoding="utf-8", newline="\n")
print(f"Packaged {len(manifest['changes'])} changes; pinned {len(manifest['source'])} source files")
