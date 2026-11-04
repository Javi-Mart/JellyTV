"""Build the small, allowlisted Enhanced installer package, never the private lab."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ("jellytv-enhanced.css", "jellytv-enhanced.js")


def package(dist, output, development=False):
    manifest = json.loads((dist / "manifest.json").read_text(encoding="utf-8-sig"))
    version = manifest.get("version", "")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?", version):
        raise ValueError("Invalid release version")
    if manifest.get("validationStatus") != "accepted" and not development:
        raise ValueError("Acceptance remains open; use --development only for local validation packages")
    contents = {"manifest.json": (json.dumps(manifest, indent=2) + "\n").encode()}
    for name in FILES:
        data = (dist / name).read_bytes()
        entry = manifest["assets"][name]
        if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError(f"Build integrity mismatch: {name}")
        contents[name] = data
    contents["LICENSE"] = (ROOT / "LICENSE").read_bytes()
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"jellytv-enhanced-{version}.zip"
    temp = target.with_suffix(".zip.tmp")
    if temp.exists():
        raise ValueError("Unexpected package temporary exists; inspect it before retrying")
    try:
        with zipfile.ZipFile(temp, "x", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in sorted(contents.items()):
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
        with zipfile.ZipFile(temp) as archive:
            if archive.testzip() is not None or set(archive.namelist()) != set(contents):
                raise ValueError("Package validation failed")
        temp.replace(target)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(".zip.sha256").write_text(f"{digest}  {target.name}\n", encoding="utf-8")
    return {"path": str(target), "sha256": digest, "version": version,
            "validationStatus": manifest.get("validationStatus"), "development": development}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", type=Path, default=ROOT / "dist")
    parser.add_argument("--output", type=Path, default=ROOT / "releases")
    parser.add_argument("--development", action="store_true")
    args = parser.parse_args()
    print(json.dumps(package(args.dist, args.output, args.development), indent=2))


if __name__ == "__main__":
    main()
