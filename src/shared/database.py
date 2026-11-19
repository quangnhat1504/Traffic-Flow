import copy
import json
import logging
import os
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import OperationFailure, PyMongoError, ServerSelectionTimeoutError

from shared.config import settings

logger = logging.getLogger(__name__)


class _InsertOneResult:
    def __init__(self, inserted_id: Any):
        self.inserted_id = inserted_id


class _UpdateResult:
    def __init__(self, matched_count: int, modified_count: int, upserted_id: Any = None):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.upserted_id = upserted_id


class _DeleteResult:
    def __init__(self, deleted_count: int):
        self.deleted_count = deleted_count


class LocalCursor:
    def __init__(self, docs: List[dict]):
        self._docs = docs

    def sort(self, key: str, direction: int = 1):
        reverse = direction < 0
        self._docs.sort(key=lambda doc: (doc.get(key) is None, doc.get(key)), reverse=reverse)
        return self

    def limit(self, count: int):
        self._docs = self._docs[:count]
        return self

    async def to_list(self, length: Optional[int] = None):
        docs = self._docs if length is None else self._docs[:length]
        return copy.deepcopy(docs)


class LocalJsonCollection:
    def __init__(self, database: "LocalJsonDatabase", name: str):
        self._database = database
        self._name = name

    def _docs(self) -> List[dict]:
        return self._database._data.setdefault(self._name, [])

    def _matches(self, doc: dict, query: Optional[dict]) -> bool:
        return _matches_query(doc, query)

    async def insert_one(self, doc: dict):
        async with self._database.lock:
            stored = copy.deepcopy(doc)
            stored.setdefault("_id", self._database.next_id())
            self._docs().append(stored)
            self._database.save()
            return _InsertOneResult(stored["_id"])

    async def insert_many(self, docs: Iterable[dict]):
        inserted = []
        async with self._database.lock:
            for doc in docs:
                stored = copy.deepcopy(doc)
                stored.setdefault("_id", self._database.next_id())
                self._docs().append(stored)
                inserted.append(stored["_id"])
            self._database.save()
        return type("InsertManyResult", (), {"inserted_ids": inserted})()

    async def find_one(self, query: Optional[dict] = None):
        async with self._database.lock:
            for doc in self._docs():
                if self._matches(doc, query):
                    return copy.deepcopy(doc)
        return None

    def find(self, query: Optional[dict] = None):
        docs = [copy.deepcopy(doc) for doc in self._docs() if self._matches(doc, query)]
        return LocalCursor(docs)

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        async with self._database.lock:
            for doc in self._docs():
                if self._matches(doc, query):
                    if "$set" in update:
                        doc.update(copy.deepcopy(update["$set"]))
                    else:
                        doc.update(copy.deepcopy(update))
                    self._database.save()
                    return _UpdateResult(1, 1)
            if upsert:
                new_doc = copy.deepcopy(query)
                if "$set" in update:
                    new_doc.update(copy.deepcopy(update["$set"]))
                else:
                    new_doc.update(copy.deepcopy(update))
                new_doc.setdefault("_id", self._database.next_id())
                self._docs().append(new_doc)
                self._database.save()
                return _UpdateResult(0, 0, new_doc["_id"])
        return _UpdateResult(0, 0)

    async def delete_many(self, query: Optional[dict] = None):
        async with self._database.lock:
            original = len(self._docs())
            self._database._data[self._name] = [doc for doc in self._docs() if not self._matches(doc, query)]
            deleted = original - len(self._database._data[self._name])
            self._database.save()
            return _DeleteResult(deleted)

    async def count_documents(self, query: Optional[dict] = None):
        async with self._database.lock:
            return sum(1 for doc in self._docs() if self._matches(doc, query))

    def aggregate(self, pipeline: list):
        docs = [copy.deepcopy(doc) for doc in self._docs()]
        for stage in pipeline or []:
            if "$match" in stage:
                docs = [doc for doc in docs if _matches_query(doc, stage["$match"])]
            elif "$group" in stage:
                spec = stage["$group"]
                id_expression = spec.get("_id")
                sum_expression = next(
                    (value["$sum"] for key, value in spec.items() if key != "_id" and isinstance(value, dict) and "$sum" in value),
                    None,
                )
                grouped: dict[Any, dict] = {}
                for doc in docs:
                    group_id = doc.get(id_expression[1:]) if isinstance(id_expression, str) and id_expression.startswith("$") else id_expression
                    row = grouped.setdefault(group_id, {"_id": group_id})
                    if sum_expression:
                        field = sum_expression[1:] if isinstance(sum_expression, str) and sum_expression.startswith("$") else None
                        row_key = next((key for key in spec if key != "_id"), "total")
                        row[row_key] = row.get(row_key, 0) + (int(doc.get(field) or 0) if field else int(sum_expression or 0))
                docs = list(grouped.values())
        return LocalCursor(docs)


