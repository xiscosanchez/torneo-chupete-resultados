#!/usr/bin/env python3
"""Baja páginas de ffib.es tal cual (HTML) para leerlas fuera de la web.

Uso: python3 scripts/descargar.py --out data/raw nombre1=URL1 nombre2=URL2 ...
La web devuelve a veces 200 con cuerpo vacío o corta la conexión: se
reintenta con espera, una conexión nueva cada vez.
"""
import argparse
import os
import sys
import time

import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9", "Connection": "close"})


def fetch(url, retries=6):
    last = None
    for i in range(retries):
        try:
            r = SESSION.get(url, timeout=40)
            r.raise_for_status()
            if r.content.strip():
                return r.content
            last = "cuerpo vacío"
        except requests.RequestException as exc:
            last = str(exc)
            SESSION.close()
        print(f"[aviso] {url}: {last} (intento {i + 1}/{retries})", file=sys.stderr)
        time.sleep(3 * (i + 1))
    raise RuntimeError(f"no se pudo bajar {url}: {last}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/raw")
    ap.add_argument("paginas", nargs="+", help="nombre=URL")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    fallos = 0
    for item in args.paginas:
        nombre, _, url = item.partition("=")
        if not url:
            print(f"[error] formato nombre=URL: {item}", file=sys.stderr)
            fallos += 1
            continue
        try:
            html = fetch(url)
        except Exception as exc:  # noqa: BLE001
            print(f"[error] {exc}", file=sys.stderr)
            fallos += 1
            continue
        path = os.path.join(args.out, f"{nombre}.html")
        with open(path, "wb") as fh:
            fh.write(html)
        print(f"OK {nombre}: {len(html)} bytes -> {path}")
        time.sleep(2)
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
