"""Utilities facade for existing embedding model files."""

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
EMBEDDINGS_PATH = PROJECT_ROOT / "python" / "models" / "face_embeddings.pkl"


def embeddings_path():
    return EMBEDDINGS_PATH

