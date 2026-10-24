"""Print the OpenAPI schema (used to generate the frontend's TypeScript types).

Usage (from ``backend/``):  python -m app.openapi > ../frontend/src/api/openapi.json
"""

import json

from app.main import app

if __name__ == "__main__":
    print(json.dumps(app.openapi(), indent=2))
