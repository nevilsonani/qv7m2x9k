"""Write the OpenAPI schema the frontend's TypeScript types are generated from.

Usage (from ``backend/``):  python -m app.openapi [OUT]
Default OUT is ../frontend/src/api/openapi.json. Then run ``npm run gen:api`` in frontend/.
"""

import json
import sys
from pathlib import Path

from app.config import BACKEND_DIR
from app.main import app

DEFAULT_OUT = BACKEND_DIR.parent / "frontend" / "src" / "api" / "openapi.json"


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    # Fixed LF endings so the file is byte-identical on every OS (CI diffs it).
    out.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
