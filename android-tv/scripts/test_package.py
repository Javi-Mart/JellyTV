#!/usr/bin/env python3
"""Exercise install and rollback against the exact upstream Git archive."""
import argparse
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

import theme


class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = theme.load_manifest()
        cls.temporary = tempfile.TemporaryDirectory(prefix="jellytv-patch-", dir=WORK)
        cls.source = Path(cls.temporary.name)
        archive = subprocess.check_output([
            "git", "-C", str(SOURCE), "archive", "--format=zip", cls.manifest["upstreamCommit"]
        ])
        with zipfile.ZipFile(io.BytesIO(archive)) as source_archive:
            source_archive.extractall(cls.source)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def tearDown(self):
        if theme.verify(self.source, self.manifest) == "after":
            theme.change(self.source, self.manifest, "before")

    def test_roundtrip_and_idempotent_operations(self):
        before = {name: (self.source / name).read_bytes() for name in self.manifest["source"]}
        self.assertEqual(theme.verify(self.source, self.manifest), "before")
        theme.change(self.source, self.manifest, "after")
        self.assertEqual(theme.verify(self.source, self.manifest), "after")
        theme.change(self.source, self.manifest, "after")
        theme.change(self.source, self.manifest, "before")
        theme.change(self.source, self.manifest, "before")
        self.assertEqual(theme.verify(self.source, self.manifest), "before")
        self.assertEqual(before, {name: (self.source / name).read_bytes() for name in before})
        for entry in self.manifest["changes"]:
            if entry["before"] is None:
                self.assertFalse((self.source / entry["path"]).exists())

    def test_user_edit_is_rejected_and_preserved(self):
        entry = next(item for item in self.manifest["changes"] if item["before"] is not None)
        path = self.source / entry["path"]
        original = path.read_bytes()
        edited = original + b"\n// local customization\n"
        try:
            path.write_bytes(edited)
            with self.assertRaisesRegex(ValueError, "Local edit"):
                theme.verify(self.source, self.manifest)
            self.assertEqual(path.read_bytes(), edited)
        finally:
            path.write_bytes(original)

    def test_different_upstream_is_rejected(self):
        path = self.source / "gradle.properties"
        original = path.read_bytes()
        try:
            path.write_bytes(original + b"\nunsupported=true\n")
            with self.assertRaisesRegex(ValueError, "Source differs"):
                theme.verify(self.source, self.manifest)
        finally:
            path.write_bytes(original)

    def test_partial_patch_is_rejected(self):
        entry = self.manifest["changes"][0]
        path = self.source / entry["path"]
        original = path.read_bytes() if path.exists() else None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((theme.PACKAGE / "payload" / "after" / entry["path"]).read_bytes())
            with self.assertRaisesRegex(ValueError, "Partially applied"):
                theme.verify(self.source, self.manifest)
        finally:
            if original is None:
                path.unlink()
            else:
                path.write_bytes(original)

    def test_crlf_survives_roundtrip(self):
        entry = next(item for item in self.manifest["changes"] if item["before"] is not None)
        path = self.source / entry["path"]
        original = path.read_bytes()
        crlf = theme.canonical(original).replace(b"\n", b"\r\n")
        try:
            path.write_bytes(crlf)
            self.assertEqual(theme.verify(self.source, self.manifest), "before")
            theme.change(self.source, self.manifest, "after")
            self.assertIn(b"\r\n", path.read_bytes())
            theme.change(self.source, self.manifest, "before")
            self.assertEqual(path.read_bytes(), crlf)
        finally:
            path.write_bytes(original)

    def test_unsafe_paths_rejected(self):
        for relative in ("../escape", "/absolute", "C:/absolute", "one\\two"):
            with self.subTest(relative=relative), self.assertRaises(ValueError):
                theme.safe_path(self.source, relative)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--work", type=Path, default=theme.PACKAGE / "../.lab/android-tools")
    args = parser.parse_args()
    SOURCE = args.source.resolve()
    WORK = args.work.resolve()
    WORK.mkdir(parents=True, exist_ok=True)
    unittest.main(argv=[__file__], verbosity=2)
