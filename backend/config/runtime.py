import os
from pathlib import Path


def configure_runtime() -> None:
    cache_root = Path(__file__).resolve().parent.parent / ".cache"
    matplotlib_dir = cache_root / "matplotlib"
    matplotlib_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("MPLCONFIGDIR", str(matplotlib_dir))
