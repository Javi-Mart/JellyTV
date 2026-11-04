#!/usr/bin/env python3
"""JellyTV host-side installer. Python 3.9+, Docker CLI, no server-side dependencies."""
import argparse
import base64
import contextlib
import hashlib
import io
import json
import os
import re
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

REPO = "Javi-Mart/JellyTV"
ASSETS = ("jellytv/jellytv-enhanced.css", "jellytv/jellytv-enhanced.js")
MARKER = ".jellytv-casaos.json"
FILES = (*ASSETS, "config.json", "index.html", MARKER)
MAIN_HASHES = {
    # Official jellyfin/jellyfin:10.10.6, image digest recorded in the research
    # document. Byte-identical to Windows except the absent build commit string.
    "3a53be131e3d6b0f5cc2065042806731e00dd6ec059115a393807cb242a5b0eb",
    "cf2b876d62cbc567da0ff2e5d3e22ac799729f13ce1208d6f1f9345ae6f8c1ec",
    "25b50389160c4d80c4062b5fcaa2bc94823ee645072268c8fe025fe22863e1fc",
    # Same audited build with scroll-options and navigation-10.10.6 applied separately.
    "90f20b37ccc77ee2171e73e4301625c719b78473ddb02c6f8b9c15638b12e91a",
}
ROOTS = ("/jellyfin/jellyfin-web", "/usr/share/jellyfin/web", "/usr/share/jellyfin-web", "/app/jellyfin/jellyfin-web")
MAX_PACKAGE = 8 * 1024 * 1024


class Refusal(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise Refusal(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(data):
    return None if data is None else base64.b64encode(data).decode("ascii")


def decode(value):
    return None if value is None else base64.b64decode(value, validate=True)


def sync_directory(directory):
    if os.name != "nt":
        descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def atomic_json(path, value):
    require(not path.is_symlink(), "State files must not be symlinks")
    temp = path.with_name(path.name + ".tmp")
    require(not temp.exists() and not temp.is_symlink(), "Unknown state temporary; inspect it before continuing")
    created = False
    try:
        descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created = True
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, 0o600)
        temp.replace(path)
        sync_directory(path.parent)
    finally:
        if created and temp.exists():
            temp.unlink()


@contextlib.contextmanager
def locked(directory):
    directory = directory.absolute()
    require(".." not in directory.parts, "State path must not contain parent traversal")
    if os.name == "nt":
        require(not any(part.is_symlink() for part in (directory, *directory.parents)), "State directory must not contain symlinks")
        directory.mkdir(parents=True, exist_ok=True)
    else:
        for part in (*reversed(directory.parents), directory):
            try:
                info = part.lstat()
            except FileNotFoundError:
                part.mkdir(mode=0o700)
                info = part.lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid in (0, os.geteuid()) and not info.st_mode & 0o022,
                    "State path must use trusted directories without symlinks or shared write permissions")
        require(info.st_uid == os.geteuid() and not info.st_mode & 0o077,
                "State directory must be private and owned by the invoking user (chmod 700)")
    lock_path = directory / "lock"
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    require(not lock_path.is_symlink(), "Lock must not be a symlink")
    with os.fdopen(os.open(lock_path, flags, 0o600), "r+b") as handle:
        info = os.fstat(handle.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "Lock must be a regular file without hard links")
        if os.name != "nt":
            require(info.st_uid == os.geteuid() and not info.st_mode & 0o022, "Lock has untrusted ownership or permissions")
        try:
            if os.name == "nt":
                import msvcrt
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise Refusal("Another JellyTV operation holds the lock") from error
        yield


def read_state(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "State files must be regular files without links")
    if os.name != "nt":
        require(info.st_uid == os.geteuid() and not info.st_mode & 0o022, "State file has untrusted ownership or permissions")
    return json.loads(path.read_text(encoding="utf-8"))


