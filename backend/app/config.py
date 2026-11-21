"""Settings, read from environment variables (spec 2.8). No settings file is needed."""

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    db_path: Path
    api_port: int
    web_port: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            db_path=Path(os.environ.get("ACCOUNTABLE_DB_PATH", "data/accountable.db")),
            api_port=int(os.environ.get("ACCOUNTABLE_API_PORT", "8000")),
            web_port=int(os.environ.get("ACCOUNTABLE_WEB_PORT", "5173")),
        )
