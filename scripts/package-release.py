#!/usr/bin/env python3
"""Package the reviewed source, builds, documentation and public evidence only."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8-sig'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


version = read('package.json')['version']
assert version == '1.0.0', 'Only package the reviewed 1.0.0 delivery'
web = read('dist/manifest.json')
assert web['version'] == version
compatibility = [dict(patch=name, file=read(f'web-compat/{name}.json')['file'],
                      sha256=read(f'web-compat/{name}.json')['patchedSha256'])
                 for name in ['quick-connect', 'navigation']]


def check_host(report):
    assert report.get('navigationCompatibility', report.get('hostCompatibility')) == compatibility, 'Stale host compatibility evidence'


for name, record in web['assets'].items():
    assert sha(ROOT / 'dist' / name) == record['sha256'], name

# Every required browser report must refer to this exact final asset manifest.
suites = {'enhanced-chrome': (78, 0), 'core-chrome': (65, 13),
          'enhanced-chromium': (18, 0), 'enhanced-edge': (18, 0),
          'enhanced-firefox': (12, 0), 'enhanced-webkit': (18, 0),
          'core-chromium': (15, 3), 'core-edge': (15, 3),
          'core-firefox': (10, 2), 'core-webkit': (15, 3),
          'enhanced-lifecycle': (4, 0), 'extended-chrome': (7, 2)}
for name, (passed, skipped) in suites.items():
    report = read(f'docs/validation/{name}.json')
    assert report['build'] == web, f'{name}: stale build'
    check_host(report)
    assert report['counts'] == dict(passed=passed, failed=0, skipped=skipped, flaky=0, setupFailures=0), name
    for test in report['tests']:
        diagnostic = test.get('diagnostics')
        if diagnostic:
            assert diagnostic['unexpected'] == diagnostic['unhandledRejections'] == 0, name
for name in ['core-all', 'authentication', 'session', 'performance']:
    report = read(f'docs/validation/{name}.json')
    assert report['status'].startswith('PASS') and report['build'] == web, name
    check_host(report)
assert read('docs/validation/administration.json')['status'].startswith('PASS')
check_host(read('docs/validation/administration.json'))
race = read('docs/validation/navigation-race.json')
check_host(race)
assert len(race['runs']) == 6 and all(run['delayed'] and run['homeVisible'] == 1 and run['detailVisible'] == 0 for run in race['runs'])
assert read('docs/validation/release-check.json')['status'] == 'PASS'
assert read('docs/validation/release-check.json')['build'] == web
compat_source = read('web-compat/source-manifest.json')
assert sha(ROOT / 'web-compat' / compat_source['file']) == compat_source['sha256']

native = read('android-tv/evidence/validation.json')
assert native['lint']['status'] == native['unitTests']['status'] == 'PASS'
apk, = native['apk']
assert sha(ROOT / 'android-tv/dist' / apk['file']) == apk['sha256']
for resolution in ['1080', '4k']:
    report = read(f'android-tv/evidence/runtime-{resolution}.json')
    assert report['installedApkSha256'] == apk['sha256']
    assert report['status'] == 'PASS' and len(report['checks']) == 8
    assert all(check['status'] == 'PASS' for check in report['checks'])
native_bundle = read('android-tv/dist/manifest.json')
assert native_bundle['version'] == version
for record in native_bundle['files']:
    assert sha(ROOT / 'android-tv/dist' / record['file']) == record['sha256']

folders = ['theme', 'enhanced', 'scripts', 'tests', 'docs', 'web-compat', 'dist', 'android-tv']
top_files = ['README.md', 'FINAL_REPORT.md', 'CHANGELOG.md', 'LICENSE', 'package.json',
             'package-lock.json', 'eslint.config.mjs', '.stylelintrc.json', '.gitignore',
             'playwright.config.mjs', 'playwright.lifecycle.config.mjs']
files = [ROOT / name for name in top_files]
for folder in folders:
    for path in (ROOT / folder).rglob('*'):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if path.suffix in {'.log', '.pyc'} or path.name.endswith('.local.json'):
            continue
        if any(part in {'__pycache__', '.gradle', 'node_modules', '.git', '.lab'} for part in relative.parts):
            continue
        assert not path.is_symlink(), f'Unexpected symlink: {relative}'
        files.append(path)

output = ROOT / 'releases'
output.mkdir(exist_ok=True)
archive = output / f'JellyTV-{version}.zip'
records = []
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
    for path in sorted(files):
        relative = path.relative_to(ROOT).as_posix()
        records.append({'file': relative, 'bytes': path.stat().st_size, 'sha256': sha(path)})
        info = zipfile.ZipInfo(f'JellyTV-{version}/{relative}', (2026, 10, 22, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        target.writestr(info, path.read_bytes())
with zipfile.ZipFile(archive) as check:
    assert check.testzip() is None, 'Archive CRC check failed'
manifest = {'version': version, 'file': archive.name, 'bytes': archive.stat().st_size,
            'sha256': sha(archive), 'files': records}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: value for key, value in manifest.items() if key != 'files'}))
print(f'{len(records)} allowlisted files; archive CRC verified')
