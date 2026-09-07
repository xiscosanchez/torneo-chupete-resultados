#!/usr/bin/env python3
"""Descarga la clasificación de la FFIB (sistema Fedintranet) y la guarda en JSON.

Uso:
  python3 scripts/clasificacion.py --url "https://www.ffib.es/Fed/NPcd/NFG_VisClasificacion?..." \
      --out data/clasificacion.json --escudos data/escudos

Para probar con un HTML ya descargado:
  python3 scripts/clasificacion.py --html pagina.html --url "<url original>" --no-download
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Palabras clave (ya normalizadas: minúsculas, sin acentos ni puntos) por columna.
HEADER_KEYS = {
    "equipo": ("equipo", "equipos", "club"),
    "pts": ("pts", "ptos", "puntos", "pt", "p_tos"),
    "pj": ("pj", "j", "jug", "jugados", "partidos"),
    "pg": ("pg", "g", "gan", "ganados", "v", "victorias"),
    "pe": ("pe", "e", "emp", "empatados", "empates"),
    "pp": ("pp", "p", "perd", "perdidos", "derrotas"),
    "gf": ("gf", "favor", "golesfavor", "gfavor"),
    "gc": ("gc", "contra", "golescontra", "gcontra"),
    "sancion": ("sancion", "sanc", "s", "pts_sancion"),
}
# Orden típico de las columnas numéricas cuando no hay cabecera reconocible.
FALLBACK_ORDER = ["pts", "pj", "pg", "pe", "pp", "gf", "gc"]


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace(".", "").replace(":", "")
    return re.sub(r"\s+", " ", text).strip()


def slug(text: str) -> str:
    s = norm(text)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "equipo"


def to_int(text: str):
    m = re.search(r"-?\d+", text or "")
    return int(m.group()) if m else None


def cell_text(td) -> str:
    return re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip()


def fetch(url: str) -> bytes:
    r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9"}, timeout=40)
    r.raise_for_status()
    return r.content


def header_map(cells) -> dict:
    """Devuelve {clave: índice} a partir de una fila de cabecera. Toma la primera aparición
    de cada clave (en Fedintranet suele ir Total antes que Casa/Fuera)."""
    mapping = {}
    for idx, td in enumerate(cells):
        t = norm(cell_text(td)).replace(" ", "")
        for key, words in HEADER_KEYS.items():
            if key in mapping:
                continue
            if t in words:
                mapping[key] = idx
                break
    return mapping


def score_table(table) -> tuple[int, list, dict]:
    rows = table.find_all("tr")
    body_rows, mapping = [], {}
    for tr in rows:
        cells = tr.find_all(["td", "th"])
        if len(cells) < 6:
            continue
        hm = header_map(cells)
        if not mapping and len(hm) >= 3:
            mapping = hm
            continue
        nums = sum(1 for c in cells if to_int(cell_text(c)) is not None and re.fullmatch(r"-?\d+", cell_text(c)))
        has_text = any(re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}", cell_text(c)) for c in cells)
        if nums >= 5 and has_text:
            body_rows.append(cells)
    score = len(body_rows) * (2 if mapping else 1)
    return score, body_rows, mapping


def parse_row(cells, mapping: dict, base_url: str, idx: int) -> dict | None:
    texts = [cell_text(c) for c in cells]
    # Equipo: columna mapeada o la primera celda con texto alfabético.
    team_idx = mapping.get("equipo")
    if team_idx is None or team_idx >= len(cells):
        team_idx = next((i for i, t in enumerate(texts) if re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}", t)), None)
    if team_idx is None:
        return None
    team_cell = cells[team_idx]
    name = re.sub(r"^\d+\s*[\.\-º]?\s*", "", texts[team_idx]).strip()
    if not name:
        return None

    # Posición: primera celda numérica antes del equipo, si no, el orden.
    pos = None
    for t in texts[:team_idx]:
        v = to_int(t)
        if v is not None:
            pos = v
            break
    if pos is None:
        pos = idx + 1

    row = {"pos": pos, "equipo": name}

    a = team_cell.find("a", href=True) or cells[0].find("a", href=True)
    if a:
        row["url"] = urljoin(base_url, a["href"])
        q = parse_qs(urlparse(row["url"]).query)
        cod = q.get("codequipo") or q.get("codigo_equipo")
        if cod:
            row["codequipo"] = cod[0]
    img = None
    for c in cells:
        img = c.find("img")
        if img:
            break
    if img and img.get("src"):
        row["escudo_url"] = urljoin(base_url, img["src"])

    if mapping and all(k in mapping for k in ("pts", "pj")):
        for key in FALLBACK_ORDER + ["sancion"]:
            i = mapping.get(key)
            if i is not None and i < len(texts):
                v = to_int(texts[i])
                if v is not None:
                    row[key] = v
    else:
        nums = [to_int(t) for i, t in enumerate(texts) if i > team_idx and re.fullmatch(r"-?\d+", t)]
        for key, v in zip(FALLBACK_ORDER, nums):
            row[key] = v
    if "gf" in row and "gc" in row:
        row["dg"] = row["gf"] - row["gc"]
    return row


def find_meta(soup: BeautifulSoup, url: str) -> dict:
    meta = {}
    q = parse_qs(urlparse(url).query)
    if q.get("codjornada"):
        meta["jornada"] = to_int(q["codjornada"][-1])
    if q.get("codcompeticion"):
        meta["codcompeticion"] = q["codcompeticion"][0]
    if q.get("codgrupo"):
        meta["codgrupo"] = q["codgrupo"][0]

    texts = []
    for el in soup.find_all(["h1", "h2", "h3", "h4", "caption", "b", "strong", "span", "div", "td", "option"]):
        t = cell_text(el)
        if 3 < len(t) < 140:
            texts.append((el, t))

    for el, t in texts:
        if el.name == "option" and el.has_attr("selected") and re.search(r"jornada", t, re.I):
            j = to_int(t)
            if j:
                meta["jornada"] = j
    for _, t in texts:
        m = re.search(r"temporada\s*([0-9]{2,4}\s*[/\-]\s*[0-9]{2,4})", t, re.I)
        if m and "temporada" not in meta:
            meta["temporada"] = m.group(1).replace(" ", "")
        m = re.search(r"\bjornada\s*(\d+)", t, re.I)
        if m and "jornada_texto" not in meta:
            meta["jornada_texto"] = m.group(0)
            meta.setdefault("jornada", int(m.group(1)))
    grupos = [t for _, t in texts if re.search(r"\bgrupo\b", t, re.I) and len(t) < 80]
    if grupos:
        g = re.sub(r"temporada\s*[0-9]{2,4}\s*[/\-]\s*[0-9]{2,4}", "", min(grupos, key=len), flags=re.I)
        meta["grupo"] = re.sub(r"\s+", " ", g).strip(" ·-|")
    for el, t in texts:
        if el.name in ("h1", "h2", "h3", "h4", "caption") and not re.search(r"jornada|grupo|clasificaci", t, re.I):
            meta["competicion"] = t
            break
    if "competicion" not in meta:
        title = soup.title.get_text(strip=True) if soup.title else ""
        if title:
            meta["competicion"] = title
    return meta


def download_escudos(teams: list, folder: str, base_url: str) -> None:
    os.makedirs(folder, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = UA
    session.headers["Referer"] = base_url
    for t in teams:
        url = t.get("escudo_url")
        if not url:
            continue
        try:
            r = session.get(url, timeout=30)
            r.raise_for_status()
            ctype = r.headers.get("Content-Type", "")
            ext = ".png"
            if "jpeg" in ctype or "jpg" in ctype or url.lower().endswith((".jpg", ".jpeg")):
                ext = ".jpg"
            elif "gif" in ctype or url.lower().endswith(".gif"):
                ext = ".gif"
            elif "svg" in ctype or url.lower().endswith(".svg"):
                ext = ".svg"
            name = slug(t.get("codequipo") or t["equipo"]) + ext
            path = os.path.join(folder, name)
            if not os.path.exists(path) or open(path, "rb").read() != r.content:
                with open(path, "wb") as fh:
                    fh.write(r.content)
            t["escudo"] = os.path.join(folder, name).replace(os.sep, "/")
        except Exception as exc:  # noqa: BLE001
            print(f"[aviso] no se pudo bajar el escudo de {t['equipo']}: {exc}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="URL de la clasificación en ffib.es")
    ap.add_argument("--html", help="Fichero HTML local en vez de descargar")
    ap.add_argument("--out", default="data/clasificacion.json")
    ap.add_argument("--escudos", default="data/escudos")
    ap.add_argument("--no-download", action="store_true", help="No descargar escudos")
    ap.add_argument("--competicion", help="Nombre de la competición (sobrescribe el detectado)")
    ap.add_argument("--grupo", help="Nombre del grupo (sobrescribe el detectado)")
    ap.add_argument("--save-html", help="Guardar el HTML descargado en este fichero (depuración)")
    args = ap.parse_args()

    raw = open(args.html, "rb").read() if args.html else fetch(args.url)
    if args.save_html:
        os.makedirs(os.path.dirname(args.save_html) or ".", exist_ok=True)
        with open(args.save_html, "wb") as fh:
            fh.write(raw)
    soup = BeautifulSoup(raw, "html.parser")

    best = (0, [], {})
    for table in soup.find_all("table"):
        cand = score_table(table)
        if cand[0] > best[0]:
            best = cand
    _, rows, mapping = best
    if len(rows) < 2:
        print("ERROR: no se encontró ninguna tabla de clasificación en la página", file=sys.stderr)
        return 2

    teams = []
    for i, cells in enumerate(rows):
        row = parse_row(cells, mapping, args.url, i)
        if row and "pts" in row:
            teams.append(row)
    if len(teams) < 2:
        print("ERROR: la tabla encontrada no tiene filas de equipos válidas", file=sys.stderr)
        return 2
    teams.sort(key=lambda r: r["pos"])

    if not args.no_download:
        download_escudos(teams, args.escudos, args.url)

    meta = find_meta(soup, args.url)
    if args.competicion:
        meta["competicion"] = args.competicion
    if args.grupo:
        meta["grupo"] = args.grupo

    out = {
        "actualizado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "fuente": args.url,
        **{k: meta[k] for k in ("competicion", "grupo", "temporada", "jornada", "codcompeticion", "codgrupo") if k in meta},
        "equipos": teams,
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"OK: {len(teams)} equipos -> {args.out}")
    for t in teams:
        print(f"  {t['pos']:>2}. {t['equipo']:<35} {t.get('pts','?'):>3} pts  {t.get('pj','?')}J")
    return 0


if __name__ == "__main__":
    sys.exit(main())
