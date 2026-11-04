"""Fault-injection tests for the host installer; never contact Docker or Jellyfin."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import warnings
import zipfile


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("jellytv_installer", ROOT / "installer" / "jellytv.py")
j = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(j)


def package(version="1.2.3", status="accepted", extra=None, damage=None):
    assets = {"jellytv-enhanced.css": b"body {color: white}", "jellytv-enhanced.js": b"/* enhanced */"}
    manifest = {"version": version, "validationStatus": status, "webVersions": ["10.10.6"],
                "assets": {name: {"sha256": j.digest(value), "bytes": len(value)} for name, value in assets.items()}}
    entries = {"manifest.json": json.dumps(manifest).encode(), **assets, "LICENSE": b"MIT"}
    if damage:
        damage(entries)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, value in entries.items():
            archive.writestr(name, value)
        if extra:
            archive.writestr(*extra)
    return output.getvalue()


class FakeWeb:
    def __init__(self, generation="first"):
        self.id, self.name = generation, "jellyfin-lab"
        self.readonly = False
        self.files = {name: None for name in j.FILES}
        self.files.update({"index.html": b'<!doctype html><html><head><script defer src="native.js"></script></head><body></body></html>',
                           "config.json": b'{"plugins":["ExistingPlugin"],"custom":"preserve"}\n'})
        self.initial = copy.deepcopy(self.files)
        self.writes = []
        self.fail_at = None
        self.drop_at = None
        self.fail_health = False
        self.hook = None

    def identity(self):
        return {"id": self.id, "name": self.name, "image": "sha256:pinned", "root": "/web", "fingerprint": "GPU-and-mounts-unchanged"}

    def read(self, name):
        return self.files.get(name)

    def write(self, name, value):
        self.writes.append(name)
        if self.fail_at == len(self.writes):
            raise OSError("injected write error")
        if self.drop_at != len(self.writes):
            self.files[name] = value
        if self.hook:
            self.hook(self, name)

    def remove_known_temp(self, name, permitted):
        temp = name + ".jellytv-tmp"
        value = self.files.get(temp)
        if value is not None:
            j.require(value in permitted, "Unknown Web temporary")
            del self.files[temp]

    def health(self):
        if self.fail_health:
            self.fail_health = False
            raise j.Refusal("injected health failure")
        return {"ProductName": "Jellyfin Server", "Version": "10.10.6"}


class TransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp_parent = ROOT / ".lab" / "installer-unit"
        self.temp_parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=self.temp_parent)
        # TemporaryDirectory removes only its exact generated directory. Check
        # containment before registering recursive cleanup on Windows.
        assert Path(self.temp.name).resolve().parent == self.temp_parent.resolve()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.web = FakeWeb()
        self.manager = j.Manager(self.web, self.directory)
        self.manifest, self.assets = j.read_bundle(package())

    def install(self):
        return self.manager.change("install", self.manifest, self.assets)

    def assert_restored(self, web=None):
        web = web or self.web
        self.assertEqual({name: web.read(name) for name in j.FILES}, web.initial)

    def test_install_update_rollback_uninstall_preserves_original_bytes(self):
        self.install()
        first = copy.deepcopy(self.web.files)
        updated_manifest, updated_assets = j.read_bundle(package("1.2.4"))
        self.manager.change("update", updated_manifest, updated_assets)
        self.assertEqual(self.manager.state["version"], "1.2.4")
        self.manager.change("rollback")
        self.assertEqual(self.web.files, first)
        self.manager.change("uninstall")
        self.assert_restored()
        self.assertFalse(self.manager.state["installed"])
        self.assertFalse(self.manager.journal_path.exists())

    def test_every_partial_install_write_failure_restores(self):
        for failure in range(1, len(j.FILES) + 1):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory(dir=self.temp_parent) as directory:
                assert Path(directory).resolve().parent == self.temp_parent.resolve()
                web = FakeWeb()
                web.fail_at = failure
                manager = j.Manager(web, Path(directory))
                with self.assertRaisesRegex(j.Refusal, "original tracked files and state restored"):
                    manager.change("install", self.manifest, self.assets)
                self.assert_restored(web)
                self.assertFalse(manager.journal_path.exists())
                self.assertFalse(manager.state_path.exists())

    def test_update_failure_restores_installed_generation(self):
        self.install()
        first, state = copy.deepcopy(self.web.files), copy.deepcopy(self.manager.state)
        self.web.fail_at = len(self.web.writes) + 4
        manifest, assets = j.read_bundle(package("1.2.4"))
        with self.assertRaises(j.Refusal):
            self.manager.change("update", manifest, assets)
        self.assertEqual(self.web.files, first)
        self.assertEqual(j.read_state(self.manager.state_path), state)

    def test_health_failure_reverts_and_rechecks_health(self):
        self.web.fail_health = True
        with self.assertRaisesRegex(j.Refusal, "original tracked files and state restored"):
            self.install()
        self.assert_restored()

    def test_silent_failed_restoration_keeps_journal_for_retry(self):
        self.web.fail_at = 4  # CSS, JS and config written; index not written.
        self.web.drop_at = 5  # Silently fail restoration of config.
        with self.assertRaisesRegex(j.Refusal, "recovery needs attention"):
            self.install()
        self.assertTrue(self.manager.journal_path.exists())
        self.web.drop_at = None
        result = self.manager.change("rollback")
        self.assertTrue(result["recovered"])
        self.assert_restored()
        self.assertFalse(self.manager.journal_path.exists())

    def test_external_edit_is_never_overwritten_during_recovery(self):
        def conflict(web, name):
            if name == "config.json":
                web.files[j.ASSETS[0]] = b"third party change"
                web.hook = None
                raise OSError("simulated interruption")
        self.web.hook = conflict
        with self.assertRaisesRegex(j.Refusal, "recovery needs attention"):
            self.install()
        self.assertEqual(self.web.files[j.ASSETS[0]], b"third party change")
        self.assertTrue(self.manager.journal_path.exists())
        with self.assertRaisesRegex(j.Refusal, "outside this transaction"):
            self.manager.change("rollback")

    def test_configuration_drift_refuses_update_and_uninstall_without_writes(self):
        self.install()
        self.web.files["config.json"] = b'{"plugins":["another-admin-change"]}'
        count = len(self.web.writes)
        for action in ("update", "uninstall", "rollback"):
            with self.subTest(action=action), self.assertRaisesRegex(j.Refusal, "third-party"):
                self.manager.change(action, self.manifest, self.assets)
        self.assertEqual(len(self.web.writes), count)

    def test_change_between_plan_and_transaction_refuses_without_journal(self):
        original = j.plan_install
        def changed(*args):
            result = original(*args)
            self.web.files["config.json"] = b"concurrent edit"
            return result
        with patch.object(j, "plan_install", side_effect=changed), self.assertRaisesRegex(j.Refusal, "after planning"):
            self.install()
        self.assertEqual(self.web.writes, [])
        self.assertFalse(self.manager.journal_path.exists())

    def test_readonly_install_has_no_state_or_web_writes(self):
        self.web.readonly = True
        with self.assertRaisesRegex(j.Refusal, "read-only"):
            self.install()
        self.assertEqual(self.web.writes, [])
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_unknown_temporary_refuses_before_journal(self):
        self.web.files[j.ASSETS[0] + ".jellytv-tmp"] = b"unknown"
        with self.assertRaisesRegex(j.Refusal, "Unknown Web temporary"):
            self.install()
        self.assertEqual(self.web.writes, [])
        self.assertFalse(self.manager.journal_path.exists())

    def test_reinstall_preflight_and_dry_run_keep_old_state(self):
        self.install()
        old = self.manager.state_path.read_bytes()
        replacement = FakeWeb("second")
        manager = j.Manager(replacement, self.directory)
        replacement.readonly = True
        with self.assertRaisesRegex(j.Refusal, "read-only"):
            manager.change("install", self.manifest, self.assets, reinstall=True)
        self.assertEqual(manager.state_path.read_bytes(), old)
        self.assertEqual(list(self.directory.glob("previous-container-*")), [])
        replacement.readonly = False
        manager.change("install", self.manifest, self.assets, reinstall=True, dry_run=True)
        self.assertEqual(manager.state_path.read_bytes(), old)
        self.assertEqual(manager.state["identity"]["id"], "first")
        self.assertEqual(replacement.writes, [])

    def test_failed_reinstall_restores_old_state_and_new_container_originals(self):
        self.install()
        old = copy.deepcopy(self.manager.state)
        replacement = FakeWeb("second")
        replacement.fail_at = 4
        manager = j.Manager(replacement, self.directory)
        with self.assertRaisesRegex(j.Refusal, "original tracked files and state restored"):
            manager.change("install", self.manifest, self.assets, reinstall=True)
        self.assertEqual(j.read_state(manager.state_path), old)
        self.assert_restored(replacement)
        archives = list(self.directory.glob("previous-container-*"))
        self.assertEqual(len(archives), 1)
        self.assertEqual(j.read_state(archives[0]), old)

    def test_successful_reinstall_uses_new_originals(self):
        self.install()
        replacement = FakeWeb("second")
        replacement.files["index.html"] = b"<html><head></head><body>new image</body></html>"
        replacement.initial = copy.deepcopy(replacement.files)
        manager = j.Manager(replacement, self.directory)
        with self.assertRaisesRegex(j.Refusal, "generation changed"):
            manager.change("install", self.manifest, self.assets)
        manager.change("install", self.manifest, self.assets, reinstall=True)
        manager.change("uninstall")
        self.assert_restored(replacement)
        self.assertEqual(manager.state["identity"]["id"], "second")

    def test_first_generation_rollback_uninstalls(self):
        self.install()
        self.manager.change("rollback")
        self.assert_restored()


class PackageTests(unittest.TestCase):
    def test_development_requires_explicit_local_override(self):
        data = package("1.1.0-dev.0", "development")
        with self.assertRaisesRegex(j.Refusal, "not passed acceptance"):
            j.read_bundle(data)
        self.assertEqual(j.read_bundle(data, allow_development=True)[0]["version"], "1.1.0-dev.0")

    def test_tampered_bytes_rejected(self):
        data = package(damage=lambda entries: entries.update({"jellytv-enhanced.js": b"modified"}))
        with self.assertRaisesRegex(j.Refusal, "integrity mismatch"):
            j.read_bundle(data)

    def test_path_traversal_and_extra_files_rejected(self):
        for name in ("../index.html", "/absolute", "extra.js", "nested/jellytv-enhanced.js"):
            with self.subTest(name=name), self.assertRaisesRegex(j.Refusal, "unsafe archive paths"):
                j.read_bundle(package(extra=(name, b"x")))

    def test_duplicate_names_rejected(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            data = package(extra=("jellytv-enhanced.js", b"duplicate"))
        with self.assertRaisesRegex(j.Refusal, "duplicate"):
            j.read_bundle(data)

    def test_symlink_archive_rejected(self):
        info = zipfile.ZipInfo("LICENSE")
        info.create_system = 3
        info.external_attr = 0o120777 << 16
        data = package(damage=lambda entries: entries.pop("LICENSE"), extra=(info, b"/etc/passwd"))
        with self.assertRaisesRegex(j.Refusal, "Symlink"):
            j.read_bundle(data)

    def test_malformed_manifest_is_diagnostic_refusal(self):
        for value in ([], {"version": None}, {"version": "1.2.3", "validationStatus": "accepted", "webVersions": None}):
            with self.subTest(value=value), self.assertRaises(j.Refusal):
                j.read_bundle(package(damage=lambda entries: entries.update({"manifest.json": json.dumps(value).encode()})))

    def test_github_release_integrity_tag_and_acceptance(self):
        data = package()
        release = {"tag_name": "v1.2.3", "draft": False, "prerelease": False, "assets": [
            {"name": "jellytv-enhanced-1.2.3.zip", "state": "uploaded", "id": 123, "size": len(data), "digest": "sha256:" + j.digest(data)}]}
        with patch.object(j, "github_request", side_effect=[json.dumps(release).encode(), data]):
            self.assertEqual(j.download("owner/repository", "1.2.3")[0]["version"], "1.2.3")
        for field in ("draft", "prerelease"):
            invalid = {**release, field: True}
            with self.subTest(field=field), patch.object(j, "github_request", return_value=json.dumps(invalid).encode()), self.assertRaisesRegex(j.Refusal, "published stable"):
                j.download("owner/repository", "1.2.3")
        invalid = {**release, "tag_name": "v1.2.3-dev.0"}
        with patch.object(j, "github_request", return_value=json.dumps(invalid).encode()), self.assertRaisesRegex(j.Refusal, "stable release tag"):
            j.download("owner/repository", "1.2.3")
        with patch.object(j, "github_request", side_effect=[json.dumps(release).encode(), b"tampered"]), self.assertRaisesRegex(j.Refusal, "integrity mismatch"):
            j.download("owner/repository", "1.2.3")
        with patch.object(j, "github_request", return_value=json.dumps(release).encode()) as request:
            with self.assertRaisesRegex(j.Refusal, "different release"):
                j.download("owner/repository", "2.0.0")
            request.assert_called_once_with("https://api.github.com/repos/owner/repository/releases/tags/v2.0.0", None)


class DiscoveryTests(unittest.TestCase):
    def test_ambiguous_jellyfin_containers_require_selection(self):
        context = [{"Endpoints": {"docker": {"Host": "unix:///var/run/docker.sock"}}}]
        infos = {key: {"Id": key, "Config": {"Image": "linuxserver/jellyfin:10.10.6"}} for key in ("one", "two")}
        def docker(*args):
            return SimpleNamespace(stdout=json.dumps(context).encode() if args[0] == "context" else b"one\ntwo\n")
        with patch.dict(j.os.environ, {}, clear=True), patch.object(j, "docker", side_effect=docker), patch.object(j, "inspect_container", side_effect=infos.get):
            with self.assertRaisesRegex(j.Refusal, "ambiguous"):
                j.discover()
            self.assertEqual(j.discover("two")["Id"], "two")

    def test_remote_daemon_refused_before_container_inspection(self):
        context = [{"Endpoints": {"docker": {"Host": "ssh://remote"}}}]
        with patch.dict(j.os.environ, {}, clear=True), patch.object(j, "docker", return_value=SimpleNamespace(stdout=json.dumps(context).encode())), patch.object(j, "inspect_container") as inspect:
            with self.assertRaisesRegex(j.Refusal, "local Docker"):
                j.discover("jellyfin")
            inspect.assert_not_called()

    def test_gpu_runtime_devices_mounts_and_environment_affect_identity(self):
        info = {"Config": {"Env": ["NVIDIA_VISIBLE_DEVICES=all"]},
                "HostConfig": {"Runtime": "nvidia", "DeviceRequests": [{"Driver": "nvidia", "Count": -1}]},
                "Mounts": [{"Destination": "/config", "RW": True}]}
        before = j.configuration_fingerprint(info)
        for field in ("Config", "HostConfig", "Mounts"):
            changed = {**info, field: None}
            self.assertNotEqual(j.configuration_fingerprint(changed), before)
        self.assertEqual(info["Config"]["Env"], ["NVIDIA_VISIBLE_DEVICES=all"])

    def test_port_discovery_uses_inspect_not_casaos_default(self):
        info = {"NetworkSettings": {"Ports": {"8096/tcp": [{"HostPort": "12345"}]}}}
        self.assertEqual(j.DockerWeb._url(info), "http://127.0.0.1:12345")
        info["NetworkSettings"]["Ports"]["8096/tcp"].append({"HostPort": "8097"})
        with self.assertRaisesRegex(j.Refusal, "Multiple"):
            j.DockerWeb._url(info)

    def test_native_main_bundle_cannot_be_written(self):
        web = object.__new__(j.DockerWeb)
        with patch.object(j, "docker") as docker, self.assertRaisesRegex(j.Refusal, "untracked"):
            web.write("main.jellyfin.bundle.js", b"replacement")
        docker.assert_not_called()

    def test_untrusted_redirect_host_and_plain_http_never_open(self):
        for url in ("http://api.github.com/resource", "https://example.org/resource", "https://api.github.com.evil.example/resource", "https://name:password@api.github.com/resource"):
            with self.subTest(url=url), patch.object(j.urllib.request, "build_opener") as opener:
                with self.assertRaisesRegex(j.Refusal, "Untrusted"):
                    j.github_request(url, token="test-token")
                opener.return_value.open.assert_not_called()


if __name__ == "__main__":
    unittest.main()
