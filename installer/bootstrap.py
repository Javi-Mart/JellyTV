"""Verified first installation of the host CLI and Enhanced; packaged as a zipapp."""
import argparse
import json
import os
from pathlib import Path
import pkgutil
import re
import stat
import sys
import zipfile

import jellytv as j


def payload(allow_development=False):
    metadata = json.loads(pkgutil.get_data(__name__, 'setup-manifest.json'))
    cli = pkgutil.get_data(__name__, 'jellytv.py')
    bundle = pkgutil.get_data(__name__, 'enhanced.zip')
    j.require(metadata.get('schema') == 1, 'Unknown setup manifest schema')
    for name, data in [('cli', cli), ('bundle', bundle)]:
        expected = metadata.get(name, {})
        j.require(len(data) == expected.get('bytes') and j.digest(data) == expected.get('sha256'), 'Setup payload integrity mismatch: ' + name)
    manifest, assets = j.read_bundle(bundle, allow_development)
    j.require(metadata.get('version') == manifest['version'] and metadata.get('validationStatus') == manifest['validationStatus'], 'Setup and Enhanced versions differ')
    if not allow_development:
        j.require(re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', manifest['version']), 'Normal setup requires an accepted stable version')
    return cli, manifest, assets


def checked_directory(directory):
    j.require(directory.is_absolute(), 'CLI directory must be absolute')
    for part in (directory, *directory.parents):
        j.require(not part.is_symlink() and part.is_dir(), 'CLI directory or parent is missing or a symlink')
        if os.name != 'nt':
            info = part.stat()
            j.require(info.st_uid == os.geteuid() and not info.st_mode & 0o022,
                      'CLI directory and parents must be owned by the current user and not writable by other users')


def inspect_cli(target, data):
    checked_directory(target.parent)
    j.require(target.name == 'jellytv', 'Unexpected CLI filename')
    j.require(not target.is_symlink(), 'Refusing a symlink at the CLI destination')
    if not target.exists():
        return False
    info = target.stat()
    j.require(stat.S_ISREG(info.st_mode) and info.st_size == len(data) and target.read_bytes() == data,
              'Another file or CLI version exists at the destination; nothing overwritten')
    if os.name != 'nt':
        j.require(info.st_uid == os.geteuid() and info.st_mode & 0o777 == 0o755, 'Existing CLI has unexpected ownership or permissions')
    return True


def create_cli(target, data):
    if inspect_cli(target, data):
        return None
    temporary = target.with_name('jellytv.setup.tmp')
    j.require(not temporary.exists() and not temporary.is_symlink(), 'Unknown setup temporary exists; inspect it before retrying')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o700)
    info = os.fstat(descriptor)
    temporary_identity = (info.st_dev, info.st_ino)
    linked = False
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.chmod(temporary, 0o755)
        # Publish without replacement: even a file created after preflight wins.
        os.link(temporary, target)
        linked = True
        info = target.stat()
        j.sync_directory(target.parent)
        return (info.st_dev, info.st_ino)
    except BaseException:
        if linked and not target.is_symlink() and target.stat().st_ino == temporary.stat().st_ino and target.read_bytes() == data:
            target.unlink(); j.sync_directory(target.parent)
        raise
    finally:
        # This temporary was exclusively created by this invocation. Do not
        # remove it if another writer replaced its inode or edited its bytes.
        if temporary.exists() and not temporary.is_symlink():
            info = temporary.stat()
            if (info.st_dev, info.st_ino) == temporary_identity and info.st_size == len(data) and temporary.read_bytes() == data:
                temporary.unlink()


def remove_created_cli(target, data, identity):
    j.require(not target.is_symlink() and target.is_file(), 'CLI changed during setup; preserving destination')
    info = target.stat()
    j.require((info.st_dev, info.st_ino) == identity and target.read_bytes() == data, 'CLI changed during setup; preserving destination')
    target.unlink(); j.sync_directory(target.parent)


def install(manager, target, cli, manifest, assets, dry_run=False):
    """Caller holds the normal installer state lock for preflight and mutation."""
    present = inspect_cli(target, cli)
    j.require(not manager.journal_path.exists(), 'Interrupted Enhanced transaction: run jellytv rollback before setup')
    installed = bool(manager.state and manager.state.get('installed'))
    if installed:
        manager.matching(); manager.verify()
        j.require(manager.state['version'] == manifest['version'] and all(manager.web.read(n) == value for n, value in assets.items()),
                  'Another Enhanced version is already installed; use jellytv update')
        plan = {'action': 'setup', 'alreadyInstalled': True, 'version': manifest['version'], 'files': []}
    else:
        plan = manager.change('install', manifest, assets, dry_run=True)
    result = {**plan, 'action': 'setup', 'dryRun': dry_run, 'cliPath': str(target), 'cliAlreadyPresent': present,
              'coreInstalled': False, 'casaosDetected': manager.web.casaos, 'gpuConfigurationDetected': manager.web.gpu}
    if dry_run:
        return result
    created = create_cli(target, cli)
    try:
        if not installed:
            manager.change('install', manifest, assets)
        j.require(inspect_cli(target, cli), 'CLI disappeared during setup')
        manager.verify()
    except BaseException as error:
        # The native Manager owns Web rollback. Do not initiate a second Web
        # transaction after a conflict, interruption, or failed recovery.
        recovery = manager.journal_path.exists() or bool(manager.state and manager.state.get('installed'))
        # Keep the native installer's phase and recovery diagnosis. Arbitrary
        # exception text can contain command output, so expose only its class.
        reason = str(error) if isinstance(error, j.Refusal) else type(error).__name__
        if created and not recovery:
            try:
                remove_created_cli(target, cli, created)
            except (OSError, j.Refusal) as cleanup:
                raise j.Refusal('Setup failed (' + reason + '); Enhanced reverted, but the CLI destination changed and was preserved for inspection') from cleanup
        detail = 'CLI retained for status/rollback; originals and recovery state preserved' if recovery else 'Enhanced reverted; newly created CLI removed (pre-existing CLI preserved)'
        raise j.Refusal('Setup failed (' + reason + '): ' + detail) from error
    return {**result, 'verified': True, 'cliCreated': created is not None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--allow-development', action='store_true', help='Explicit local preview; never marks the package accepted')
    parser.add_argument('--container'); parser.add_argument('--url'); parser.add_argument('--webroot')
    parser.add_argument('--state-dir', type=Path, default=Path('/var/lib/jellytv'))
    parser.add_argument('--bin-dir', type=Path, default=Path('/usr/local/bin'))
    args = parser.parse_args()
    j.require(sys.platform == 'linux' and sys.version_info >= (3, 9), 'Setup requires Linux and Python 3.9 or newer')
    j.require(os.geteuid() == 0, 'Run setup with sudo python3; it does not install system dependencies')
    cli, manifest, assets = payload(args.allow_development)
    target = args.bin_dir / 'jellytv'
    inspect_cli(target, cli)
    with j.locked(args.state_dir):
        saved = j.read_state(args.state_dir / 'state.json')
        selected = args.container or (saved or {}).get('identity', {}).get('name')
        web = j.DockerWeb(j.discover(selected), args.webroot, args.url)
        manager = j.Manager(web, args.state_dir)
        print(json.dumps(install(manager, target, cli, manifest, assets, args.dry_run), indent=2))


def entrypoint():
    try:
        main()
    except (j.Refusal, OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, j.subprocess.SubprocessError) as error:
        print('JellyTV setup: ' + str(error), file=sys.stderr)
        return 1
    return 0
