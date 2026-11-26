#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-}"

if [[ -z "$OUTPUT" ]]; then
  echo "Usage: tools/package-focus-candidate.sh /path/outside/repository/candidate.zip" >&2
  exit 2
fi

OUTPUT="$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).expanduser().resolve())' "$OUTPUT")"
case "$OUTPUT" in
  "$ROOT"/*)
    echo "Choose an output path outside the source repository." >&2
    exit 2
    ;;
esac

if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=all)" ]]; then
  echo "Commit or remove working-tree changes before packaging; the archive is built from committed source only." >&2
  exit 1
fi

COMMIT="$(git -C "$ROOT" rev-parse HEAD)"
PARENT="$(git -C "$ROOT" rev-parse --verify "$COMMIT^" 2>/dev/null)"
git -C "$ROOT" diff-tree --check "$PARENT" "$COMMIT"

mkdir -p "$(dirname "$OUTPUT")"
TEMPORARY="$(mktemp "${OUTPUT}.XXXXXX")"
trap 'rm -f "$TEMPORARY"' EXIT

echo "Building ZIP from committed source $COMMIT..."
git -C "$ROOT" archive --format=zip --output="$TEMPORARY" "$COMMIT"

python3 - "$ROOT" "$COMMIT" "$TEMPORARY" "$OUTPUT" <<'PY'
import hashlib
import os
import pathlib
import subprocess
import sys
import zipfile

root = pathlib.Path(sys.argv[1]).resolve()
commit = sys.argv[2]
temporary = pathlib.Path(sys.argv[3]).resolve()
output = pathlib.Path(sys.argv[4]).resolve()

tree = subprocess.check_output(
    ["git", "ls-tree", "-r", "-z", commit], cwd=root
)
expected = []
for record in tree.split(b"\0"):
    if not record:
        continue
    metadata, raw_name = record.split(b"\t", 1)
    mode, kind, object_id = metadata.split(b" ", 2)
    if kind != b"blob":
        raise SystemExit(f"Unsupported committed entry: {os.fsdecode(raw_name)}")
    expected.append((object_id.decode("ascii"), os.fsdecode(raw_name)))
expected.sort(key=lambda item: item[1])
expected_names = [name for _, name in expected]

with zipfile.ZipFile(temporary, "r") as archive:
    actual_names = sorted(
        info.filename for info in archive.infolist() if not info.is_dir()
    )
    if actual_names != expected_names:
        missing = sorted(set(expected_names) - set(actual_names))
        extra = sorted(set(actual_names) - set(expected_names))
        raise SystemExit(f"ZIP file list differs from commit; missing={missing}, extra={extra}")

    bad_member = archive.testzip()
    if bad_member:
        raise SystemExit(f"Archive integrity check failed at: {bad_member}")

    process = subprocess.Popen(
        ["git", "cat-file", "--batch"],
        cwd=root,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
    )
    try:
        assert process.stdin is not None
        assert process.stdout is not None
        for object_id, name in expected:
            process.stdin.write(object_id.encode("ascii") + b"\n")
            process.stdin.flush()
            header = process.stdout.readline().split()
            if len(header) != 3 or header[1] != b"blob":
                raise SystemExit(f"Could not read committed file object for: {name}")
            size = int(header[2])
            remaining = size
            with archive.open(name, "r") as member:
                while remaining:
                    chunk = process.stdout.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise SystemExit(f"Unexpected end of committed object: {name}")
                    if member.read(len(chunk)) != chunk:
                        raise SystemExit(f"ZIP content differs from commit: {name}")
                    remaining -= len(chunk)
                if member.read(1):
                    raise SystemExit(f"ZIP content is longer than committed file: {name}")
            if process.stdout.read(1) != b"\n":
                raise SystemExit(f"Malformed Git object stream after: {name}")
        process.stdin.close()
        if process.wait() != 0:
            raise SystemExit("Could not verify ZIP contents against committed source.")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()

entries = len(expected_names)
directories = set()
for name in expected_names:
    parent = pathlib.PurePosixPath(name).parent
    while parent != pathlib.PurePosixPath("."):
        directories.add(parent.as_posix())
        parent = parent.parent

temporary.replace(output)
hasher = hashlib.sha256()
with output.open("rb") as source_zip:
    for chunk in iter(lambda: source_zip.read(1024 * 1024), b""):
        hasher.update(chunk)
digest = hasher.hexdigest()
sidecar = output.with_suffix(output.suffix + ".sha256")
sidecar.write_text(f"{digest}  {output.name}\n", encoding="utf-8")
print(f"Verified {entries} committed files across {len(directories)} folders; no untracked files included.")
print(f"Commit:  {commit}")
print(f"SHA-256 {digest}")
print(f"Source ZIP: {output}")
print(f"Checksum:   {sidecar}")
PY

trap - EXIT
rm -f "$TEMPORARY"
