"""Private file storage. Paths are built ONLY from server-generated UUIDs - never from
user-supplied file names - so an upload cannot overwrite or reach anything else.

Local-disk implementation. On hosts with an ephemeral filesystem, mount a persistent volume at
STORAGE_DIR (see deployment notes) or swap this class for an object-storage version with the same methods.
"""
from __future__ import annotations

import os
import re
import shutil
import uuid
from pathlib import Path


def safe_display_name(name: str | None, default: str = "upload.csv") -> str:
    """Name shown in the UI. Strips any directory part and control characters; never used as a path."""
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return (name or default)[:255]


class Storage:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.root, 0o700)
        except OSError:
            pass

    # ---- paths (UUID only)
    def dataset_dir(self, user_id: uuid.UUID, dataset_id: uuid.UUID) -> Path:
        p = (self.root / str(uuid.UUID(str(user_id))) / str(uuid.UUID(str(dataset_id)))).resolve()
        if self.root not in p.parents:              # defensive: must stay inside the storage root
            raise ValueError("Invalid storage path.")
        return p

    def original(self, user_id, dataset_id) -> Path:
        return self.dataset_dir(user_id, dataset_id) / "original.csv"

    def cleaned(self, user_id, dataset_id) -> Path:
        return self.dataset_dir(user_id, dataset_id) / "cleaned.parquet"

    def cleaned_csv(self, user_id, dataset_id) -> Path:
        return self.dataset_dir(user_id, dataset_id) / "cleaned_export.csv"

    def prepare(self, user_id, dataset_id) -> Path:
        d = self.dataset_dir(user_id, dataset_id)
        d.mkdir(parents=True, exist_ok=True)
        for folder in (d.parent, d):                    # owner-only access on the user folder and the dataset folder
            try:
                os.chmod(folder, 0o700)
            except OSError:
                pass
        return d

    # ---- deletion
    def delete_dataset(self, user_id, dataset_id) -> None:
        shutil.rmtree(self.dataset_dir(user_id, dataset_id), ignore_errors=True)

    def delete_user(self, user_id) -> None:
        p = (self.root / str(uuid.UUID(str(user_id)))).resolve()
        if self.root in p.parents:
            shutil.rmtree(p, ignore_errors=True)
