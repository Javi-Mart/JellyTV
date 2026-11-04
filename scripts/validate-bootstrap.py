"""Run bootstrap faults offline; record the exact platform, scope and source hashes."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover(str(ROOT / 'tests/bootstrap')))
names = ['installer/jellytv.py', 'installer/bootstrap.py', 'scripts/package-setup.py', 'scripts/package-enhanced.py',
         'scripts/validate-bootstrap.py', 'tests/bootstrap/test_bootstrap.py', 'tests/bootstrap/test_package_setup.py']
report = {'date': datetime.now(timezone.utc).isoformat(), 'status': 'PASS' if result.wasSuccessful() else 'FAIL',
          'platform': platform.system(), 'python': platform.python_version(), 'testsRun': result.testsRun,
          'failed': len(result.failures), 'errors': len(result.errors), 'skipped': len(result.skipped),
          'skipReasons': [reason for _test, reason in result.skipped], 'acceptance': 'OPEN',
          'scope': 'Real local filesystem and simulated Web; no Docker, network, production writes or release publication',
          'sources': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in names}}
output = ROOT / ('.lab/reports/bootstrap-unit-' + platform.system().lower() + '.json')
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('w', encoding='utf-8', newline='\n') as stream: json.dump(report, stream, indent=2); stream.write('\n')
sys.exit(0 if result.wasSuccessful() else 1)
