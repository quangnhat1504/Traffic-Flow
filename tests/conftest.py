import os
import sys
from pathlib import Path

# Set up test environment defaults before any module imports settings
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017/")
os.environ.setdefault("MONGODB_DB_NAME", "trafficflow_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("R2_ACCOUNT_ID", "placeholder_account_id")
os.environ.setdefault("R2_ACCESS_KEY_ID", "placeholder_access_key")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "placeholder_secret_key")
os.environ.setdefault("R2_BUCKET_NAME", "trafficflow")

# Add src to sys.path for all pytest executions
src_path = str(Path(__file__).resolve().parent.parent / "src")
if src_path not in sys.path:
    sys.path.insert(0, src_path)
