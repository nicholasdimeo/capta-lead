"""Dove stanno i file delle foto: su disco (sviluppo, o un solo server) oppure su un Object Storage
compatibile S3 (produzione con più server). Il database conserva solo il percorso relativo."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Protocol

from .impostazioni import impostazioni


class ArchivioFoto(Protocol):
    def salva(self, percorso: str, contenuto: bytes, mime: str) -> None: ...
    def leggi(self, percorso: str) -> bytes | None: ...


class ArchivioDisco:
    def __init__(self, cartella: Path):
        self.cartella = cartella

    def salva(self, percorso: str, contenuto: bytes, mime: str) -> None:
        destinazione = self.cartella / percorso
        destinazione.parent.mkdir(parents=True, exist_ok=True)
        destinazione.write_bytes(contenuto)

    def leggi(self, percorso: str) -> bytes | None:
        try:
            return (self.cartella / percorso).read_bytes()
        except FileNotFoundError:
            return None


class ArchivioS3:
    """Object Storage compatibile S3 (Scaleway, Hetzner, Backblaze, AWS…) tramite boto3."""

    def __init__(self) -> None:
        import boto3

        imp = impostazioni()
        self.bucket = imp.s3_bucket
        self.prefisso = imp.s3_prefisso.strip("/")
        self._client = boto3.client("s3", endpoint_url=imp.s3_endpoint or None, region_name=imp.s3_regione or None, aws_access_key_id=imp.s3_chiave or None, aws_secret_access_key=imp.s3_segreto or None)

    def _chiave(self, percorso: str) -> str:
        return f"{self.prefisso}/{percorso}" if self.prefisso else percorso

    def salva(self, percorso: str, contenuto: bytes, mime: str) -> None:
        self._client.put_object(Bucket=self.bucket, Key=self._chiave(percorso), Body=contenuto, ContentType=mime)

    def leggi(self, percorso: str) -> bytes | None:
        try:
            return self._client.get_object(Bucket=self.bucket, Key=self._chiave(percorso))["Body"].read()
        except self._client.exceptions.NoSuchKey:
            return None


@lru_cache
def archivio_foto() -> ArchivioFoto:
    imp = impostazioni()
    if imp.archivio_foto == "s3":
        return ArchivioS3()
    return ArchivioDisco(imp.cartella_foto)


def azzera_archivio_foto() -> None:
    archivio_foto.cache_clear()
