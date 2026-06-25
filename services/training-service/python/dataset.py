"""Dataset path helpers for training service."""

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATASET_DIR = PROJECT_ROOT / "python" / "dataset"


def dataset_dir():
    return DATASET_DIR

