"""Offline checks of Docker/path/health/locking boundaries used by the installer."""
import copy
from contextlib import nullcontext
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("jellytv_host_transport", ROOT / "installer/jellytv.py")
j = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(j)


def inspect_fixture():
    return {"Id": "container-generation", "Name": "/arbitrary-name", "Image": "sha256:immutable-image",
            "State": {"Running": True},
            "Config": {"Image": "linuxserver/jellyfin:10.10.6", "Env": ["NVIDIA_VISIBLE_DEVICES=all"],
                       "Labels": {"com.docker.compose.project.working_dir": "/var/lib/casaos/apps/jellyfin-nvidia"}},
            "HostConfig": {"ReadonlyRootfs": False, "Runtime": "runc", "DeviceRequests": []},
            "Mounts": [{"Destination": "/config", "RW": True}],
            "NetworkSettings": {"Ports": {"8096/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8097"},
                                                          {"HostIp": "::", "HostPort": "8097"}]}}}


class HostTransportTests(unittest.TestCase):
    def make_web(self, info=None, roots=("/usr/share/jellyfin/web",), main=None, **kwargs):
        """Return a real DockerWeb whose external I/O is a deterministic transport."""
        info = info or inspect_fixture()
        hashes = patch.object(j, "MAIN_HASHES", {j.digest(b"known audited build")}) if main is None else nullcontext()
        main = b"known audited build" if main is None else main
        def docker(*args, **options):
            command = args[4] if args[:1] == ("exec",) and len(args) > 4 else ""
            if command.startswith("test -f"):
                return SimpleNamespace(returncode=0 if args[-1] in roots else 1, stdout=b"")
            if command.startswith("if [ ! -e"):
                return SimpleNamespace(returncode=0, stdout=main)
            return SimpleNamespace(returncode=0, stdout=b"")
        with patch.object(j, "docker", side_effect=docker), hashes, \
             patch.object(j.DockerWeb, "health", return_value={"Version": "10.10.6", "ProductName": "Jellyfin Server"}):
            return j.DockerWeb(info, **kwargs)

    def test_casaos_and_gpu_are_discovered_without_fixed_container_name(self):
        web = self.make_web()
        self.assertEqual(web.name, "arbitrary-name")
        self.assertEqual(web.root, "/usr/share/jellyfin/web")
        self.assertEqual(web.url, "http://127.0.0.1:8097")
        self.assertTrue(web.casaos)
        self.assertTrue(web.gpu)
        self.assertTrue(web.compatible)

    def test_reviewed_navigation_build_is_accepted_and_altered_bytes_are_refused(self):
        fixture = ROOT / "tests/fixtures/main-web-10.10.6.bundle.fixture"
        if not fixture.is_file():
            self.skipTest("Official Web fixture required; see tests/fixtures/README.md")
        main = fixture.read_bytes()
        for name in ("scroll-options-10.10.6", "navigation-10.10.6"):
            spec = json.loads((ROOT / f"web-compat/{name}.json").read_text(encoding="utf-8"))
            self.assertEqual(j.digest(main), spec["originalSha256"])
            before, after = spec["before"].encode(), spec["after"].encode()
            self.assertEqual(main.count(before), 1)
            main = main.replace(before, after)
            self.assertEqual(j.digest(main), spec["patchedSha256"])
        web = self.make_web(main=main)
        self.assertTrue(web.compatible)
        self.assertEqual(web.web_hash, spec["patchedSha256"])
        altered = main + b"\n/* third party edit */"
        self.assertFalse(self.make_web(main=altered, strict=False).compatible)
        with self.assertRaisesRegex(j.Refusal, "Unknown Jellyfin Web build"):
            self.make_web(main=altered)

    def test_unknown_or_ambiguous_webroot_refused(self):
        for roots in ((), (j.ROOTS[0], j.ROOTS[1])):
            with self.subTest(roots=roots), self.assertRaisesRegex(j.Refusal, "one supported Web directory"):
                self.make_web(roots=roots)

    def test_root_and_parent_readonly_mounts_prevent_writes(self):
        for readonly_root, mount in ((True, None), (False, "/usr/share"), (False, "/usr/share/jellyfin/web")):
            with self.subTest(root=readonly_root, mount=mount):
                info = inspect_fixture()
                info["HostConfig"]["ReadonlyRootfs"] = readonly_root
                if mount:
                    info["Mounts"].append({"Destination": mount, "RW": False})
                web = self.make_web(info)
                with patch.object(j, "docker") as transport, self.assertRaisesRegex(j.Refusal, "read-only"):
                    web.write("index.html", b"replacement")
                transport.assert_not_called()

    def test_file_mount_beneath_webroot_is_refused(self):
        info = inspect_fixture()
        info["Mounts"].append({"Destination": "/usr/share/jellyfin/web/index.html", "RW": True})
        with self.assertRaisesRegex(j.Refusal, "Individual mounts"):
            self.make_web(info)

    def test_invalid_webroots_are_refused_before_transport(self):
        for root in ("relative", "/web/../config", "/web\nother", "/web\0"):
            with self.subTest(root=root), patch.object(j, "docker") as transport, self.assertRaisesRegex(j.Refusal, "Invalid webroot"):
                j.DockerWeb(inspect_fixture(), webroot=root)
            transport.assert_not_called()

    def test_remote_or_credential_health_urls_are_refused(self):
        for url in ("http://example.com:8096", "http://user:secret@127.0.0.1:8096", "file:///etc/passwd", "http://127.0.0.1.example.com"):
            with self.subTest(url=url), self.assertRaisesRegex(j.Refusal, "loopback"):
                self.make_web(url=url)

    def test_health_url_rejects_query_fragment_controls_and_bad_port(self):
        for url in ("http://127.0.0.1:8096?redirect=remote", "http://127.0.0.1:8096/#/details",
                    "http://127.0.0.1:8096/\n", "http://127.0.0.1:0", "http://127.0.0.1:8096/\\path"):
            with self.subTest(url=url), self.assertRaises(j.Refusal):
                self.make_web(url=url)

    def test_ipv6_only_bind_uses_ipv6_loopback(self):
        for address in ("::", "::1"):
            info = inspect_fixture()
            info["NetworkSettings"]["Ports"]["8096/tcp"] = [{"HostIp": address, "HostPort": "8097"}]
            with self.subTest(address=address):
                self.assertEqual(self.make_web(info).url, "http://[::1]:8097")

    def test_nonloopback_only_bind_is_not_assumed_to_listen_on_loopback(self):
        info = inspect_fixture()
        info["NetworkSettings"]["Ports"]["8096/tcp"] = [{"HostIp": "192.0.2.1", "HostPort": "8097"}]
        with self.assertRaisesRegex(j.Refusal, "not bound to loopback"):
            self.make_web(info)

    def test_native_bundle_and_unknown_paths_are_never_write_targets(self):
        web = self.make_web()
        for name in ("../config.xml", "main.jellyfin.bundle.js", "/config/system.xml", ".jellytv-install.json", "index.html.jellytv-tmp"):
            with self.subTest(name=name), patch.object(j, "docker") as transport, self.assertRaisesRegex(j.Refusal, "untracked"):
                web.write(name, b"replacement")
            transport.assert_not_called()

    def test_symlink_guard_stops_read_before_cat(self):
        web = self.make_web()
        with patch.object(j, "docker", return_value=SimpleNamespace(returncode=9, stdout=b"")) as transport, self.assertRaisesRegex(j.Refusal, "symlink"):
            web.read("index.html")
        self.assertEqual(transport.call_count, 1)

    def test_configuration_drift_gpu_mounts_or_image_stops_identity(self):
        info = inspect_fixture()
        web = self.make_web(info)
        for change in (lambda data: data["Config"]["Env"].append("NVIDIA_DRIVER_CAPABILITIES=video"),
                       lambda data: data["Mounts"].append({"Destination": "/media", "RW": False}),
                       lambda data: data.update({"Image": "sha256:different-image"}),
                       lambda data: data["State"].update({"Running": False})):
            changed = copy.deepcopy(info)
            change(changed)
            with patch.object(j, "inspect_container", return_value=changed), self.assertRaises(j.Refusal):
                web.identity()

    def test_mount_reordering_does_not_mask_real_mount_field_changes(self):
        info = inspect_fixture()
        info["Mounts"].append({"Destination": "/media", "RW": False, "Source": "/host/media", "Type": "bind"})
        changed = copy.deepcopy(info)
        changed["Mounts"].reverse()
        self.assertEqual(j.configuration_fingerprint(info), j.configuration_fingerprint(changed))
        for field, value in (("RW", True), ("Source", "/other/media"), ("Propagation", "rshared")):
            altered = copy.deepcopy(changed)
            altered["Mounts"][0][field] = value
            with self.subTest(field=field):
                self.assertNotEqual(j.configuration_fingerprint(info), j.configuration_fingerprint(altered))
        self.assertEqual(info["Mounts"][0]["Destination"], "/config", "Fingerprint must not mutate Docker inspect")

    def test_missing_and_ambiguous_published_ports_require_explicit_url(self):
        for ports in ({}, {"8096/tcp": []}, {"8096/tcp": [{"HostPort": "8096"}, {"HostPort": "8097"}]}):
            info = inspect_fixture()
            info["NetworkSettings"]["Ports"] = ports
            with self.subTest(ports=ports), self.assertRaises(j.Refusal):
                self.make_web(info)
            self.assertEqual(self.make_web(info, url="http://127.0.0.1:18997").url, "http://127.0.0.1:18997")

    def test_docker_transport_never_uses_shell_and_sanitizes_stderr(self):
        result = SimpleNamespace(returncode=1, stdout=b"", stderr=b"SECRET-TOKEN")
        with patch.object(j.subprocess, "run", return_value=result) as run, self.assertRaises(j.Refusal) as error:
            j.docker("inspect", "name; echo SECRET-TOKEN")
        self.assertNotIn("SECRET-TOKEN", str(error.exception))
        self.assertEqual(run.call_args.args[0], ["docker", "inspect", "name; echo SECRET-TOKEN"])
        self.assertFalse(run.call_args.kwargs.get("shell", False))

    def test_lock_prevents_competing_writer_and_releases_on_exception(self):
        parent = ROOT / ".lab" / "installer-unit"
        parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=parent) as directory:
            path = Path(directory)
            self.assertEqual(path.resolve().parent, parent.resolve())
            with j.locked(path):
                with self.assertRaisesRegex(j.Refusal, "Another JellyTV operation"):
                    with j.locked(path):
                        self.fail("Acquired a second exclusive lock")
            with self.assertRaisesRegex(RuntimeError, "simulated"):
                with j.locked(path):
                    raise RuntimeError("simulated")
            with j.locked(path):
                pass

    def test_remote_context_is_refused(self):
        context = [{"Endpoints": {"docker": {"Host": "ssh://production-server"}}}]
        with patch.dict(os.environ, {}, clear=True), patch.object(j, "docker", return_value=SimpleNamespace(stdout=json.dumps(context).encode())) as transport:
            with self.assertRaisesRegex(j.Refusal, "local Docker daemon"):
                j.discover()
        self.assertEqual(transport.call_count, 1)

    def test_explicit_docker_context_precedes_host_environment(self):
        cases = (("ssh://remote", "unix:///var/run/docker.sock", "remote-context", False),
                 ("unix:///var/run/docker.sock", "ssh://remote", "local-context", True),
                 ("unix:///var/run/docker.sock", "ssh://remote", "", False))
        for context_endpoint, host, context, allowed in cases:
            response = [{"Endpoints": {"docker": {"Host": context_endpoint}}}]
            environment = {"DOCKER_HOST": host, "DOCKER_CONTEXT": context}
            with self.subTest(environment=environment), patch.dict(os.environ, environment, clear=True), \
                 patch.object(j, "docker", return_value=SimpleNamespace(stdout=json.dumps(response).encode())) as transport, \
                 patch.object(j, "inspect_container", return_value=inspect_fixture()) as inspect:
                if allowed:
                    self.assertEqual(j.discover("explicit-name")["Name"], "/arbitrary-name")
                    inspect.assert_called_once_with("explicit-name")
                else:
                    with self.assertRaisesRegex(j.Refusal, "local Docker daemon"):
                        j.discover("explicit-name")
                    inspect.assert_not_called()
                self.assertEqual(transport.call_count, 1)

    def test_health_disables_proxies_and_redirects(self):
        web = self.make_web(url="http://127.0.0.1:8097/jellyfin")
        opener = SimpleNamespace(open=Mock(side_effect=j.urllib.error.HTTPError(web.url, 302, "redirect", {"Location": "https://remote.example"}, None)))
        with patch.object(j.urllib.request, "build_opener", return_value=opener) as build, self.assertRaisesRegex(j.Refusal, "health check failed"):
            web.health()
        handlers = build.call_args.args
        self.assertTrue(any(isinstance(handler, j.NoRedirect) for handler in handlers))
        self.assertTrue(any(isinstance(handler, j.urllib.request.ProxyHandler) and handler.proxies == {} for handler in handlers))
        opener.open.assert_called_once_with("http://127.0.0.1:8097/jellyfin/System/Info/Public", timeout=10)
        self.assertIsNone(j.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://remote.example"))

    def test_health_rejects_oversized_or_non_jellyfin_responses(self):
        web = self.make_web()
        for payload in (b"x" * (128 * 1024 + 1), b"[]", b'{"ProductName":"Other Server"}'):
            with self.subTest(size=len(payload)), patch.object(j.urllib.request, "build_opener", return_value=SimpleNamespace(open=Mock(return_value=io.BytesIO(payload)))), self.assertRaises(j.Refusal):
                web.health()
        valid = {"Version": "10.10.6", "ProductName": "Jellyfin Server"}
        with patch.object(j.urllib.request, "build_opener", return_value=SimpleNamespace(open=Mock(return_value=io.BytesIO(json.dumps(valid).encode())))):
            self.assertEqual(web.health(), valid)


if __name__ == "__main__":
    unittest.main()
