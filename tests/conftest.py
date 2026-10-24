import os
import tempfile

# api.server opens its database at import time, so this has to run before any test module imports it.
_db_dir = tempfile.mkdtemp(prefix="idoracing-tests-")
os.environ["IDORACING_DB_PATH"] = os.path.join(_db_dir, "idoracing.db")
os.environ.setdefault("AI_ENABLED", "false")
os.environ.setdefault("IDORACING_SKIP_AUTO_IMPORT", "1")
