"""
Over-Correct — optional FastAPI server for local development.

The frontend now calls Ollama directly from the browser, so this server
is only needed if you want to serve the static files locally via Python.

Endpoints:
  GET  /         → serves frontend/index.html
  GET  /...      → serves all other frontend static files
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Over-Correct")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# Serve the entire frontend directory at root.
# html=True makes / → index.html automatically.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=True,
    )
