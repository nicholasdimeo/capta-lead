"""L'applicazione FastAPI di Capta Cloud. Avvio: uv run uvicorn capta_cloud.principale:app --reload"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import VERSIONE, VERSIONE_API
from .api import accesso, azienda, dati
from .db import crea_tabelle, fabbrica_sessioni
from .impostazioni import impostazioni
from .servizi.integrazioni import Lavoratore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def crea_app() -> FastAPI:
    imp = impostazioni()

    @asynccontextmanager
    async def ciclo_vita(app: FastAPI):
        crea_tabelle()
        imp.cartella_foto.mkdir(parents=True, exist_ok=True)
        lavoratore = None
        if imp.integrazioni_attive and imp.ambiente != "test":
            lavoratore = Lavoratore(fabbrica_sessioni(), imp.integrazioni_intervallo_secondi)
            lavoratore.avvia()
        yield
        if lavoratore:
            lavoratore.ferma()

    app = FastAPI(title="Capta Cloud", version=VERSIONE, lifespan=ciclo_vita, docs_url="/api/v1/documentazione", redoc_url=None, openapi_url="/api/v1/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=imp.elenco_origini or ["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"], max_age=600)

    # Errori sempre nella forma {"errore": "spiegazione"} (come il contratto Plexus), più "tipo" quando utile.
    @app.exception_handler(StarletteHTTPException)
    async def errore_http(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        dettaglio = exc.detail if isinstance(exc.detail, dict) else {"errore": str(exc.detail)}
        return JSONResponse(status_code=exc.status_code, content=dettaglio, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def errore_validazione(_request: Request, exc: RequestValidationError) -> JSONResponse:
        primo = exc.errors()[0] if exc.errors() else {}
        campo = ".".join(str(p) for p in primo.get("loc", []) if p not in ("body", "query"))
        return JSONResponse(status_code=422, content={"errore": f"dati non validi{': ' + campo if campo else ''}", "tipo": "dati_non_validi", "dettagli": exc.errors()})

    @app.get("/api/v1/salute")
    def salute() -> dict[str, str]:
        return {"ok": "sì", "versione": VERSIONE, "api": VERSIONE_API}

    app.include_router(accesso.router, prefix="/api/v1")
    app.include_router(azienda.router, prefix="/api/v1")
    app.include_router(dati.router, prefix="/api/v1")
    return app


app = crea_app()
