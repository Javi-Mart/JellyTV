"""Distribution integrity, version gates and executable zipapp checks."""
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('setup_packager', ROOT / 'scripts/package-setup.py')
p = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(p)


class SetupPackageTests(unittest.TestCase):
    def setUp(self):
        parent = ROOT / '.lab/bootstrap-package-unit'; parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=parent)
        assert Path(self.temp.name).resolve().parent == parent.resolve()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.dist = self.root / 'dist'; self.dist.mkdir()
        assets = {'jellytv-enhanced.css': b'body{color:white}', 'jellytv-enhanced.js': b'/* local fixture */'}
        self.manifest = {'version': '1.1.0-dev.0', 'validationStatus': 'development', 'webVersions': ['10.10.6'],
                         'assets': {name: {'bytes': len(data), 'sha256': p.digest(data)} for name, data in assets.items()}}
        for name, data in assets.items(): (self.dist / name).write_bytes(data)
        self.save_manifest()

    def save_manifest(self):
        (self.dist / 'manifest.json').write_text(json.dumps(self.manifest))

    def test_development_needs_explicit_flag_and_generates_no_remote_command(self):
        output = self.root / 'blocked'
        with self.assertRaises(ValueError): p.package(self.dist, output)
        self.assertFalse(output.exists())
        plan = p.package(self.dist, self.root / 'allowed', True)
        self.assertFalse(plan['remoteCommandGenerated']); self.assertFalse(plan['coreIncluded'])
        self.assertFalse((self.root / 'allowed/INSTALL-COMMAND.txt').exists())

    def test_zipapp_is_deterministic_allowlisted_and_runs_help(self):
        for name in ['first', 'second']: p.package(self.dist, self.root / name, True)
        name = 'jellytv-setup-1.1.0-dev.0.pyz'
        first = self.root / 'first' / name; second = self.root / 'second' / name
        self.assertEqual(first.read_bytes(), second.read_bytes())
        with zipfile.ZipFile(first) as z:
            self.assertIsNone(z.testzip())
            self.assertEqual(set(z.namelist()), {'__main__.py', 'bootstrap.py', 'jellytv.py', 'enhanced.zip', 'setup-manifest.json', 'LICENSE'})
            self.assertTrue(z.read('jellytv.py').startswith(b'#!/usr/bin/env python3\n'))
            self.assertNotIn(b'\r\n', z.read('jellytv.py'))
            metadata = json.loads(z.read('setup-manifest.json'))
            self.assertEqual(metadata['cli']['sha256'], p.digest(z.read('jellytv.py')))
            if os.name == 'posix':
                installed = self.root / 'jellytv'; installed.write_bytes(z.read('jellytv.py')); installed.chmod(0o755)
                command = subprocess.run([str(installed), '--help'], capture_output=True, timeout=20)
                self.assertEqual(command.returncode, 0, command.stderr)
                self.assertIn(b'rollback', command.stdout)
        # Exercise the archive loader and real embedded metadata, not a mocked
        # pkgutil resource reader or source checkout on sys.path.
        probe = ('import sys; sys.path.insert(0, sys.argv[1]); import bootstrap; '
                 'cli, manifest, assets = bootstrap.payload(True); '
                 'assert manifest["version"] == "1.1.0-dev.0"; '
                 'assert cli.startswith(b"#!/usr/bin/env python3\\n"); '
                 'assert len(assets) == 2')
        loaded = subprocess.run([sys.executable, '-I', '-c', probe, str(first)], capture_output=True, timeout=20)
        self.assertEqual(loaded.returncode, 0, loaded.stderr)
        result = subprocess.run([sys.executable, str(first), '--help'], capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr); self.assertIn(b'--dry-run', result.stdout)

    def test_changed_build_and_existing_output_are_preserved(self):
        output = self.root / 'existing'; output.mkdir(); (output / 'keep').write_bytes(b'original')
        with self.assertRaises(ValueError): p.package(self.dist, output, True)
        self.assertEqual((output / 'keep').read_bytes(), b'original')
        (self.dist / 'jellytv-enhanced.js').write_bytes(b'changed')
        with self.assertRaises(ValueError): p.package(self.dist, self.root / 'tampered', True)
        self.assertFalse((self.root / 'tampered').exists())

    def test_stable_accepted_fixture_generates_pinned_command(self):
        self.manifest.update(version='1.2.3', validationStatus='accepted'); self.save_manifest()
        output = self.root / 'accepted'
        with self.assertRaisesRegex(ValueError, 'confirmed GitHub repository'):
            p.package(self.dist, output)
        self.assertFalse(output.exists())
        plan = p.package(self.dist, output, repository='example/JellyTV')
        command = (output / 'INSTALL-COMMAND.txt').read_text()
        sha = plan['artifacts']['jellytv-setup-1.2.3.pyz']['sha256']
        self.assertIn(sha, command); self.assertIn('https://github.com/example/JellyTV/releases/download/v1.2.3/', command)
        self.assertLess(command.index('sha256sum'), command.index('sudo python3'))
        self.assertNotIn('/main/', command); self.assertTrue(plan['remoteCommandGenerated'])

    def test_injected_version_or_digest_cannot_enter_shell_command(self):
        for version in ['1.0.0-dev.0', '1.0.0;id', '../../main', 'latest']:
            with self.assertRaises(ValueError): p.install_command(version, 'a' * 64, 'example/JellyTV')
        with self.assertRaises(ValueError): p.install_command('1.2.3', 'a' * 64 + ';id', 'example/JellyTV')
        for repository in ('example/..', '../JellyTV', 'example/JellyTV;id'):
            with self.assertRaises(ValueError): p.install_command('1.2.3', 'a' * 64, repository)

    @unittest.skipUnless(os.name == 'posix', 'POSIX shell and direct shebang execution run on Linux')
    def test_shell_checks_digest_before_execution_and_cleans_download(self):
        output = self.root / 'shell-package'; p.package(self.dist, output, True)
        archive = output / 'jellytv-setup-1.1.0-dev.0.pyz'
        fakebin = self.root / 'fakebin'; fakebin.mkdir()
        download_log, sudo_log = self.root / 'download.log', self.root / 'sudo.log'
        fake_curl = (f'#!{sys.executable}\nimport os, sys\nfrom pathlib import Path\n'
                     f'target=Path(sys.argv[sys.argv.index("-o")+1])\nPath({str(download_log)!r}).write_text(str(target))\n'
                     'failure=os.environ.get("JELLYTV_TEST_CURL_EXIT")\n'
                     'if failure:\n    target.write_bytes(b"partial response")\n    raise SystemExit(int(failure))\n'
                     f'target.write_bytes(Path({str(archive)!r}).read_bytes())\n')
        fake_sudo = (f'#!{sys.executable}\nimport os, sys, subprocess\nfrom pathlib import Path\n'
                     f'Path({str(sudo_log)!r}).write_text("executed")\n'
                     'if os.environ.get("JELLYTV_TEST_SWAP"): Path(sys.argv[5]).write_bytes(b"changed after sha256sum")\n'
                     'raise SystemExit(subprocess.call(sys.argv[1:]))\n')
        for name, source in [('curl', fake_curl), ('sudo', fake_sudo)]:
            path = fakebin / name; path.write_text(source); path.chmod(0o755)
        env = {**os.environ, 'PATH': str(fakebin) + os.pathsep + os.environ['PATH']}
        command = p.install_command('1.2.3', p.digest(archive.read_bytes()), 'example/JellyTV')
        completed = subprocess.run(shlex.split(command) + ['--help'], env=env, capture_output=True, timeout=20)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertTrue(sudo_log.exists()); self.assertFalse(Path(download_log.read_text()).exists())
        swapped = subprocess.run(shlex.split(command) + ['--help'], env={**env, 'JELLYTV_TEST_SWAP': '1'}, capture_output=True, timeout=20)
        self.assertNotEqual(swapped.returncode, 0)
        self.assertIn(b'digest changed before execution', swapped.stderr)
        self.assertFalse(Path(download_log.read_text()).exists())
        sudo_log.unlink()
        for curl_exit in ('18', '22', '28'):
            with self.subTest(curl_exit=curl_exit):
                failure = subprocess.run(shlex.split(command), env={**env, 'JELLYTV_TEST_CURL_EXIT': curl_exit}, capture_output=True, timeout=20)
                self.assertEqual(failure.returncode, int(curl_exit))
                self.assertFalse(sudo_log.exists())
                self.assertFalse(Path(download_log.read_text()).exists())
        archive.write_bytes(b'corrupt download')
        completed = subprocess.run(shlex.split(command) + ['--help'], env=env, capture_output=True, timeout=20)
        self.assertNotEqual(completed.returncode, 0); self.assertFalse(sudo_log.exists())
        self.assertFalse(Path(download_log.read_text()).exists())


if __name__ == '__main__': unittest.main()
