#!/usr/bin/env python3
"""Package the exact official 10.10.6 sources with the three reviewed patches."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
COMMIT = 'c335a3024e436fb347078d4f657ba647647676e6'
UPSTREAM_SHA256 = '4ae71da0aa45bbd428a5c4989d4ea4d4e8ffc1963119c5ec0ff64dfa4d9a7d97'
PATCHES = ('scroll-options-10.10.6', 'quick-connect-10.10.6', 'navigation-10.10.6')
STAMP = (2026, 10, 28, 0, 0, 0)


def apply_patch(original, patch):
    lines = original.decode('utf-8').splitlines(keepends=True)
    output, cursor, active, hunks = [], 0, False, 0
    for line in patch.splitlines(keepends=True):
        match = re.match(r'@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@', line)
        if match:
            start = int(match[1]) - 1
            if start < cursor:
                raise ValueError('Overlapping source patch')
            output.extend(lines[cursor:start])
            cursor, active, hunks = start, True, hunks + 1
        elif active and line.startswith((' ', '-')):
            if cursor >= len(lines) or lines[cursor] != line[1:]:
                raise ValueError('Patch context differs from pinned source')
            if line[0] == ' ':
                output.append(lines[cursor])
            cursor += 1
        elif active and line.startswith('+'):
            output.append(line[1:])
    if not hunks:
        raise ValueError('Empty source patch')
    output.extend(lines[cursor:])
    return ''.join(output).encode('utf-8')


def package(source_zip, output_dir):
    data = source_zip.read_bytes()
    if hashlib.sha256(data).hexdigest() != UPSTREAM_SHA256:
        raise ValueError('Expected the exact reviewed codeload archive; unknown bytes rejected')
    files, modes = {}, {}
    prefix = f'jellyfin-web-{COMMIT}/'
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.testzip() is not None:
            raise ValueError('Invalid upstream ZIP CRC')
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            if not entry.filename.startswith(prefix):
                raise ValueError('Unexpected source archive prefix')
            name = entry.filename[len(prefix):]
            path = PurePosixPath(name)
            mode = entry.external_attr >> 16
            if name in files or path.is_absolute() or '..' in path.parts or '\\' in name or mode & 0o170000 == 0o120000:
                raise ValueError('Unsafe or duplicate source entry')
            files[name], modes[name] = archive.read(entry), mode
    if json.loads(files['package.json'])['version'] != '10.10.6':
        raise ValueError('Incorrect upstream version')
    for name in ('LICENSE', 'README.md', 'package-lock.json', 'webpack.prod.js'):
        if name not in files:
            raise ValueError('Incomplete build source archive')
    changes = []
    for patch_name in PATCHES:
        patch_bytes = (ROOT / f'web-compat/{patch_name}.patch').read_bytes()
        patch = patch_bytes.decode('utf-8').replace('\r\n', '\n')
        name = re.search(r'^\+\+\+ b/(.+)$', patch, re.M)[1]
        original = files[name]
        files[name] = apply_patch(original, patch)
        changes.append({'file': name, 'originalSha256': hashlib.sha256(original).hexdigest(),
                        'patchedSha256': hashlib.sha256(files[name]).hexdigest(),
                        'patch': patch_name + '.patch', 'patchSha256': hashlib.sha256(patch_bytes).hexdigest()})
        files[f'jellytv-patches/{patch_name}.patch'] = patch.encode('utf-8')
    files['JELLYTV-COMPATIBILITY.md'] = (
        '# Jellyfin Web 10.10.6 compatibility sources\n\n'
        f'Official upstream commit: {COMMIT}\n'
        f'Source: https://github.com/jellyfin/jellyfin-web/tree/{COMMIT}\n\n'
        'GPL-2.0: see LICENSE. Full upstream sources, build scripts, README and locked dependencies are included.\n'
        'Changes: scrollTo(options) feature detection returns auto; Quick Connect handles only its expected undefined dialog cancellation; abandoned route effects cancel their own outstanding view.\n'
        'Patch copies are in jellytv-patches/. Their exact sources are modified in this archive.\n'
        'Follow upstream README.md and package.json build commands. A full build may produce different output filenames/hashes.\n'
        'The separate JellyTV binary applicators preserve the rest of the official bundles byte for byte.\n'
        'No full upstream rebuild is claimed by this archive. JellyTV 1.1 acceptance remains open.\n'
    ).encode('utf-8')
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / 'jellyfin-web-10.10.6-compat-source.zip'
    temporary = target.with_suffix('.zip.tmp')
    if temporary.exists():
        raise ValueError('Unknown temporary exists; inspect before retrying')
    try:
        with zipfile.ZipFile(temporary, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, contents in sorted(files.items()):
                entry = zipfile.ZipInfo(name, STAMP)
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = modes.get(name, 0o100644) << 16
                archive.writestr(entry, contents)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None or set(archive.namelist()) != set(files):
                raise ValueError('Generated source archive validation failed')
            for name, contents in files.items():
                if archive.read(name) != contents:
                    raise ValueError('Generated source contents changed')
        temporary.replace(target)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    record = {'upstreamCommit': COMMIT, 'upstreamArchiveSha256': UPSTREAM_SHA256,
              'upstreamURL': f'https://codeload.github.com/jellyfin/jellyfin-web/zip/{COMMIT}',
              'file': target.name, 'bytes': target.stat().st_size, 'files': len(files),
              'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'modifiedSources': changes,
              'status': 'source contents and CRC verified; full upstream rebuild not performed; JellyTV acceptance open'}
    (output_dir / 'source-manifest-10.10.6.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    return record


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_zip', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'web-compat')
    args = parser.parse_args()
    print(json.dumps(package(args.source_zip, args.output), indent=2))
