"""Package the Windows companion without the universal ZIP's macOS setup tools."""

import sys
from pathlib import Path
from zipfile import ZipFile


MAC_SETUP_FILES = {
    "desktop/capture-lease.mjs",
    "desktop/host.py",
    "desktop/install-mac.cjs",
    "desktop/install.py",
    "desktop/relay.py",
    "desktop/requirements.txt",
    "desktop/translation_support.py",
}


def main():
    source, target = map(Path, sys.argv[1:])
    if source.resolve() == target.resolve():
        raise ValueError("Windows and universal ZIP paths must differ")

    guide = Path(__file__).resolve().parents[1] / "docs" / "windows-extension-install.md"
    with ZipFile(source) as universal, ZipFile(target, "w") as windows:
        for entry in universal.infolist():
            if entry.filename in MAC_SETUP_FILES:
                continue
            data = guide.read_bytes() if entry.filename == "INSTALL.md" else universal.read(entry)
            windows.writestr(entry, data, compresslevel=9)


if __name__ == "__main__":
    main()
