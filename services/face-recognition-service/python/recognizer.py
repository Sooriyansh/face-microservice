"""Service-local facade for the existing recognition worker."""

from pathlib import Path
import runpy


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = PROJECT_ROOT / "python" / "recognize_frame.py"


def main():
    runpy.run_path(str(SCRIPT), run_name="__main__")


if __name__ == "__main__":
    main()

