"""
Regression tests for recorder executables and Linux launcher script binary validation.
Guarantees that idoracing-recorder.exe is never a Linux ELF binary and that launcher
scripts properly identify Windows PE executables.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RECORDER_DIR = REPO_ROOT / "recorder"


def test_recorder_binaries_are_windows_pe():
    """
    Regression test: idoracing-recorder.exe must be a real Windows PE executable (magic 'MZ'),
    never a Linux ELF binary (magic '\x7fELF') that aborts with 'reads ACC Windows shared memory'.
    """
    candidates = [
        RECORDER_DIR / "idoracing-recorder.exe",
        RECORDER_DIR / "linux" / "idoracing-recorder.exe",
    ]

    for exe in candidates:
        if not exe.exists():
            continue
        data = exe.read_bytes()
        assert len(data) >= 2, f"{exe} is empty"
        magic = data[:2]
        assert magic == b"MZ", (
            f"{exe} is NOT a Windows PE executable! Got magic {magic!r}. "
            f"If it starts with {data[:4]!r}, it is a Linux ELF binary built without GOOS=windows."
        )
        assert not data.startswith(b"\x7fELF"), f"{exe} was accidentally built as a Linux ELF executable!"


def test_launcher_warns_on_elf_executable():
    """
    Test that acc-with-recorder.sh and sim-with-recorder.sh detect an ELF binary
    and emit a visible warning on stderr/log rather than failing silently.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        fake_elf = tmp_path / "fake-recorder.exe"
        # Write valid Linux ELF magic bytes followed by dummy data
        fake_elf.write_bytes(b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 64)

        fake_proton = tmp_path / "proton"
        fake_proton.write_text("#!/bin/sh\nexit 0\n")
        fake_proton.chmod(0o755)

        for script_name in ("acc-with-recorder.sh", "sim-with-recorder.sh"):
            script = RECORDER_DIR / "linux" / script_name
            if not script.exists():
                continue

            cmd = [
                "bash",
                str(script),
                str(fake_proton),
                "waitforexitandrun",
                "/games/acc/AC2-Win64-Shipping.exe",
            ]
            env = {
                **os.environ,
                "IDORACING_RECORDER": str(fake_elf),
                "IDORACING_RECORDER_DELAY": "0",
                "IDORACING_RECORDER_LOG": str(tmp_path / "test.log"),
            }

            res = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=5)
            stderr = res.stderr
            assert "WARNING" in stderr or "Windows PE" in stderr, (
                f"[{script_name}] Launcher did not warn about ELF executable! Stderr: {stderr}"
            )
