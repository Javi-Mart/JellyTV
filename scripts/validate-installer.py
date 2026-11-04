"""Run offline installer tests and write evidence tied to exact source hashes."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
suite = unittest.defaultTestLoader.discover(str(ROOT / "tests/installer"))
result = unittest.TextTestRunner(verbosity=2).run(suite)
report = {
    "date": datetime.now(timezone.utc).isoformat(),
    "status": "PASS" if result.wasSuccessful() else "FAIL",
    "command": "python scripts/validate-installer.py",
    "testsRun": result.testsRun,
    "failed": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped),
    "sources": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in
                ("installer/jellytv.py", "tests/installer/test_installer.py", "tests/installer/test_host_transport.py", "scripts/validate-installer.py")},
    "scope": "Offline fault injection, discovery and package validation with simulated Docker transport",
    "dockerLifecycle": "PENDING", "casaosRealServer": "UNVERIFIED", "acceptance": "OPEN"
}
output = ROOT / ".lab/reports/installer-unit.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
sys.exit(0 if result.wasSuccessful() else 1)
