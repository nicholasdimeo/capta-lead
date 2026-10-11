"""Avvio di Capta Cloud in locale: `uv run capta-cloud`.

Porta fissa 8100 (la 8000 è di Plexus sullo stesso Mac). Si cambia con CAPTA_PORTA.
In sviluppo il server si riavvia da solo quando si modifica il codice.
"""

from __future__ import annotations

import os

import uvicorn

PORTA_PREDEFINITA = 8100


def main() -> None:
    porta = int(os.environ.get("CAPTA_PORTA", PORTA_PREDEFINITA))
    sviluppo = os.environ.get("CAPTA_AMBIENTE", "sviluppo") == "sviluppo"
    uvicorn.run("capta_cloud.principale:app", host="127.0.0.1", port=porta, reload=sviluppo)


if __name__ == "__main__":
    main()
