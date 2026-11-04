"""Bootstrap fault injection with real host files and the installer's fake Web."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


fixtures = module('bootstrap_fixtures', ROOT / 'tests/installer/test_installer.py')
j = fixtures.j
with patch.dict(sys.modules, {'jellytv': j}):
    b = module('bootstrap_under_test', ROOT / 'installer/bootstrap.py')


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        parent = ROOT / '.lab/bootstrap-unit'; parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=parent)
        assert Path(self.temp.name).resolve().parent == parent.resolve()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.bin = self.root / 'bin'; self.bin.mkdir()
        self.state = self.root / 'state'; self.state.mkdir()
        self.target = self.bin / 'jellytv'
        self.cli = b'#!/usr/bin/env python3\nprint("managed cli")\n'
        self.web = fixtures.FakeWeb(); self.web.casaos = True; self.web.gpu = True
        self.manager = j.Manager(self.web, self.state)
        self.manifest, self.assets = j.read_bundle(fixtures.package())

    def run_setup(self, **kwargs):
        return b.install(self.manager, self.target, self.cli, self.manifest, self.assets, **kwargs)

    def test_dry_run_changes_neither_cli_nor_web(self):
        result = self.run_setup(dry_run=True)
        self.assertTrue(result['dryRun']); self.assertTrue(result['casaosDetected'])
        self.assertFalse(result['coreInstalled']); self.assertFalse(self.target.exists())
        self.assertEqual(self.web.files, self.web.initial)
        self.assertFalse(self.manager.state_path.exists())

    def test_install_and_repeat_preserve_cli_inode_and_web_generation(self):
        self.assertTrue(self.run_setup()['verified'])
        inode = self.target.stat().st_ino; writes = len(self.web.writes)
        result = self.run_setup()
        self.assertTrue(result['alreadyInstalled']); self.assertFalse(result['cliCreated'])
        self.assertEqual(self.target.stat().st_ino, inode); self.assertEqual(len(self.web.writes), writes)
        self.assertEqual(self.target.read_bytes(), self.cli)

    def test_foreign_cli_refused_before_web_write(self):
        self.target.write_bytes(b'other tool')
        with self.assertRaises(j.Refusal): self.run_setup()
        self.assertEqual(self.target.read_bytes(), b'other tool'); self.assertFalse(self.web.writes)

    def test_cli_directory_at_destination_is_preserved(self):
        self.target.mkdir()
        with self.assertRaises(j.Refusal): self.run_setup()
        self.assertTrue(self.target.is_dir()); self.assertFalse(self.web.writes)

    def test_pending_web_recovery_refuses_setup_without_creating_cli(self):
        self.manager.journal_path.write_text('{}')
        with self.assertRaisesRegex(j.Refusal, 'rollback'): self.run_setup()
        self.assertFalse(self.target.exists()); self.assertFalse(self.web.writes)

    def test_unknown_temporary_preserved_without_touching_web(self):
        temporary = self.target.with_name('jellytv.setup.tmp'); temporary.write_bytes(b'unknown')
        with self.assertRaises(j.Refusal): self.run_setup()
        self.assertEqual(temporary.read_bytes(), b'unknown'); self.assertFalse(self.web.writes)

    def test_each_web_write_failure_restores_web_and_removes_new_cli(self):
        for index in range(1, 6):
            with self.subTest(write=index):
                self.web.fail_at = len(self.web.writes) + index
                with self.assertRaisesRegex(j.Refusal, 'newly created CLI removed') as raised: self.run_setup()
                self.assertIn('Operation failed at write ' + j.FILES[index - 1], str(raised.exception))
                self.assertEqual({n: self.web.read(n) for n in j.FILES}, self.web.initial)
                self.assertFalse(self.target.exists()); self.assertFalse(self.manager.journal_path.exists())
                self.assertIsNone(self.manager.state)

    def test_existing_known_cli_preserved_when_web_fails(self):
        b.create_cli(self.target, self.cli); self.web.fail_at = 2
        with self.assertRaises(j.Refusal): self.run_setup()
        self.assertEqual(self.target.read_bytes(), self.cli)

    def test_failed_recovery_keeps_cli_and_journal(self):
        def corrupt(web, _name):
            web.files['index.html'] = b'concurrent edit'; raise OSError('conflict')
        self.web.hook = corrupt
        with self.assertRaisesRegex(j.Refusal, 'CLI retained'): self.run_setup()
        self.assertEqual(self.target.read_bytes(), self.cli); self.assertTrue(self.manager.journal_path.exists())
        self.assertEqual(self.web.read('index.html'), b'concurrent edit')

    def test_changed_cli_is_preserved_when_cleanup_runs(self):
        def edit(_web, _name):
            self.target.write_bytes(b'concurrent CLI'); self.web.hook = None
            raise OSError('interrupted')
        self.web.hook = edit
        with self.assertRaisesRegex(j.Refusal, 'destination changed'): self.run_setup()
        self.assertEqual(self.target.read_bytes(), b'concurrent CLI')
        self.assertFalse(self.manager.journal_path.exists())

    def test_publish_refuses_file_created_after_preflight(self):
        def race(_src, target):
            Path(target).write_bytes(b'another command'); raise FileExistsError('race')
        with patch.object(b.os, 'link', side_effect=race), self.assertRaises(FileExistsError): self.run_setup()
        self.assertEqual(self.target.read_bytes(), b'another command'); self.assertFalse(self.web.writes)

    def test_cli_sync_failure_removes_only_new_cli_before_web_mutation(self):
        with patch.object(j, 'sync_directory', side_effect=OSError('sync failed')):
            with self.assertRaisesRegex(OSError, 'sync failed'): self.run_setup()
        self.assertFalse(self.target.exists()); self.assertFalse(self.web.writes)
        self.assertFalse(self.target.with_name('jellytv.setup.tmp').exists())

    def test_cli_link_failure_preserves_existing_web_and_cleans_owned_temporary(self):
        with patch.object(b.os, 'link', side_effect=OSError('unsupported hard links')):
            with self.assertRaisesRegex(OSError, 'unsupported hard links'): self.run_setup()
        self.assertFalse(self.target.exists()); self.assertFalse(self.web.writes)
        self.assertFalse(self.target.with_name('jellytv.setup.tmp').exists())

    def test_other_installed_version_requires_update(self):
        self.run_setup(); self.manifest = {**self.manifest, 'version': '2.0.0'}
        writes = len(self.web.writes)
        with self.assertRaisesRegex(j.Refusal, 'use jellytv update'): self.run_setup()
        self.assertEqual(len(self.web.writes), writes)

    def test_readonly_preflight_does_not_register_cli(self):
        self.web.readonly = True
        with self.assertRaises(j.Refusal): self.run_setup()
        self.assertFalse(self.target.exists()); self.assertFalse(self.web.writes)

    def test_payload_integrity_and_development_gate(self):
        bundle = fixtures.package(version='1.1.0-dev.0', status='development')
        metadata = {'schema': 1, 'version': '1.1.0-dev.0', 'validationStatus': 'development',
                    'cli': {'sha256': j.digest(self.cli), 'bytes': len(self.cli)},
                    'bundle': {'sha256': j.digest(bundle), 'bytes': len(bundle)}}
        data = {'setup-manifest.json': json.dumps(metadata).encode(), 'jellytv.py': self.cli, 'enhanced.zip': bundle}
        with patch.object(b.pkgutil, 'get_data', side_effect=lambda _module, name: data[name]):
            with self.assertRaises(j.Refusal): b.payload()
            self.assertEqual(b.payload(True)[0], self.cli)
            data['jellytv.py'] = b'changed'
            with self.assertRaisesRegex(j.Refusal, 'integrity'): b.payload(True)

    def test_payload_version_mismatch_is_rejected(self):
        bundle = fixtures.package()
        metadata = {'schema': 1, 'version': '9.0.0', 'validationStatus': 'accepted',
                    'cli': {'sha256': j.digest(self.cli), 'bytes': len(self.cli)},
                    'bundle': {'sha256': j.digest(bundle), 'bytes': len(bundle)}}
        data = {'setup-manifest.json': json.dumps(metadata).encode(), 'jellytv.py': self.cli, 'enhanced.zip': bundle}
        with patch.object(b.pkgutil, 'get_data', side_effect=lambda _module, name: data[name]):
            with self.assertRaisesRegex(j.Refusal, 'versions differ'): b.payload()

    @unittest.skipUnless(os.name == 'posix', 'Linux ownership/permissions checked in the separate POSIX run')
    def test_writable_cli_directory_rejected(self):
        self.bin.chmod(0o777)
        with self.assertRaisesRegex(j.Refusal, 'not writable'): self.run_setup()
        self.bin.chmod(0o755)

    @unittest.skipUnless(os.name == 'posix', 'POSIX owner and mode checks')
    def test_state_lock_refuses_writable_ancestor_and_hardlinked_lock(self):
        self.state.chmod(0o700)
        self.target.write_bytes(b'foreign')
        os.link(self.target, self.state / 'lock')
        with self.assertRaisesRegex(j.Refusal, 'hard links'), j.locked(self.state):
            self.fail('Unexpected lock acquisition')
        self.assertEqual(self.target.read_bytes(), b'foreign')
        unsafe = self.root / 'shared'
        unsafe.mkdir()
        unsafe.chmod(0o775)
        with self.assertRaisesRegex(j.Refusal, 'shared write'), j.locked(unsafe / 'state'):
            self.fail('Unexpected lock acquisition')
        self.assertFalse((unsafe / 'state').exists())

    @unittest.skipUnless(os.name == 'posix', 'Symlink checks run on Linux')
    def test_symlink_and_writable_existing_command_are_rejected(self):
        other = self.root / 'other'; other.write_bytes(self.cli)
        self.target.symlink_to(other)
        with self.assertRaises(j.Refusal): self.run_setup()
        self.target.unlink(); b.create_cli(self.target, self.cli); self.target.chmod(0o777)
        with self.assertRaises(j.Refusal): self.run_setup()
        self.assertFalse(self.web.writes)


if __name__ == '__main__': unittest.main()
