"""One private Python/uvicorn process per browser session, at most eight at a time."""

import asyncio
import socket
import sys
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import FastAPI, HTTPException, Request, Response

from app.cors import add_cors
from app.data import SCENARIOS

MAX_SESSIONS = 8
IDLE_SECONDS = 120
BACKEND = Path(__file__).resolve().parents[1]


@dataclass
class Worker:
    process: asyncio.subprocess.Process
    url: str
    last_seen: float
    busy: int = 0


async def stop(worker: Worker) -> None:
    if worker.process.returncode is None:
        with suppress(ProcessLookupError):
            worker.process.terminate()
        try:
            await asyncio.wait_for(worker.process.wait(), timeout=3)
        except TimeoutError:
            with suppress(ProcessLookupError):
                worker.process.kill()
            await worker.process.wait()


class SessionPool:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client
        self.workers: dict[str, Worker] = {}
        self.lock = asyncio.Lock()

    async def expire_locked(self) -> None:
        for token, worker in list(self.workers.items()):
            if worker.busy == 0 and (
                worker.process.returncode is not None or time.monotonic() - worker.last_seen > IDLE_SECONDS
            ):
                # Stop before freeing the slot, so even during cleanup there are at most eight workers.
                await stop(worker)
                del self.workers[token]

    async def start(self) -> Worker:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "uvicorn", "app.main:app",
            "--host", "127.0.0.1", "--port", str(port), "--workers", "1",
            "--no-access-log", "--log-level", "warning", cwd=BACKEND,
        )
        worker = Worker(process, f"http://127.0.0.1:{port}", time.monotonic())
        try:
            deadline = time.monotonic() + 20
            while process.returncode is None and time.monotonic() < deadline:
                try:
                    response = await self.client.get(f"{worker.url}/api/sim/presets", timeout=1)
                    if response.is_success:
                        return worker
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(0.1)
            raise HTTPException(503, "Could not start your private session. Please try again.")
        except BaseException:
            await stop(worker)
            raise

    @asynccontextmanager
    async def lease(self, token: str):
        # Creation and cleanup are serialized so concurrent first requests cannot exceed the limit.
        async with self.lock:
            await self.expire_locked()
            worker = self.workers.get(token)
            if worker is None:
                if len(self.workers) >= MAX_SESSIONS:
                    raise HTTPException(
                        503, "All 8 private demo sessions are in use. Please try again in a few minutes.",
                        headers={"Retry-After": "5"},
                    )
                worker = await self.start()
                self.workers[token] = worker
            worker.busy += 1
        try:
            yield worker
        finally:
            worker.busy -= 1
            worker.last_seen = time.monotonic()

    async def cleanup(self) -> None:
        while True:
            await asyncio.sleep(15)
            async with self.lock:
                await self.expire_locked()

    async def close(self) -> None:
        async with self.lock:
            for worker in self.workers.values():
                await stop(worker)
            self.workers.clear()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
        pool = SessionPool(client)
        app.state.pool = pool
        cleanup = asyncio.create_task(pool.cleanup())
        try:
            yield
        finally:
            cleanup.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup
            await pool.close()


app = FastAPI(title="Storm Patrol private sessions", lifespan=lifespan)
add_cors(app)


@app.get("/api/health")
def health(request: Request):
    return {"status": "ok", "sessions": len(request.app.state.pool.workers), "capacity": MAX_SESSIONS}


@app.get("/api/sim/presets")
def presets():
    # Also used by deployment health checks; never consume a visitor's slot for these.
    return sorted(path.stem for path in SCENARIOS.glob("*.json"))


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT"])
async def proxy(path: str, request: Request):
    try:
        token = str(UUID(request.headers.get("X-Session-ID", "")))
    except ValueError:
        raise HTTPException(400, "Reload the website to start a private session.") from None
    pool = request.app.state.pool
    try:
        async with pool.lease(token) as worker:
            response = await pool.client.request(
                request.method, f"{worker.url}/api/{path}",
                params=request.query_params, content=await request.body(),
                headers={"Content-Type": request.headers.get("Content-Type", "application/json")},
            )
        return Response(response.content, status_code=response.status_code,
                        media_type=response.headers.get("Content-Type"))
    except httpx.HTTPError:
        raise HTTPException(503, "Your private session is reconnecting. Please try again.") from None
