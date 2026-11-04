#!/usr/bin/env python3
"""Bundle the verified debug APK with its complete corresponding source archive."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

package = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('--validation', type=Path, default=package / 'evidence/validation.json')
parser.add_argument('--output', type=Path, default=package / 'dist')
args = parser.parse_args()
source = args.source.resolve()
subprocess.run([sys.executable, str(package / 'scripts/theme.py'), 'check', str(source)], check=True)
manifest = json.loads((package / 'manifest.json').read_text(encoding='utf-8'))
validation = json.loads(args.validation.read_text(encoding='utf-8'))
if validation['lint']['status'] != 'PASS' or validation['unitTests']['status'] != 'PASS':
    raise SystemExit('Build evidence must pass before bundling')
apk_record, = validation['apk']
if apk_record['file'] != f'jellyfin-androidtv-v{manifest["androidVersion"]}-debug.apk':
    raise SystemExit('Validated APK filename does not match the Android version')
apk = source / 'app/build/outputs/apk/debug' / apk_record['file']
if hashlib.sha256(apk.read_bytes()).hexdigest() != apk_record['sha256']:
    raise SystemExit('APK differs from validated build')
output = args.output
output.mkdir(parents=True, exist_ok=False)
shutil.copyfile(apk, output / apk.name)
archive = subprocess.check_output(['git', '-C', str(source), 'archive', '--format=zip', manifest['upstreamCommit']])
with zipfile.ZipFile(io.BytesIO(archive)) as upstream:
    files = {name: upstream.read(name) for name in upstream.namelist() if not name.endswith('/')}
    modes = {info.filename: info.external_attr for info in upstream.infolist()}
for change in manifest['changes']:
    if change['after'] is None:
        files.pop(change['path'], None)
    else:
        files[change['path']] = (package / 'payload/after' / change['path']).read_bytes()
files['JELLYTV-LINT.md'] = (package / 'docs/lint-decisions.md').read_bytes()
files['JELLYTV.md'] = (f'# JellyTV {manifest["version"]} debug source\n\n'
    f'Based on Jellyfin Android TV {manifest["upstreamTag"]}, commit {manifest["upstreamCommit"]}.\n'
    'Contains all upstream source and the JellyTV modifications used for the accompanying APK.\n'
    'License: GNU GPL version 2 (see LICENSE). Requires JDK 21 and Android SDK 36.\n'
    f'Build: ./gradlew --no-build-cache -Pjellyfin.version={manifest["androidVersion"]} assembleDebug lintDebug testDebugUnitTest\n'
    'Debug signing keys are generated locally by Android tooling and are not included.\n').encode()
source_archive = output / (apk.stem.removesuffix('-debug') + '-source.zip')
with zipfile.ZipFile(source_archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
    for name, content in sorted(files.items()):
        info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = modes.get(name, 0o100644 << 16)
        target.writestr(info, content)
records = [{'file': file.name, 'bytes': file.stat().st_size,
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest()} for file in [output / apk.name, source_archive]]
for record in records:
    (output / (record['file'] + '.sha256')).write_text(f'{record["sha256"]}  {record["file"]}\n', encoding='utf-8', newline='\n')
(output / 'manifest.json').write_text(json.dumps({'version': manifest['version'], 'androidVersion': manifest['androidVersion'], 'kind': 'debug-validation',
    'upstreamCommit': manifest['upstreamCommit'], 'files': records}, indent=2) + '\n', encoding='utf-8')
print(json.dumps(records, indent=2))