class LocalJsonDatabase:
    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = _AsyncThreadLock()
        self._counter = 0
        self._data: Dict[str, List[dict]] = {}
        self.load()

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)
        return LocalJsonCollection(self, name)

    def __getitem__(self, name: str):
        return LocalJsonCollection(self, name)

    def next_id(self) -> str:
        self._counter += 1
        return f"local-{self._counter}"

    def load(self):
        if self.path.exists():
            try:
                payload = json.loads(self.path.read_text(encoding="utf-8"))
                self._counter = int(payload.get("_counter", 0))
                self._data = {k: _restore_dates(v, k) for k, v in payload.items() if k != "_counter"}
            except Exception as exc:
                logger.warning("Could not read local DB %s: %s", self.path, exc)
                self._data = {}

    def save(self):
        payload = {"_counter": self._counter, **self._data}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        serialized = json.dumps(payload, default=_json_default, ensure_ascii=False, indent=2)
        temporary_path = self.path.with_name(f".{self.path.name}.tmp")
        temporary_path.write_text(serialized, encoding="utf-8")
        os.replace(temporary_path, self.path)


class SQLiteWalCollection:
    def __init__(self, database: "SQLiteWalDatabase", name: str):
        self._database = database
        self._name = name

    def _get_all_docs(self) -> List[dict]:
        with self._database.conn:
            cursor = self._database.conn.cursor()
            cursor.execute(
                "SELECT data FROM collections WHERE collection = ? ORDER BY id ASC",
                (self._name,),
            )
            rows = cursor.fetchall()
        docs = []
        for (raw,) in rows:
            try:
                doc = json.loads(raw)
                docs.append(_restore_dates(doc, self._name))
            except Exception:
                pass
        return docs

    def _matches(self, doc: dict, query: Optional[dict]) -> bool:
        return _matches_query(doc, query)

    async def insert_one(self, doc: dict):
        async with self._database.lock:
            stored = copy.deepcopy(doc)
            doc_id = stored.get("_id") or stored.get("task_id") or stored.get("video_id") or self._database.next_id()
            stored["_id"] = str(doc_id)
            serialized = json.dumps(stored, default=_json_default, ensure_ascii=False)
            with self._database.conn:
                self._database.conn.execute(
                    """
                    INSERT INTO collections (collection, doc_id, data)
                    VALUES (?, ?, ?)
                    ON CONFLICT(collection, doc_id) DO UPDATE SET data=excluded.data
                    """,
                    (self._name, str(doc_id), serialized),
                )
            return _InsertOneResult(stored["_id"])

    async def insert_many(self, docs: Iterable[dict]):
        inserted = []
        async with self._database.lock:
            with self._database.conn:
                for doc in docs:
                    stored = copy.deepcopy(doc)
                    doc_id = stored.get("_id") or stored.get("task_id") or stored.get("video_id") or self._database.next_id()
                    stored["_id"] = str(doc_id)
                    serialized = json.dumps(stored, default=_json_default, ensure_ascii=False)
                    self._database.conn.execute(
                        """
                        INSERT INTO collections (collection, doc_id, data)
                        VALUES (?, ?, ?)
                        ON CONFLICT(collection, doc_id) DO UPDATE SET data=excluded.data
                        """,
                        (self._name, str(doc_id), serialized),
                    )
                    inserted.append(stored["_id"])
        return type("InsertManyResult", (), {"inserted_ids": inserted})()

    async def find_one(self, query: Optional[dict] = None):
        async with self._database.lock:
            if query and len(query) == 1 and "_id" in query and isinstance(query["_id"], (str, int)):
                target_id = str(query["_id"])
                with self._database.conn:
                    cursor = self._database.conn.cursor()
                    cursor.execute(
                        "SELECT data FROM collections WHERE collection = ? AND doc_id = ? LIMIT 1",
                        (self._name, target_id),
                    )
                    row = cursor.fetchone()
                if row:
                    doc = json.loads(row[0])
                    return _restore_dates(doc, self._name)
                return None

            for doc in self._get_all_docs():
                if self._matches(doc, query):
                    return copy.deepcopy(doc)
        return None

    def find(self, query: Optional[dict] = None):
        docs = [copy.deepcopy(doc) for doc in self._get_all_docs() if self._matches(doc, query)]
        return LocalCursor(docs)

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        async with self._database.lock:
            all_docs = self._get_all_docs()
            for doc in all_docs:
                if self._matches(doc, query):
                    if "$set" in update:
                        doc.update(copy.deepcopy(update["$set"]))
                    else:
                        doc.update(copy.deepcopy(update))
                    serialized = json.dumps(doc, default=_json_default, ensure_ascii=False)
                    doc_id = str(doc.get("_id"))
                    with self._database.conn:
                        self._database.conn.execute(
                            "UPDATE collections SET data = ? WHERE collection = ? AND doc_id = ?",
                            (serialized, self._name, doc_id),
                        )
                    return _UpdateResult(1, 1)

            if upsert:
                new_doc = copy.deepcopy(query)
                if "$set" in update:
                    new_doc.update(copy.deepcopy(update["$set"]))
                else:
                    new_doc.update(copy.deepcopy(update))
                doc_id = new_doc.get("_id") or self._database.next_id()
                new_doc["_id"] = str(doc_id)
                serialized = json.dumps(new_doc, default=_json_default, ensure_ascii=False)
                with self._database.conn:
                    self._database.conn.execute(
                        "INSERT INTO collections (collection, doc_id, data) VALUES (?, ?, ?)",
                        (self._name, str(doc_id), serialized),
                    )
                return _UpdateResult(0, 0, new_doc["_id"])
        return _UpdateResult(0, 0)

    async def delete_many(self, query: Optional[dict] = None):
        async with self._database.lock:
            if not query:
                with self._database.conn:
                    cursor = self._database.conn.cursor()
                    cursor.execute("SELECT COUNT(*) FROM collections WHERE collection = ?", (self._name,))
                    count = cursor.fetchone()[0]
                    self._database.conn.execute("DELETE FROM collections WHERE collection = ?", (self._name,))
                return _DeleteResult(count)

            deleted = 0
            for doc in self._get_all_docs():
                if self._matches(doc, query):
                    doc_id = str(doc.get("_id"))
                    with self._database.conn:
                        self._database.conn.execute(
                            "DELETE FROM collections WHERE collection = ? AND doc_id = ?",
                            (self._name, doc_id),
                        )
                    deleted += 1
            return _DeleteResult(deleted)

    async def count_documents(self, query: Optional[dict] = None):
        async with self._database.lock:
            if not query:
                with self._database.conn:
                    cursor = self._database.conn.cursor()
                    cursor.execute("SELECT COUNT(*) FROM collections WHERE collection = ?", (self._name,))
                    return cursor.fetchone()[0]
            return sum(1 for doc in self._get_all_docs() if self._matches(doc, query))

    def aggregate(self, pipeline: list):
        docs = [copy.deepcopy(doc) for doc in self._get_all_docs()]
        for stage in pipeline or []:
            if "$match" in stage:
                docs = [doc for doc in docs if _matches_query(doc, stage["$match"])]
            elif "$group" in stage:
                spec = stage["$group"]
                id_expression = spec.get("_id")
                sum_expression = next(
                    (value["$sum"] for key, value in spec.items() if key != "_id" and isinstance(value, dict) and "$sum" in value),
                    None,
                )
                grouped: dict[Any, dict] = {}
                for doc in docs:
                    group_id = doc.get(id_expression[1:]) if isinstance(id_expression, str) and id_expression.startswith("$") else id_expression
                    row = grouped.setdefault(group_id, {"_id": group_id})
                    if sum_expression:
                        field = sum_expression[1:] if isinstance(sum_expression, str) and sum_expression.startswith("$") else None
                        row_key = next((key for key in spec if key != "_id"), "total")
                        row[row_key] = row.get(row_key, 0) + (int(doc.get(field) or 0) if field else int(sum_expression or 0))
                docs = list(grouped.values())
        return LocalCursor(docs)


