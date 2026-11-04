"""Run bootstrap tests in an owned offline Linux container without a Docker socket."""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
NAME = 'jellytv-bootstrap-linux-lab'
IMAGE = 'python@sha256:673719e071ecf27434fd2635bbd8d00f49f4fdd81f243143438a42ced8bedf60'
LABEL = 'bootstrap-linux-validation'
sys.path.insert(0, str(ROOT / 'installer'))
import jellytv


def docker(*args, check=True):
    result = subprocess.run(['docker', *args], capture_output=True, timeout=90)
    if check and result.returncode: raise RuntimeError(result.stderr.decode(errors='replace'))
    return result


jellytv.require_local_docker()
assert not docker('ps', '-aq', '--filter', 'name=^/' + NAME + '$').stdout.strip(), 'Existing lab needs inspection first'
owned = docker('create', '--name', NAME, '--label', 'org.jellytv.lab=' + LABEL, '--network', 'none',
               '--memory', '256m', '--cpus', '1', '--workdir', '/work', '--entrypoint', 'sleep', IMAGE, 'infinity').stdout.decode().strip()


def verify():
    info = json.loads(docker('inspect', owned).stdout)[0]
    assert info['Id'] == owned and info['Name'] == '/' + NAME
    assert info['Config']['Image'] == IMAGE and info['Config']['Labels']['org.jellytv.lab'] == LABEL
    assert info['HostConfig']['NetworkMode'] == 'none' and not info['Mounts']


try:
    verify(); docker('start', owned)
    docker('exec', owned, 'mkdir', '-p', '/work/installer', '/work/scripts', '/work/tests/bootstrap', '/work/tests/installer')
    paths = ['LICENSE', 'installer/jellytv.py', 'installer/bootstrap.py', 'scripts/package-enhanced.py', 'scripts/package-setup.py',
             'scripts/validate-bootstrap.py', 'tests/bootstrap/test_bootstrap.py', 'tests/bootstrap/test_package_setup.py', 'tests/installer/test_installer.py']
    for name in paths: docker('cp', str(ROOT / name), owned + ':/work/' + name)
    result = docker('exec', owned, 'python3', 'scripts/validate-bootstrap.py', check=False)
    print(result.stderr.decode(errors='replace'))
    report_path = ROOT / '.lab/reports/bootstrap-unit-linux.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    docker('cp', owned + ':/work/.lab/reports/bootstrap-unit-linux.json', str(report_path))
    report = json.loads(report_path.read_text())
    report.update({'runnerImage': IMAGE, 'networkDisabled': True, 'dockerSocketMounted': False})
    assert result.returncode == 0, 'Linux bootstrap tests failed; report preserved'
finally:
    verify(); docker('rm', '--force', '--volumes', owned)
    if 'report' in globals():
        report['ownedContainerRemoved'] = True
        with report_path.open('w', encoding='utf-8', newline='\n') as stream: json.dump(report, stream, indent=2); stream.write('\n')
