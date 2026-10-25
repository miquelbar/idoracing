import os
import shutil
import tempfile
from pathlib import Path

# api.server opens its database at import time, so this has to run before any test module imports it.
_db_dir = tempfile.mkdtemp(prefix="idoracing-tests-")
os.environ["IDORACING_DB_PATH"] = os.path.join(_db_dir, "idoracing.db")

# Isolate spotter voice output so tests never modify repo audio assets
_voices_dir = tempfile.mkdtemp(prefix="idoracing-test-voices-")
_base_voices = Path(__file__).resolve().parent.parent / "recorder" / "voices"
for _lang in ("es", "en"):
    _src = _base_voices / _lang
    if _src.is_dir():
        shutil.copytree(_src, Path(_voices_dir) / _lang)
os.environ["IDORACING_VOICES_DIR"] = _voices_dir

# Isolate AC EVO setup search directory so tests are isolated from local user Saved Games
_acevo_setups_dir = tempfile.mkdtemp(prefix="idoracing-test-acevo-setups-")
os.environ["ACEVO_SETUPS_DIR"] = _acevo_setups_dir

os.environ.setdefault("AI_ENABLED", "false")
os.environ.setdefault("IDORACING_SKIP_AUTO_IMPORT", "1")