class SQLiteWalDatabase:
    """Embedded SQLite database configured with WAL mode for fast O(1) writes."""

    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = _AsyncThreadLock()
        self._counter = 0
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False, timeout=15.0)
        self._init_db()

    def _init_db(self):
        with self.conn:
            self.conn.execute("PRAGMA journal_mode=WAL;")
            self.conn.execute("PRAGMA synchronous=NORMAL;")
            self.conn.execute("PRAGMA busy_timeout=5000;")
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS collections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    collection TEXT NOT NULL,
                    doc_id TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(collection, doc_id)
                );
                """
            )
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_coll ON collections(collection);")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_coll_doc ON collections(collection, doc_id);")

            cursor = self.conn.cursor()
            cursor.execute("SELECT MAX(id) FROM collections")
            max_id = cursor.fetchone()[0]
            self._counter = int(max_id or 0)

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)
        return SQLiteWalCollection(self, name)

    def __getitem__(self, name: str):
        return SQLiteWalCollection(self, name)

    def next_id(self) -> str:
        self._counter += 1
        return f"local-{self._counter}"

    def close(self):
        try:
            self.conn.close()
        except Exception:
            pass


class _AsyncThreadLock:
    def __init__(self):
        self._lock = threading.RLock()

    async def __aenter__(self):
        self._lock.acquire()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        self._lock.release()


class Database:
    client: Optional[AsyncIOMotorClient] = None
    db = None
    using_local_fallback: bool = False


db_instance = Database()


def _matches_query(doc: dict, query: Optional[dict]) -> bool:
    if not query:
        return True
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches_query(doc, branch) for branch in expected):
                return False
            continue
        if key == "$and":
            if not all(_matches_query(doc, branch) for branch in expected):
                return False
            continue
        actual = doc.get(key)
        if isinstance(expected, dict):
            for operator, operand in expected.items():
                try:
                    if operator == "$lt" and not (actual is not None and actual < operand):
                        return False
                    if operator == "$lte" and not (actual is not None and actual <= operand):
                        return False
                    if operator == "$gt" and not (actual is not None and actual > operand):
                        return False
                    if operator == "$gte" and not (actual is not None and actual >= operand):
                        return False
                    if operator == "$in" and actual not in operand:
                        return False
                    if operator == "$ne" and actual == operand:
                        return False
                except TypeError:
                    return False
        elif actual != expected:
            return False
    return True


def _json_default(value: Any):
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _restore_dates(value: Any, key: Optional[str] = None):
    if isinstance(value, dict):
        return {child_key: _restore_dates(child_value, child_key) for child_key, child_value in value.items()}
    if isinstance(value, list):
        return [_restore_dates(child, key) for child in value]
    if isinstance(value, str) and key and (key.endswith("_at") or key.endswith("_date")):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return value
    return value


async def connect_to_mongo():
    logger.info("Connecting to MongoDB Atlas...")
    client_options = {
        "serverSelectionTimeoutMS": settings.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
        "connectTimeoutMS": settings.MONGODB_CONNECT_TIMEOUT_MS,
    }
    if settings.MONGODB_TLS or settings.MONGODB_URI.startswith("mongodb+srv://"):
        client_options["tlsCAFile"] = certifi.where()
    client = AsyncIOMotorClient(settings.MONGODB_URI, **client_options)
    try:
        await client.admin.command("ping")
        db_instance.client = client
        db_instance.db = client[settings.MONGODB_DB_NAME]
        db_instance.using_local_fallback = False
        await _ensure_mongo_indexes(db_instance.db)
        logger.info("Connected to MongoDB successfully!")
    except (ServerSelectionTimeoutError, PyMongoError, OSError) as exc:
        client.close()
        if not settings.MONGODB_LOCAL_FALLBACK:
            raise
        db_instance.client = None
        engine = getattr(settings, "LOCAL_DB_ENGINE", "sqlite").lower()
        if engine == "sqlite":
            db_instance.db = SQLiteWalDatabase(getattr(settings, "SQLITE_DB_PATH", "storage/trafficflow_edge.sqlite"))
            db_instance.using_local_fallback = True
            logger.warning(
                "MongoDB unavailable (%s). Falling back to SQLite WAL database at %s",
                exc,
                getattr(settings, "SQLITE_DB_PATH", "storage/trafficflow_edge.sqlite"),
            )
        else:
            db_instance.db = LocalJsonDatabase(settings.LOCAL_DB_PATH)
            db_instance.using_local_fallback = True
            logger.warning(
                "MongoDB unavailable (%s). Falling back to local JSON DB at %s",
                exc,
                settings.LOCAL_DB_PATH,
            )


async def _ensure_mongo_indexes(database) -> None:
    """Create the query indexes used by task polling and result aggregation."""
    indexes = (
        (database.tasks, "task_id", {"unique": True, "name": "uq_tasks_task_id"}),
        (database.tasks, "video_id", {"name": "ix_tasks_video_id"}),
        (database.tasks, "status", {"name": "ix_tasks_status"}),
        (database.tasks, "expires_at", {"name": "ix_tasks_expires_at"}),
        (database.lane_configs, "video_id", {"unique": True, "name": "uq_lane_configs_video_id"}),
        (database.lane_configs, "task_id", {"name": "ix_lane_configs_task_id"}),
        (database.traffic_statistics, "task_id", {"name": "ix_traffic_statistics_task_id"}),
    )
    for collection, field, options in indexes:
        try:
            await collection.create_index(field, **options)
        except OperationFailure as exc:
            # Deployments created before named indexes were introduced may
            # already have an equivalent index under MongoDB's generated
            # name (for example, ``task_id_1``).  MongoDB reports that as
            # IndexOptionsConflict even though the required index is usable.
            if exc.code == 85:
                try:
                    existing_indexes = await collection.index_information()
                except Exception:
                    existing_indexes = {}

                matching_index = next(
                    (
                        (name, details)
                        for name, details in existing_indexes.items()
                        if details.get("key") == [(field, 1)]
                    ),
                    None,
                )
                if matching_index:
                    index_name, index_details = matching_index
                    unique_required = options.get("unique") is True
                    unique_matches = not unique_required or index_details.get("unique") is True
                    if unique_matches:
                        logger.info(
                            "MongoDB index %s.%s already exists as %s; keeping it",
                            collection.name,
                            field,
                            index_name,
                        )
                    else:
                        logger.warning(
                            "MongoDB index %s.%s exists as %s but is not unique; "
                            "manual index migration is required",
                            collection.name,
                            field,
                            index_name,
                        )
                    continue

            logger.exception("Could not create MongoDB index %s on %s", options.get("name"), collection.name)
        except Exception:
            # Index creation must not hide an otherwise healthy API startup;
            # MongoDB logs the concrete reason and the next deploy can retry.
            logger.exception("Could not create MongoDB index %s on %s", options.get("name"), collection.name)


async def close_mongo_connection():
    logger.info("Closing MongoDB connection...")
    if db_instance.client:
        db_instance.client.close()
        logger.info("MongoDB connection closed.")
    db_instance.client = None
    db_instance.db = None
    db_instance.using_local_fallback = False


def get_database():
    """Dependency helper to retrieve the database instance."""
    return db_instance.db
