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

mkdir -p "$(dirname "$OUTPUT")"

echo "Checking whitespace changes..."
git -C "$ROOT" diff --check

echo "Running the focused Focus and startup suites..."
(
  cd "$ROOT"
  node --test tests/focus-*.test.cjs tests/nav-audio-audit-fixes.test.cjs tests/boot-assets.test.cjs
)

echo "Packaging tracked and non-ignored working files..."
python3 - "$ROOT" "$OUTPUT" <<'PY'
import hashlib
import os
import pathlib
import subprocess
import sys
import tempfile
import zipfile

root = pathlib.Path(sys.argv[1]).resolve()
output = pathlib.Path(sys.argv[2]).resolve()
if output == root or root in output.parents:
    raise SystemExit("Choose an output path outside the source repository.")

raw = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    cwd=root,
)
names = [name.decode("utf-8") for name in raw.split(b"\0") if name]
files = []
directories = set()
for name in names:
    relative = pathlib.PurePosixPath(name)
    if relative.is_absolute() or ".." in relative.parts:
        raise SystemExit(f"Unsafe source path: {name}")
    source = root.joinpath(*relative.parts)
    if source.is_symlink():
        raise SystemExit(f"Refusing to package symlink: {name}")
    if not source.is_file():
        raise SystemExit(f"Expected a regular source file: {name}")
    files.append((name, source))
    parent = relative.parent
    while parent != pathlib.PurePosixPath("."):
        directories.add(parent.as_posix())
        parent = parent.parent

fd, temporary_name = tempfile.mkstemp(prefix=output.name + ".", suffix=".tmp", dir=output.parent)
os.close(fd)
temporary = pathlib.Path(temporary_name)
try:
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for directory in sorted(directories):
            archive.writestr(directory.rstrip("/") + "/", b"")
        for name, source in sorted(files):
            archive.write(source, arcname=name)
    with zipfile.ZipFile(temporary, "r") as archive:
        bad_member = archive.testzip()
        if bad_member:
            raise SystemExit(f"Archive integrity check failed at: {bad_member}")
        entries = len(archive.infolist())
    temporary.replace(output)
except BaseException:
    temporary.unlink(missing_ok=True)
    raise

hasher = hashlib.sha256()
with output.open("rb") as source_zip:
    for chunk in iter(lambda: source_zip.read(1024 * 1024), b""):
        hasher.update(chunk)
digest = hasher.hexdigest()
sidecar = output.with_suffix(output.suffix + ".sha256")
sidecar.write_text(f"{digest}  {output.name}\n", encoding="utf-8")
print(f"Verified {len(files)} files + {len(directories)} folders = {entries} ZIP entries")
print(f"SHA-256 {digest}")
print(f"Source ZIP: {output}")
print(f"Checksum:   {sidecar}")
PY
