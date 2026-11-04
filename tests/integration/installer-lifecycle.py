"""CLI lifecycle tests in one explicitly owned, disposable Docker container."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("jellytv", ROOT / "installer/jellytv.py")
j = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(j)
NAME = "jellytv-installer-lifecycle-lab"
LABEL = "installer-lifecycle-validation"
IMAGE = "jellyfin/jellyfin@sha256:96b09723b22fdde74283274bdc1f63b9b76768afd6045dd80d4a4559fc4bb7f3"
URL = "http://127.0.0.1:19000"


def run(bundle, output):
    j.require_local_docker()
    # Never take over a similarly named container, even one left by an old run.
    existing = j.docker("ps", "-aq", "--filter", "name=^/" + NAME + "$")
    assert not existing.stdout.strip(), "Lifecycle lab already exists; review its recovery state first"
    folder = Path(tempfile.mkdtemp(prefix="installer-lifecycle-", dir=ROOT / ".lab"))
    assert folder.resolve().parent == (ROOT / ".lab").resolve()
    state = folder / "state"
    owned_id = None
    report = {"date": datetime.now(timezone.utc).isoformat(), "status": "RUNNING", "image": IMAGE,
              "packageSha256": j.digest(bundle.read_bytes()), "results": [],
              "limits": ["Disposable Docker Desktop laboratory, not CasaOS production", "No physical Nvidia GPU tested"],
              "sources": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in
                          ("installer/jellytv.py", "tests/integration/installer-lifecycle.py")}}
    output.parent.mkdir(parents=True, exist_ok=True)

    def save():
        output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    def inspect_owned():
        info = j.inspect_container(owned_id)
        assert info["Id"] == owned_id and info["Name"] == "/" + NAME
        assert info["Config"]["Image"] == IMAGE
        assert info["Config"]["Labels"].get("org.jellytv.lab") == LABEL
        return info

    def remove_owned():
        nonlocal owned_id
        inspect_owned()
        # Only this run's exact container and its anonymous volumes are removed.
        # No prune, named-volume removal or host filesystem deletion is used.
        j.docker("rm", "--force", "--volumes", owned_id)
        owned_id = None

    def ready():
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            info = inspect_owned()
            assert info["State"]["Running"], "Owned lab stopped before health check"
            try:
                return j.DockerWeb(info, url=URL)
            except j.Refusal:
                time.sleep(1)
        raise AssertionError("Owned lab failed to become healthy")

    def create(readonly=False):
        nonlocal owned_id
        args = ["create", "--name", NAME, "--label", "org.jellytv.lab=" + LABEL,
                "--publish", "127.0.0.1:19000:8096", "--memory", "1g", "--cpus", "1"]
        if readonly:
            args += ["--read-only", "--tmpfs", "/tmp:rw,nosuid,size=64m"]
        owned_id = j.docker(*args, IMAGE).stdout.decode().strip()
        assert len(owned_id) == 64
        (folder / "container.local.json").write_text(json.dumps({"id": owned_id, "name": NAME}))
        inspect_owned()
        j.docker("start", owned_id)
        return ready()

    def cli(action, *options, success=True):
        command = [sys.executable, str(ROOT / "installer/jellytv.py"), action,
                   "--container", NAME, "--state-dir", str(state), "--url", URL, *options]
        result = subprocess.run(command, capture_output=True, timeout=120, check=False)
        if success:
            assert result.returncode == 0, result.stderr.decode(errors="replace")
            return json.loads(result.stdout)
        assert result.returncode != 0, "CLI unexpectedly accepted unsafe operation"
        return result.stderr.decode(errors="replace")

    package_options = ["--bundle", str(bundle.resolve()), "--allow-development"]
    update = folder / "updated.zip"
    with zipfile.ZipFile(bundle) as source, zipfile.ZipFile(update, "x") as target:
        manifest = json.loads(source.read("manifest.json"))
        manifest["version"] = "999.0.0-dev.test"
        for name in ("jellytv-enhanced.css", "jellytv-enhanced.js"):
            data = source.read(name) + b"\n/* lifecycle fixture */\n"
            manifest["assets"][name].update(sha256=j.digest(data), bytes=len(data))
            target.writestr(name, data)
        target.writestr("manifest.json", json.dumps(manifest))
    original = None
    try:
        web = create()
        original = {name: web.read(name) for name in j.FILES}
        assert original[j.MARKER] is None
        cli("install", *package_options)
        installed = {name: web.read(name) for name in j.FILES}
        identity = web.identity()
        j.docker("restart", owned_id)
        web = ready()
        assert web.identity() == identity
        assert all(web.read(name) == data for name, data in installed.items())
        status = cli("status")
        assert status["installed"] and status["integrityMatches"]
        report["results"].append({"name": "CLI install and container restart preserve installation and configuration", "passed": True})
        save(); print("PASS CLI install and container restart", flush=True)

        cli("update", "--bundle", str(update), "--allow-development")
        assert cli("status")["version"] == "999.0.0-dev.test"
        changed = web.read(j.ASSETS[0])
        assert changed != installed[j.ASSETS[0]]
        foreign = changed + b"\n/* foreign edit */\n"
        web.write(j.ASSETS[0], foreign)
        cli("rollback", success=False)
        assert web.read(j.ASSETS[0]) == foreign
        web.write(j.ASSETS[0], changed)
        css_path = web.root + "/" + j.ASSETS[0]
        inspect_owned()
        mode = j.docker("exec", owned_id, "stat", "-c", "%a", "--", css_path).stdout.decode().strip()
        j.docker("exec", owned_id, "chmod", "g+w", "--", css_path)
        cli("rollback", success=False)
        assert web.read(j.ASSETS[0]) == changed
        j.docker("exec", owned_id, "chmod", mode, "--", css_path)
        cli("rollback")
        assert all(web.read(name) == data for name, data in installed.items())
        assert web.identity() == identity
        report["results"].append({"name": "Update, conflict refusal and rollback restore the previous generation", "passed": True})
        save(); print("PASS update and rollback with conflict protection", flush=True)

        old_state = (state / "state.json").read_bytes()
        remove_owned()
        web = create()
        fresh = {name: web.read(name) for name in j.FILES}
        assert fresh == original
        status = cli("status")
        assert not status["containerMatches"] and not status["installed"]
        cli("update", *package_options, success=False)
        cli("install", *package_options, "--reinstall", "--dry-run")
        assert (state / "state.json").read_bytes() == old_state
        assert all(web.read(name) == data for name, data in fresh.items())
        cli("install", *package_options, "--reinstall")
        assert cli("status")["installed"]
        cli("uninstall")
        assert all(web.read(name) == data for name, data in fresh.items())
        assert not cli("status")["installed"]
        report["results"].append({"name": "CLI detects recreated container, preserves dry-run state and restores only new originals", "passed": True})
        save(); print("PASS recreated container and explicit reinstall", flush=True)

        remove_owned()
        state = folder / "readonly-state"
        web = create(readonly=True)
        original = {name: web.read(name) for name in j.FILES}
        assert cli("status")["readOnly"]
        message = cli("install", *package_options, success=False)
        assert "read-only" in message.lower()
        assert all(web.read(name) == data for name, data in original.items())
        assert not (state / "state.json").exists() and not (state / "journal.json").exists()
        report["results"].append({"name": "CLI refuses read-only container without changing files or Docker configuration", "passed": True})
        save(); print("PASS read-only preflight", flush=True)
        remove_owned()
        report["status"] = "PASS"
        report["ownedContainersRemoved"] = True
    except BaseException as error:
        report["status"] = "FAIL"
        report["error"] = str(error)
        report["recoveryStateRetained"] = True
        # Preserve the exact container and private recovery state after failure.
        raise
    finally:
        save()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    run(options.bundle, options.output)
