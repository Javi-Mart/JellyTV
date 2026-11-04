#!/usr/bin/env python3
"""Summarize saved Android lint and JUnit XML without trusting Gradle's exit code."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


def findings(directory):
    reports = sorted(directory.glob("*.xml"))
    if not reports:
        raise ValueError(f"No lint XML reports: {directory}")
    result = []
    for report in reports:
        for issue in ET.parse(report).getroot().findall("issue"):
            locations = []
            for location in issue.findall("location"):
                file = location.get("file", "").replace("\\", "/")
                # Stored reports may have been produced in another checkout.
                marker = "/android-tv/"
                if marker in file:
                    file = file.split(marker, 1)[1]
                locations.append((file, location.get("line"), location.get("column")))
            result.append((report.name, issue.get("id"), issue.get("severity"),
                           issue.get("message"), tuple(locations)))
    return Counter(result)


def lint_summary(issues):
    counts = Counter()
    ids = Counter()
    for issue, count in issues.items():
        counts[issue[2]] += count
        ids[issue[1]] += count
    return {"counts": dict(sorted(counts.items())), "ids": dict(sorted(ids.items()))}


def semantic_findings(issues, errors_only=False):
    """Line shifts are not new findings; retain file, message, severity and multiplicity."""
    result = Counter()
    for issue, count in issues.items():
        if errors_only and issue[2] not in ("Error", "Fatal"):
            continue
        result[(issue[0], issue[1], issue[2], issue[3], tuple(location[0] for location in issue[4]))] += count
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--evidence", type=Path, default=Path(__file__).resolve().parents[1] / "evidence")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    upstream = findings(args.evidence / "lint" / "upstream")
    jellytv = findings(args.evidence / "lint" / "jellytv")
    tests = []
    for report in sorted(args.source.glob("**/build/test-results/testDebugUnitTest/TEST-*.xml")):
        suite = ET.parse(report).getroot()
        tests.append({"name": suite.get("name"), **{
            key: int(suite.get(key, "0")) for key in ("tests", "failures", "errors", "skipped")
        }})
    totals = {key: sum(suite[key] for suite in tests) for key in ("tests", "failures", "errors", "skipped")}
    apks = [{"file": apk.name, "bytes": apk.stat().st_size,
             "sha256": hashlib.sha256(apk.read_bytes()).hexdigest()}
            for apk in sorted((args.source / "app/build/outputs/apk/debug").glob("*.apk"))]
    lint_errors = sum(count for issue, count in jellytv.items() if issue[2] in ("Error", "Fatal"))
    upstream_errors = semantic_findings(upstream, errors_only=True)
    jellytv_errors = semantic_findings(jellytv, errors_only=True)
    result = {
        "upstream": "v0.19.10 / 984181a3d6ab14e9a6d2dcc850c582e1c138bd95",
        "lint": {"status": "FAIL" if lint_errors else "PASS",
                 "upstream": lint_summary(upstream), "jellytv": lint_summary(jellytv),
                 "addedFindings": sum((jellytv - upstream).values()),
                 "removedFindings": sum((upstream - jellytv).values()),
                 "comparison": "PASS" if upstream == jellytv else "CHANGED",
                 "errorComparisonIgnoringLineShifts": "UNCHANGED" if upstream_errors == jellytv_errors else "CHANGED",
                 "newErrors": sum((jellytv_errors - upstream_errors).values()),
                 "semanticAddedFindings": sum((semantic_findings(jellytv) - semantic_findings(upstream)).values())},
        "unitTests": {"status": "PASS" if totals["tests"] and not totals["failures"] and not totals["errors"] else "FAIL",
                      "totals": totals, "suites": tests},
        "apk": apks,
        "deviceAcceptance": "See runtime-1080.json, runtime-4k.json and ../docs/device-validation.md; build and unit tests do not establish runtime acceptance."
    }
    output = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    print(output, end="")
    return 1 if lint_errors or result["unitTests"]["status"] != "PASS" or not apks else 0


if __name__ == "__main__":
    sys.exit(main())
