"""Build the optional Mac dual-stream guide and matching universal extension ZIP."""
import hashlib
import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(sys.argv[1])
with ZipFile(root / "vocalume-extension.zip") as extension:
    version = json.loads(extension.read("manifest.json"))["version"]
    output = root / f"vocalume-dual-live-lab-mac-{version}.zip"
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as lab:
        lab.write("docs/releases/dual-live-lab-4.6.6.md", "README.md")
        for name in extension.namelist():
            lab.writestr(f"extension/{name}", extension.read(name))

digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(".sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
