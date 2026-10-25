#!/usr/bin/env python3
"""Archive corresponding Web sources with the two reviewed compatibility patches."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='Unmodified source tree of Web commit 61b1f890365ad15138e943e694af723c1d47df2a')
source = parser.parse_args().source.resolve()
assert json.loads((source / 'package.json').read_text(encoding='utf-8'))['version'] == '12.2.0'


def patched(original, patch):
    lines = original.splitlines(keepends=True)
    output, cursor, active = [], 0, False
    for line in patch.splitlines(keepends=True):
        match = re.match(r'@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@', line)
        if match:
            start = int(match[1]) - 1
            assert start >= cursor
            output.extend(lines[cursor:start])
            cursor, active = start, True
        elif active and line.startswith((' ', '-')):
            assert lines[cursor] == line[1:], 'Patch context differs from pinned source'
            if line[0] == ' ':
                output.append(lines[cursor])
            cursor += 1
        elif active and line.startswith('+'):
            output.append(line[1:])
    output.extend(lines[cursor:])
    return ''.join(output).encode()


changes = {}
for patch_name in ['quick-connect', 'navigation']:
    patch = (root / f'web-compat/{patch_name}.patch').read_text(encoding='utf-8')
    name = re.search(r'^\+\+\+ b/(.+)$', patch, re.M)[1]
    assert '..' not in Path(name).parts and not Path(name).is_absolute()
    changes[name] = patched((source / name).read_text(encoding='utf-8'), patch)

archive = root / 'web-compat/jellyfin-web-12.2-compat-source.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
    for path in sorted(source.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        assert not path.is_symlink() and not any(part in {'node_modules', '.git', '.env'} for part in relative.parts)
        name = relative.as_posix()
        info = zipfile.ZipInfo(name, (2026, 10, 22, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        target.writestr(info, changes.get(name, path.read_bytes()))
    info = zipfile.ZipInfo('JELLYTV-COMPATIBILITY.md', (2026, 10, 22, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    target.writestr(info, '# Web 12.2 compatibility source\n\nBased on commit 61b1f890365ad15138e943e694af723c1d47df2a.\nContains the Quick Connect cancellation and stale navigation cleanup corrections.\nGPL-2.0: see LICENSE. Build instructions and locked dependencies: README.md, package.json and package-lock.json.\nPinned binary applicators preserve the remaining official bundle bytes; full recompilation can produce different hashes/names.\n')
record = dict(upstreamCommit='61b1f890365ad15138e943e694af723c1d47df2a', file=archive.name,
              bytes=archive.stat().st_size, sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
              modifiedSources=[dict(file=name, sha256=hashlib.sha256(data).hexdigest()) for name, data in changes.items()])
(root / 'web-compat/source-manifest.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
print(json.dumps(record))
