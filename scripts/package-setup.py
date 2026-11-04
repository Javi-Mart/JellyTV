"""Package a reproducible first-install zipapp; never publish or assert acceptance."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shlex
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('package_enhanced', ROOT / 'scripts/package-enhanced.py')
enhanced = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(enhanced)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_text(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(value)


def install_command(version, checksum):
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version) or not re.fullmatch(r'[0-9a-f]{64}', checksum):
        raise ValueError('Installation command requires stable version and SHA-256')
    url = f'https://github.com/Javi-Mart/JellyTV/releases/download/v{version}/jellytv-setup-{version}.pyz'
    # Authenticate the bytes again after elevation and execute a private copy.
    # The invoking user still controls the original download directory.
    loader = """import hashlib, os, runpy, stat, sys, tempfile
from pathlib import Path
flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
with os.fdopen(os.open(sys.argv[1], flags), 'rb') as source:
    if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
        raise SystemExit('JellyTV setup needs a regular download file')
    data = source.read(16777217)
if len(data) > 16777216 or hashlib.sha256(data).hexdigest() != sys.argv[2]:
    raise SystemExit('JellyTV setup digest changed before execution')
with tempfile.TemporaryDirectory(prefix='jellytv-setup-', dir='/tmp') as directory:
    archive = Path(directory) / 'setup.pyz'
    archive.write_bytes(data)
    sys.argv = [str(archive), *sys.argv[3:]]
    runpy.run_path(str(archive), run_name='__main__')
"""
    script = ('set -eu; umask 077; t=$(mktemp); trap \'rm -f -- "$t"\' EXIT HUP INT TERM; '
              f'curl --disable --proto "=https" --proto-redir "=https" --tlsv1.2 --fail --location '
              f'--max-time 120 --max-filesize 16777216 --silent --show-error {shlex.quote(url)} -o "$t"; '
              f'printf "%s  %s\\n" {checksum} "$t" | sha256sum --check --status; '
              f'sudo python3 -I -c {shlex.quote(loader)} "$t" {checksum} "$@"')
    return 'sh -c ' + shlex.quote(script) + ' jellytv-setup'


def package(dist, output, development=False):
    # Dedicated immutable output avoids replacing a draft or an earlier candidate.
    if output.exists():
        raise ValueError('Use a new setup output directory; existing artifacts are preserved')
    manifest = json.loads((dist / 'manifest.json').read_text(encoding='utf-8-sig'))
    version = manifest['version']
    if not development and (manifest.get('validationStatus') != 'accepted' or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version)):
        raise ValueError('Acceptance remains open; only --development can package this local candidate')
    # Validate source files and bundle integrity before creating the output folder.
    # A CRLF shebang fails when Linux executes the installed command directly.
    cli = (ROOT / 'installer/jellytv.py').read_bytes().replace(b'\r\n', b'\n')
    bootstrap = (ROOT / 'installer/bootstrap.py').read_bytes().replace(b'\r\n', b'\n')
    if not cli.startswith(b'#!/usr/bin/env python3\n'):
        raise ValueError('Unexpected CLI interpreter')
    for name in enhanced.FILES:
        data = (dist / name).read_bytes()
        if digest(data) != manifest['assets'][name]['sha256'] or len(data) != manifest['assets'][name]['bytes']:
            raise ValueError('Build integrity mismatch: ' + name)
    result = enhanced.package(dist, output, development)
    bundle = Path(result['path']).read_bytes()
    metadata = {'schema': 1, 'version': version, 'validationStatus': manifest['validationStatus'],
                'cli': {'sha256': digest(cli), 'bytes': len(cli)}, 'bundle': {'sha256': digest(bundle), 'bytes': len(bundle)}}
    entries = {'__main__.py': b'import bootstrap\nraise SystemExit(bootstrap.entrypoint())\n',
               'bootstrap.py': bootstrap, 'jellytv.py': cli, 'enhanced.zip': bundle,
               'setup-manifest.json': (json.dumps(metadata, indent=2) + '\n').encode(),
               'LICENSE': (ROOT / 'LICENSE').read_bytes()}
    target = output / f'jellytv-setup-{version}.pyz'
    with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(entries):
            raise ValueError('Setup archive validation failed; output retained for diagnosis')
    checksum = digest(target.read_bytes())
    write_text(target.with_suffix('.pyz.sha256'), f'{checksum}  {target.name}\n')
    # A development archive deliberately has no remote installation command.
    command = None if development else install_command(version, checksum)
    if command:
        write_text(output / 'INSTALL-COMMAND.txt', command + '\n')
    plan = {'version': version, 'validationStatus': manifest['validationStatus'], 'development': development,
            'publication': 'NOT_PUBLISHED', 'coreIncluded': False, 'remoteCommandGenerated': command is not None,
            'artifacts': {p.name: {'sha256': digest(p.read_bytes()), 'bytes': p.stat().st_size} for p in sorted(output.iterdir())},
            'sources': {str(p.relative_to(ROOT)).replace('\\', '/'): digest(p.read_bytes()) for p in
                        [ROOT / 'installer/jellytv.py', ROOT / 'installer/bootstrap.py', ROOT / 'scripts/package-setup.py', ROOT / 'scripts/package-enhanced.py']}}
    write_text(output / 'release-plan.json', json.dumps(plan, indent=2) + '\n')
    return plan


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'dist')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--development', action='store_true')
    args = parser.parse_args()
    print(json.dumps(package(args.dist, args.output, args.development), indent=2))
