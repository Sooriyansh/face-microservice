"""Face detector facade using the existing utility module."""

from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from utils import *  # noqa: F401,F403

