"""PlanGuard HTTP API — powers the dashboard and keeps a local history of analyses.

Run:  uvicorn planguard.api:app --port 8100
"""

import json
import os
import sqlite3
import time
from collections.abc import Iterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from . import __version__
from .analyzer import Options, analyze
from .plan import MAX_PLAN_BYTES, PlanError
from .pricing import price_table
from .render import markdown
from .rules import RULES

SAMPLES_DIR = Path(__file__).resolve().parent / "samples"
HISTORY_LIMIT = 500

SCHEMA = """
CREATE TABLE IF NOT EXISTS analyses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    source        TEXT NOT NULL CHECK (source IN ('sample', 'upload', 'ci')),
    decision      TEXT NOT NULL CHECK (decision IN ('PASS', 'WARN', 'FAIL')),
    monthly_after REAL NOT NULL,
    monthly_delta REAL NOT NULL,
    critical      INTEGER NOT NULL,
    high          INTEGER NOT NULL,
    medium        INTEGER NOT NULL,
    low           INTEGER NOT NULL,
    resources     INTEGER NOT NULL,
    report        TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_analyses_created ON analyses(created_at);
"""


class AnalyzeRequest(BaseModel):
    plan: dict[str, Any] | str
    name: str = Field(default="untitled plan", min_length=1, max_length=120)
    source: Literal["sample", "upload", "ci"] = "upload"
    budget_usd: float | None = Field(default=50.0, ge=0, le=1_000_000)
    fail_on: Literal["critical", "high", "medium", "low"] = "high"
    save: bool = True


def create_app(db_path: str | None = None, cors: list[str] | None = None) -> FastAPI:
    db_path = db_path or os.getenv("PG_DB_PATH", "planguard.db")
    cors = (
        cors if cors is not None else [o for o in os.getenv("PG_CORS_ORIGINS", "http://localhost:5174").split(",") if o]
    )

    def connect() -> sqlite3.Connection:
        conn = sqlite3.connect(db_path, check_same_thread=False, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        conn = connect()
        conn.executescript(SCHEMA)
        conn.commit()
        conn.close()
        yield

    app = FastAPI(
        title="SYED PlanGuard",
        version=__version__,
        lifespan=lifespan,
        description="Cost and risk gate for Terraform plans.",
    )
    app.add_middleware(
        CORSMiddleware, allow_origins=cors, allow_methods=["GET", "POST"], allow_headers=["Content-Type"]
    )

    @app.middleware("http")
    async def guard(request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_PLAN_BYTES + 64_000:
            return JSONResponse({"detail": "plan is larger than 5 MB"}, status_code=413)
        started = time.perf_counter()
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - started) * 1000:.1f}"
        return response

    def get_db() -> Iterator[sqlite3.Connection]:
        conn = connect()
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    Db = Annotated[sqlite3.Connection, Depends(get_db)]

    def sample_files() -> dict[str, Path]:
        return {p.stem: p for p in sorted(SAMPLES_DIR.glob("*.json"))}

    # ------------------------------------------------------------------ ops

    @app.get("/health", tags=["ops"])
    def health() -> dict:
        return {"status": "ok", "version": __version__}

    # ------------------------------------------------------------------ reference data

    @app.get("/api/v1/rules", tags=["reference"])
    def rules() -> list[dict]:
        return [r.__dict__ for r in RULES.values()]

    @app.get("/api/v1/pricing", tags=["reference"])
    def pricing() -> dict:
        return price_table()

    @app.get("/api/v1/samples", tags=["reference"])
    def samples() -> list[dict]:
        out = []
        for name, path in sample_files().items():
            body = json.loads(path.read_text(encoding="utf-8"))
            out.append(
                {
                    "name": name,
                    "description": body.get("planguard_sample", ""),
                    "resources": len(body.get("resource_changes", [])),
                }
            )
        return out

    @app.get("/api/v1/samples/{name}", tags=["reference"])
    def sample(name: str) -> dict:
        path = sample_files().get(name)
        if not path:
            raise HTTPException(404, f"unknown sample '{name}'")
        return json.loads(path.read_text(encoding="utf-8"))

    # ------------------------------------------------------------------ analysis

    @app.post("/api/v1/analyze", tags=["analysis"])
    def post_analyze(body: AnalyzeRequest, conn: Db) -> dict:
        try:
            report = analyze(body.plan, Options(budget_usd=body.budget_usd or None, fail_on=body.fail_on)).to_dict()
        except PlanError as exc:
            raise HTTPException(422, str(exc)) from exc
        analysis_id = None
        if body.save:
            sev = report["findings_by_severity"]
            cur = conn.execute(
                """INSERT INTO analyses(name, source, decision, monthly_after, monthly_delta, critical, high, medium,
                                        low, resources, report, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    body.name,
                    body.source,
                    report["decision"],
                    report["cost"]["monthly_after"],
                    report["cost"]["monthly_delta"],
                    sev["critical"],
                    sev["high"],
                    sev["medium"],
                    sev["low"],
                    len(report["resources"]),
                    json.dumps(report),
                    datetime.now(UTC).isoformat(timespec="seconds"),
                ),
            )
            analysis_id = cur.lastrowid
            conn.execute("DELETE FROM analyses WHERE id <= ?", (analysis_id - HISTORY_LIMIT,))
        return {"id": analysis_id, "name": body.name, "report": report}

    @app.get("/api/v1/analyses", tags=["analysis"])
    def list_analyses(
        conn: Db, limit: Annotated[int, Query(ge=1, le=100)] = 20, offset: Annotated[int, Query(ge=0)] = 0
    ) -> dict:
        total = conn.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]
        rows = conn.execute(
            "SELECT id, name, source, decision, monthly_after, monthly_delta, critical, high, medium, low, resources, "
            "created_at FROM analyses ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return {"total": total, "limit": limit, "offset": offset, "items": [dict(r) for r in rows]}

    def _row(conn, analysis_id: int) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "analysis not found")
        return row

    @app.get("/api/v1/analyses/{analysis_id}", tags=["analysis"])
    def get_analysis(analysis_id: int, conn: Db) -> dict:
        row = _row(conn, analysis_id)
        return {
            "id": row["id"],
            "name": row["name"],
            "source": row["source"],
            "created_at": row["created_at"],
            "report": json.loads(row["report"]),
        }

    @app.get("/api/v1/analyses/{analysis_id}/markdown", tags=["analysis"], response_class=PlainTextResponse)
    def get_markdown(analysis_id: int, conn: Db) -> str:
        row = _row(conn, analysis_id)
        return markdown(json.loads(row["report"]), f"PlanGuard · {row['name']}")

    @app.get("/api/v1/stats", tags=["analysis"])
    def stats(conn: Db) -> dict:
        r = conn.execute(
            """SELECT COUNT(*) n, SUM(decision='PASS') pass, SUM(decision='WARN') warn, SUM(decision='FAIL') fail,
                      COALESCE(SUM(critical),0) critical, COALESCE(SUM(high),0) high,
                      COALESCE(SUM(CASE WHEN decision='FAIL' THEN monthly_after ELSE 0 END),0) blocked_monthly
               FROM analyses"""
        ).fetchone()
        return {
            "analyses": r["n"],
            "pass": r["pass"] or 0,
            "warn": r["warn"] or 0,
            "fail": r["fail"] or 0,
            "critical_findings": r["critical"],
            "high_findings": r["high"],
            "blocked_monthly_usd": round(r["blocked_monthly"], 2),
        }

    return app


app = create_app()