def docker(*args, data=None, check=True):
    result = subprocess.run(["docker", *args], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    if check and result.returncode:
        # Docker diagnostics may include unrelated environment values. Keep the
        # operation and exit code, not raw inspect or credentials, in output.
        raise Refusal(f"Docker {args[0]} failed (exit {result.returncode}); no automatic container reconfiguration")
    return result


def inspect_container(identifier):
    require(isinstance(identifier, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", identifier), "Invalid Docker container name or ID")
    values = json.loads(docker("inspect", "--type", "container", identifier).stdout)
    require(len(values) == 1, "Expected exactly one container")
    return values[0]


def configuration_fingerprint(info):
    tracked = {key: info.get(key) for key in ("Config", "HostConfig", "Mounts")}
    # Docker may return the same mount set in a different order on each inspect.
    # Retain every mount field while making this nonsemantic ordering stable.
    if isinstance(tracked["Mounts"], list):
        tracked["Mounts"] = sorted(tracked["Mounts"], key=lambda mount: json.dumps(mount, sort_keys=True))
    return digest(json.dumps(tracked, sort_keys=True).encode())


def require_local_docker():
    context = json.loads(docker("context", "inspect").stdout)[0]
    context_endpoint = context["Endpoints"]["docker"]["Host"]
    # Match Docker CLI precedence: explicit DOCKER_CONTEXT overrides DOCKER_HOST.
    endpoint = context_endpoint if os.environ.get("DOCKER_CONTEXT") else os.environ.get("DOCKER_HOST") or context_endpoint
    require(endpoint.startswith(("unix://", "npipe://")), "Only a local Docker daemon is supported")


def discover(explicit=None):
    require_local_docker()
    identifiers = [explicit] if explicit else docker("ps", "--filter", "status=running", "--format", "{{.ID}}").stdout.decode().split()
    found = []
    for identifier in identifiers:
        info = inspect_container(identifier)
        image = info.get("Config", {}).get("Image", "").lower()
        if explicit or "jellyfin" in image:
            found.append(info)
    require(len(found) == 1, "Jellyfin selection is ambiguous or absent; use --container NAME after checking docker ps")
    return found[0]


class DockerWeb:
    def __init__(self, info, webroot=None, url=None, strict=True):
        require(info["State"]["Running"], "Jellyfin container must be running")
        self.id = info["Id"]
        self.name = info["Name"].lstrip("/")
        self.image = info["Image"]
        self.fingerprint = configuration_fingerprint(info)
        roots = [webroot] if webroot else ROOTS
        valid = []
        for root in roots:
            root = root.rstrip("/")
            require(root.startswith("/") and all(part not in ("", ".", "..") for part in root.split("/")[1:])
                    and not re.search(r"[\r\n\x00]", root), "Invalid webroot")
            result = docker("exec", self.id, "sh", "-c", 'test -f "$1/index.html" && test -f "$1/main.jellyfin.bundle.js"', "sh", root, check=False)
            if result.returncode == 0:
                valid.append(root.rstrip("/"))
        require(len(valid) == 1, "Cannot identify one supported Web directory; use --webroot explicitly")
        self.root = valid[0]
        self._guard_path(self.root)
        self.readonly = bool(info.get("HostConfig", {}).get("ReadonlyRootfs"))
        for mount in info.get("Mounts", []):
            destination = mount["Destination"].rstrip("/")
            if self.root == destination or self.root.startswith(destination + "/"):
                self.readonly = self.readonly or not mount.get("RW", False)
            require(not destination.startswith(self.root + "/"), "Individual mounts inside Web prevent safe atomic replacement")
        self.url = url or self._url(info)
        parsed = urllib.parse.urlsplit(self.url)
        require(parsed.scheme in ("http", "https") and parsed.hostname in ("127.0.0.1", "localhost", "::1") and not parsed.username and not parsed.password,
                "Health URL must point to this host's loopback Jellyfin endpoint")
        require(not parsed.query and not parsed.fragment and not re.search(r"[\x00-\x20\\]", self.url)
                and (parsed.port is None or 1 <= parsed.port <= 65535), "Health URL cannot contain credentials, a query, fragment or invalid port")
        self.url = self.url.rstrip("/")
        self.server = self.health()
        self.web_hash = digest(self.read("main.jellyfin.bundle.js"))
        self.compatible = self.server.get("Version") == "10.10.6" and self.web_hash in MAIN_HASHES
        if strict:
            require(self.server.get("Version") == "10.10.6", "Only Jellyfin Server 10.10.6 is currently supported by the CasaOS installer")
            require(self.web_hash in MAIN_HASHES, "Unknown Jellyfin Web build; no files changed")
        labels = info.get("Config", {}).get("Labels") or {}
        working = labels.get("com.docker.compose.project.working_dir", "")
        self.casaos = Path("/etc/casaos").is_dir() or "/casaos/apps/" in working or any(key.startswith("io.casaos.") for key in labels)
        env = info.get("Config", {}).get("Env") or []
        self.gpu = bool(info.get("HostConfig", {}).get("DeviceRequests")) or info.get("HostConfig", {}).get("Runtime") == "nvidia" or any(value.startswith("NVIDIA_") for value in env)

    @staticmethod
    def _url(info):
        ports = (info.get("NetworkSettings", {}).get("Ports") or {}).get("8096/tcp") or []
        require(bool(ports), "Cannot identify published Jellyfin HTTP port; supply --url http://127.0.0.1:PORT")
        values = {entry["HostPort"] for entry in ports}
        require(len(values) == 1, "Multiple published ports; supply --url")
        port = next(iter(values))
        require(re.fullmatch(r"[0-9]+", port) and 1 <= int(port) <= 65535, "Invalid published port")
        addresses = {entry.get("HostIp", "") for entry in ports}
        if addresses & {"", "0.0.0.0", "127.0.0.1"}:
            return "http://127.0.0.1:" + port
        require(bool(addresses & {"::", "::1"}), "Published port is not bound to loopback; supply a local --url")
        return "http://[::1]:" + port

    def _guard_path(self, path):
        result = docker("exec", self.id, "sh", "-c", 'p="$1"; while [ "$p" != / ]; do [ ! -L "$p" ] || exit 9; p=$(dirname "$p"); done', "sh", path, check=False)
        require(result.returncode == 0, "Refusing a symlink in the Web path")

    def _path(self, name):
        require(name in (*FILES, "main.jellyfin.bundle.js", ".jellytv-install.json") or name in tuple(value + ".jellytv-tmp" for value in FILES), "Untracked Web path")
        path = self.root + "/" + name
        self._guard_path(path)
        return path

    def read(self, name):
        result = docker("exec", self.id, "sh", "-c", 'if [ ! -e "$1" ]; then exit 3; fi; [ -f "$1" ] || exit 9; cat "$1"', "sh", self._path(name), check=False)
        if result.returncode == 3:
            return None
        require(result.returncode == 0, "Cannot read a regular tracked Web file")
        return result.stdout

    def write(self, name, value):
        require(name in FILES, "Refusing to write an untracked Web file")
        require(not self.readonly, "Web filesystem is read-only; no configuration changes will be attempted")
        self._mutate(self._path(name), value)

    def _mutate(self, path, value):
        script = '''set -eu
p="$1"; t="$p.jellytv-tmp"
uid=$(id -u)
trusted() {
    meta=$(stat -c '%u %a' -- "$1")
    owner=${meta% *}; mode=${meta#* }
    { [ "$owner" = 0 ] || [ "$owner" = "$uid" ]; } &&
        [ "$((0$mode & 022))" = 0 ]
}
d=$(dirname -- "$p")
while :; do
    [ ! -L "$d" ] || exit 9
    if [ -e "$d" ]; then
        [ -d "$d" ] && trusted "$d" || exit 9
    fi
    [ "$d" != / ] || break
    d=$(dirname -- "$d")
done
[ ! -L "$p" ] || exit 9
if [ -e "$p" ]; then [ -f "$p" ] && trusted "$p" || exit 9; fi
if [ "$2" = remove ]; then rm -f -- "$p"; exit; fi
[ ! -e "$t" ] && [ ! -L "$t" ] || exit 9
mkdir -p "$(dirname "$p")"
(set -C; cat > "$t")
if [ -f "$p" ]; then chmod --reference="$p" "$t"; chown --reference="$p" "$t"; else chmod 644 "$t"; fi
mv -fT -- "$t" "$p"
'''
        result = docker("exec", "-i", self.id, "sh", "-c", script, "sh", path,
                        "remove" if value is None else "replace", data=value, check=False)
        require(result.returncode != 9, "Untrusted Web path, permissions or temporary; inspect the Web directory")
        require(result.returncode == 0, "Docker Web replacement failed")

    def remove_known_temp(self, name, permitted):
        temp = name + ".jellytv-tmp"
        value = self.read(temp)
        if value is not None:
            require(value in permitted, "Unknown Web temporary; refusing recovery")
            require(not self.readonly, "Web filesystem is read-only; cannot remove a recovery temporary")
            self._mutate(self._path(temp), None)

    def identity(self):
        info = inspect_container(self.id)
        require(info["State"]["Running"] and info["Image"] == self.image, "Container changed or stopped during operation")
        require(configuration_fingerprint(info) == self.fingerprint, "Container configuration changed during operation")
        return {"id": self.id, "name": self.name, "image": self.image, "root": self.root, "fingerprint": self.fingerprint}

    def health(self):
        try:
            # A local health check must never follow a redirect or an environment
            # proxy to another host, even if that host also serves Jellyfin.
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            with opener.open(self.url + "/System/Info/Public", timeout=10) as response:
                payload = response.read(128 * 1024 + 1)
            require(len(payload) <= 128 * 1024, "Jellyfin health response exceeds its size limit")
            data = json.loads(payload)
            require(isinstance(data, dict) and data.get("ProductName") == "Jellyfin Server", "Endpoint is not Jellyfin Server")
            return data
        except (OSError, ValueError) as error:
            raise Refusal("Jellyfin health check failed; inspect the server before continuing") from error


def read_bundle(data, allow_development=False):
    require(len(data) <= MAX_PACKAGE, "Release package exceeds the size limit")
    contents = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        allowed = {"manifest.json", "jellytv-enhanced.css", "jellytv-enhanced.js", "LICENSE"}
        require(len(names) == len(set(names)) and set(names) <= allowed and allowed - {"LICENSE"} <= set(names), "Unexpected, duplicate or unsafe archive paths")
        require(sum(entry.file_size for entry in entries) <= MAX_PACKAGE, "Expanded package exceeds the size limit")
        for entry in entries:
            require(not entry.is_dir() and (entry.external_attr >> 16) & 0o170000 != 0o120000 and not entry.flag_bits & 1, "Symlink or encrypted release entry")
            contents[entry.filename] = archive.read(entry)
    manifest = json.loads(contents["manifest.json"])
    require(isinstance(manifest, dict), "Release manifest must be an object")
    version = manifest.get("version", "")
    require(isinstance(version, str) and bool(re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?", version)), "Invalid package version")
    require(manifest.get("validationStatus") == "accepted" or allow_development, "This package has not passed acceptance; development packages require explicit local --allow-development")
    require(isinstance(manifest.get("webVersions"), list) and "10.10.6" in manifest["webVersions"], "Package does not target Web 10.10.6")
    require(isinstance(manifest.get("assets"), dict), "Release manifest has no asset metadata")
    for name in ASSETS:
        basename = name.split("/")[-1]
        expected = manifest["assets"].get(basename)
        require(isinstance(expected, dict) and isinstance(expected.get("sha256"), str) and type(expected.get("bytes")) is int, "Invalid release asset metadata")
        require(digest(contents[basename]) == expected["sha256"] and len(contents[basename]) == expected["bytes"], "Release asset integrity mismatch")
    return manifest, {name: contents[name.split("/")[-1]] for name in ASSETS}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def github_request(url, token=None, binary=False):
    opener = urllib.request.build_opener(NoRedirect())
    for _ in range(4):
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == "https" and parsed.hostname in ("api.github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")
                and not parsed.username and not parsed.password and parsed.port in (None, 443), "Untrusted GitHub download redirect")
        headers = {"User-Agent": "JellyTV-installer", "Accept": "application/octet-stream" if binary else "application/vnd.github+json"}
        if token and parsed.hostname == "api.github.com":
            headers["Authorization"] = "Bearer " + token
        try:
            with opener.open(urllib.request.Request(url, headers=headers), timeout=30) as response:
                data = response.read(MAX_PACKAGE + 1)
            require(len(data) <= MAX_PACKAGE, "GitHub response exceeds the size limit")
            return data
        except urllib.error.HTTPError as error:
            if error.code in (301, 302, 303, 307, 308):
                url = urllib.parse.urljoin(url, error.headers["Location"])
                continue
            raise Refusal(f"GitHub returned HTTP {error.code}; check the repository, published release and read access") from error
    raise Refusal("Too many GitHub download redirects")


def download(repo, version, token=None):
    require(bool(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo)), "Invalid GitHub repository")
    require(isinstance(version, str) and re.fullmatch(r"v?[0-9]+\.[0-9]+\.[0-9]+", version),
            "Remote installation requires --version X.Y.Z of a published stable release")
    expected_tag = version if version.startswith("v") else "v" + version
    endpoint = "tags/" + expected_tag
    release = json.loads(github_request(f"https://api.github.com/repos/{repo}/releases/{endpoint}", token))
    require(isinstance(release, dict), "Invalid GitHub release metadata")
    require(not release.get("draft") and not release.get("prerelease"), "Only published stable releases are installed remotely")
    require(isinstance(release.get("tag_name"), str) and re.fullmatch(r"v?[0-9]+\.[0-9]+\.[0-9]+", release["tag_name"]), "Remote installation requires a stable release tag")
    tag = release["tag_name"].removeprefix("v")
    require(tag == expected_tag[1:], "GitHub returned a different release than requested")
    assets = [asset for asset in release.get("assets", []) if asset["name"] == f"jellytv-enhanced-{tag}.zip"]
    require(len(assets) == 1 and assets[0].get("state") == "uploaded", "Release is missing one complete Enhanced package")
    asset = assets[0]
    require(asset.get("size", MAX_PACKAGE + 1) <= MAX_PACKAGE and re.fullmatch(r"sha256:[0-9a-f]{64}", asset.get("digest") or ""), "Release asset needs a GitHub SHA-256 digest and a bounded size")
    data = github_request(f"https://api.github.com/repos/{repo}/releases/assets/{int(asset['id'])}", token, True)
    require(len(data) == asset["size"] and "sha256:" + digest(data) == asset["digest"], "Downloaded release integrity mismatch")
    manifest, files = read_bundle(data)
    require(manifest["version"] == tag, "Release tag and manifest version differ")
    return manifest, files


def plan_install(web, manifest, assets, state):
    if state and state.get("installed"):
        original = {name: decode(value) for name, value in state["original"].items()}
    else:
        original = {name: web.read(name) for name in FILES}
        require(original[MARKER] is None and all(original[name] is None for name in ASSETS), "Unmanaged JellyTV files exist")
        require(web.read(".jellytv-install.json") is None, "Another JellyTV installer manages this Web directory; use that installer's uninstall first")
    require(original["index.html"] and original["config.json"], "Missing Web entry files")
    html = original["index.html"].decode("utf-8")
    require("JellyTVEnhanced" not in html and "jellytv-enhanced" not in html, "Unmanaged JellyTV HTML references")
    config = json.loads(original["config.json"])
    require(isinstance(config.get("plugins"), list) and all(isinstance(value, str) for value in config["plugins"]) and "JellyTVEnhanced" not in config["plugins"], "Unsupported Web plugin configuration")
    require(bool(re.search(r"<head(?:\s[^>]*)?>", html, re.I)), "Unsupported Web HTML")
    version = manifest["version"]
    insertion = f'\n<!-- JellyTV {version}: managed by host installer -->\n<link rel="stylesheet" href="jellytv/jellytv-enhanced.css?v={version}">\n<script defer src="jellytv/jellytv-enhanced.js?v={version}"></script>\n'
    config["plugins"].append("JellyTVEnhanced")
    after = {**assets, "index.html": re.sub(r"<head(?:\s[^>]*)?>", lambda match: match[0] + insertion, html, count=1, flags=re.I).encode(),
             "config.json": (json.dumps(config, indent=2) + "\n").encode(), MARKER: json.dumps({"version": version, "manager": "jellytv-host", "container": web.id}).encode()}
    return original, after


class Manager:
    def __init__(self, web, directory):
        self.web, self.directory = web, directory
        self.state_path, self.journal_path = directory / "state.json", directory / "journal.json"
        self.state = read_state(self.state_path)

    def matching(self):
        require(not self.state or self.state["identity"] == self.web.identity(), "Container was recreated or configuration changed; inspect status and explicitly reinstall")

    def verify(self):
        if self.state and self.state.get("installed"):
            for name in FILES:
                require(self.web.read(name) == decode(self.state["current"][name]), "Tracked Web files changed; refusing to overwrite third-party changes")

    def recover(self):
        journal = read_state(self.journal_path)
        require(journal and journal["identity"] == self.web.identity(), "Recovery journal belongs to another container generation")
        require(set(journal["before"]) == set(FILES) == set(journal["after"]), "Invalid transaction journal")
        for name in FILES:
            permitted = [decode(journal["before"][name]), decode(journal["after"][name])]
            require(self.web.read(name) in permitted, "A tracked file changed outside this transaction; recovery stopped")
            self.web.remove_known_temp(name, [value for value in permitted if value is not None])
        for name in reversed(FILES):
            require(self.web.identity() == journal["identity"], "Container changed during recovery")
            before, after = decode(journal["before"][name]), decode(journal["after"][name])
            current = self.web.read(name)
            require(current in (before, after), "Concurrent Web change detected during recovery")
            if current != before:
                self.web.write(name, before)
        require(self.web.identity() == journal["identity"], "Container changed during recovery")
        for name in FILES:
            require(self.web.read(name) == decode(journal["before"][name]), "Recovery verification failed; journal retained")
        self.web.health()
        if journal["oldState"] is None:
            self.state_path.unlink(missing_ok=True)
        else:
            atomic_json(self.state_path, journal["oldState"])
        self.journal_path.unlink()
        sync_directory(self.directory)
        self.state = journal["oldState"]

    def transaction(self, after, next_state, expected_before, replacing_generation=False):
        require(not self.journal_path.exists(), "Interrupted transaction: run jellytv rollback before any other change")
        require(set(after) == set(expected_before) == set(FILES), "Transaction contains untracked or missing files")
        require(not self.web.readonly, "Web is read-only; no files changed")
        if not replacing_generation:
            self.matching(); self.verify()
        require(self.web.identity() == next_state["identity"], "Container changed after planning")
        before = {name: self.web.read(name) for name in FILES}
        require(before == expected_before, "Web changed after planning; no files overwritten")
        for name in FILES:
            require(self.web.read(name + ".jellytv-tmp") is None, "Unknown Web temporary; no changes made")
        journal = {"identity": self.web.identity(), "before": {key: encode(value) for key, value in before.items()},
                   "after": {key: encode(value) for key, value in after.items()}, "oldState": self.state, "nextState": next_state}
        if replacing_generation:
            archive = self.directory / ("previous-container-" + str(time.time_ns()) + ".json")
            atomic_json(archive, self.state)
        atomic_json(self.journal_path, journal)
        stage = "preflight"
        try:
            for name in FILES:
                stage = "write " + name
                self.web.identity()
                require(self.web.read(name) == before[name], "Concurrent Web change detected before replacement")
                self.web.write(name, after[name])
            stage = "health check"
            self.web.identity(); self.web.health()
            stage = "post-write integrity check"
            for name in FILES:
                require(self.web.read(name) == after[name], "Post-install integrity check failed")
            stage = "state commit"
            atomic_json(self.state_path, next_state)
            self.state = next_state
            self.journal_path.unlink()
            sync_directory(self.directory)
        except BaseException as error:
            if not self.journal_path.exists():
                raise Refusal(f"Operation committed before a failure at {stage}; verify the installed state with status") from error
            try:
                self.recover()
            except Exception as recovery:
                raise Refusal(f"Operation failed at {stage} ({type(error).__name__}) and recovery needs attention ({type(recovery).__name__}); journal and originals retained. Run rollback after resolving the recorded conflict.") from recovery
            raise Refusal(f"Operation failed at {stage} ({type(error).__name__}); original tracked files and state restored") from error

    def change(self, action, manifest=None, assets=None, dry_run=False, reinstall=False):
        if self.journal_path.exists():
            require(action == "rollback" and not dry_run, "Interrupted transaction exists; run rollback to restore it")
            self.recover(); return {"action": "rollback", "recovered": True}
        identity = self.web.identity()
        replacing_generation = bool(self.state and self.state["identity"] != identity)
        planning_state = self.state
        if replacing_generation:
            require(action == "install" and reinstall, "Container generation changed; use install --reinstall only after reviewing status")
            require(self.web.read(MARKER) is None, "New container carries another managed installation; manual review required")
            planning_state = None
        else:
            self.matching(); self.verify()
        installed = bool(planning_state and planning_state.get("installed"))
        expected_before = {name: self.web.read(name) for name in FILES}
        if action in ("install", "update"):
            require(action != "update" or installed, "Enhanced is not installed; run install first")
            require(action != "install" or not installed, "Enhanced is already installed; run update")
            original, after = plan_install(self.web, manifest, assets, planning_state)
            next_state = {"schema": 1, "identity": identity, "installed": True, "version": manifest["version"],
                          "original": {key: encode(value) for key, value in original.items()}, "current": {key: encode(value) for key, value in after.items()},
                          "previous": {**planning_state, "previous": None} if installed else None}
        elif action in ("uninstall", "rollback"):
            require(installed, "Enhanced is not installed")
            previous = self.state.get("previous") if action == "rollback" else None
            if previous:
                after = {key: decode(value) for key, value in previous["current"].items()}
                next_state = previous
            else:
                after = {key: decode(value) for key, value in self.state["original"].items()}
                next_state = {**self.state, "installed": False, "previous": None, "current": self.state["original"]}
        else:
            raise Refusal("Unknown mutation")
        require(not self.web.readonly, "Web is read-only; no files changed and no container recreation attempted")
        result = {"action": action, "dryRun": dry_run, "container": self.web.name, "version": next_state["version"], "files": list(FILES)}
        if not dry_run:
            self.transaction(after, next_state, expected_before, replacing_generation)
            result["verified"] = True
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("install", "update", "uninstall", "status", "rollback"))
    parser.add_argument("--container"); parser.add_argument("--webroot"); parser.add_argument("--url")
    parser.add_argument("--state-dir", type=Path, default=Path("/var/lib/jellytv"))
    parser.add_argument("--repo", default=REPO); parser.add_argument("--version")
    parser.add_argument("--bundle", type=Path); parser.add_argument("--token-file", type=Path)
    parser.add_argument("--allow-development", action="store_true"); parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reinstall", action="store_true")
    args = parser.parse_args()
    require(not args.allow_development or args.bundle is not None, "Development packages are allowed only from an explicit local --bundle")
    require(args.action not in ("install", "update") or args.bundle is not None or args.version,
            "Supply --version X.Y.Z for a remote release or --bundle for a local package")
    with locked(args.state_dir):
        saved = read_state(args.state_dir / "state.json")
        selected = args.container or (saved or {}).get("identity", {}).get("name")
        web = DockerWeb(discover(selected), args.webroot, args.url, strict=args.action != "status")
        manager = Manager(web, args.state_dir)
        if args.action == "status":
            same = not saved or saved["identity"] == web.identity()
            clean = same and (not saved or not saved.get("installed") or all(web.read(name) == decode(saved["current"][name]) for name in FILES))
            result = {"container": web.name, "serverVersion": web.server["Version"], "webVersion": "10.10.6" if web.web_hash in MAIN_HASHES else None, "webroot": web.root,
                      "webSha256": web.web_hash, "compatible": web.compatible,
                      "casaosDetected": web.casaos, "gpuConfigurationDetected": web.gpu, "readOnly": web.readonly,
                      "installed": bool(same and saved and saved.get("installed")), "version": (saved or {}).get("version") if same else None,
                      "containerMatches": same, "integrityMatches": clean, "recoveryPending": manager.journal_path.exists()}
        else:
            manifest, assets = None, None
            if args.action in ("install", "update"):
                if args.bundle:
                    require(args.bundle.is_file(), "Local package must be a regular file")
                    with args.bundle.open("rb") as stream:
                        manifest, assets = read_bundle(stream.read(MAX_PACKAGE + 1), args.allow_development)
                else:
                    token = os.environ.get("GITHUB_TOKEN")
                    if args.token_file:
                        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
                        require(not args.token_file.is_symlink(), "Token file must not be a symlink")
                        with os.fdopen(os.open(args.token_file, flags), "rb") as stream:
                            info = os.fstat(stream.fileno())
                            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 4096,
                                    "Token file must be a small regular file without links")
                            if os.name != "nt":
                                require(info.st_uid == os.geteuid() and info.st_mode & 0o077 == 0,
                                        "Token file must be owned by the invoking user and private (chmod 600)")
                            token = stream.read(4097).decode("ascii").strip()
                            require(len(token) <= 4096, "Token file exceeds the size limit")
                    require(not token or not re.search(r"[\r\n]", token), "Invalid GitHub token")
                    manifest, assets = download(args.repo, args.version, token)
            result = manager.change(args.action, manifest, assets, args.dry_run, args.reinstall)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (Refusal, OSError, ValueError, KeyError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        print("JellyTV: " + str(error), file=sys.stderr)
        sys.exit(1)
