#!/usr/bin/env python3
"""Descarga la clasificación de la FFIB (sistema Fedintranet) y la guarda en JSON.

Uso:
  python3 scripts/clasificacion.py --url "https://www.ffib.es/Fed/NPcd/NFG_VisClasificacion?..." \
      --out data/clasificacion.json --escudos data/escudos

Para probar con un HTML ya descargado:
  python3 scripts/clasificacion.py --html pagina.html --url "<url original>" --no-download --jornada fija
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import os
import re
import sys
import unicodedata
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9"})

# Etiquetas de columna (normalizadas) → clave. El título (atributo title) tiene prioridad.
LABELS = {
    "pts": "pts", "ptos": "pts", "puntos": "pts", "pt": "pts",
    "j": "pj", "pj": "pj", "jugados": "pj", "partidos": "pj",
    "g": "pg", "pg": "pg", "ganados": "pg", "v": "pg",
    "e": "pe", "pe": "pe", "empatados": "pe",
    "p": "pp", "pp": "pp", "perdidos": "pp",
    "f": "gf", "gf": "gf", "goles a favor": "gf", "favor": "gf",
    "c": "gc", "gc": "gc", "goles en contra": "gc", "contra": "gc",
}
NUM_KEYS = ("pts", "pj", "pg", "pe", "pp", "gf", "gc")
SITE_IMG_PAT = re.compile(r"logo|sello|pie|banner|icon|flag|bandera|fondo|background|pixel|spacer", re.I)


# ---------------------------------------------------------------- utilidades
def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace(".", "").replace(":", "")
    return re.sub(r"\s+", " ", text).strip()


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", norm(text)).strip("-")
    return s or "equipo"


def to_int(text):
    m = re.search(r"-?\d+", text or "")
    return int(m.group()) if m else None


def own_text(cell) -> str:
    """Texto de una celda sin las celdas anidadas (Fedintranet deja <th> sin cerrar)."""
    c = copy.copy(cell)
    for nested in c.find_all(["td", "th"]):
        nested.decompose()
    return re.sub(r"\s+", " ", c.get_text(" ", strip=True)).strip()


def cells_of(tr):
    return tr.find_all(["td", "th"])


def fetch(url: str) -> bytes:
    r = SESSION.get(url, timeout=40)
    r.raise_for_status()
    return r.content


def with_jornada(url: str, jornada: int) -> str:
    parts = urlparse(url)
    q = [(k, v) for k, v in parse_qs(parts.query, keep_blank_values=True).items()]
    flat = [(k, vals[0]) for k, vals in q if k != "codjornada"]
    flat.append(("codjornada", str(jornada)))
    return urlunparse(parts._replace(query=urlencode(flat)))


# ---------------------------------------------------------------- clasificación
def expand_headers(tr) -> list[str]:
    labels = []
    for th in cells_of(tr):
        label = th.get("title") or own_text(th)
        span = to_int(th.get("colspan")) or 1
        labels.extend([label] * span)
    return labels


def find_standings_table(soup):
    """Devuelve (filas_de_equipos, etiquetas_por_columna, grupos_por_columna)."""
    best = None
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        header_rows, body = [], []
        for tr in rows:
            cells = cells_of(tr)
            if not cells:
                continue
            texts = [own_text(c) for c in cells]
            nums = sum(1 for t in texts if re.fullmatch(r"-?\d+", t))
            if tr.find("th") and nums < 3:
                header_rows.append(tr)
            elif nums >= 5 and any(re.search(r"[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,}", t) for t in texts):
                body.append(cells)
        if len(body) < 2:
            continue
        score = len(body) * 100 + max(len(c) for c in body)
        if best is None or score > best[0]:
            best = (score, body, header_rows)
    if best is None:
        return [], [], []
    _, body, header_rows = best
    ncols = max(len(c) for c in body)
    labels = groups = []
    for tr in reversed(header_rows):
        exp = expand_headers(tr)
        if len(exp) >= ncols - 1 and not labels:
            labels = exp
        elif labels:
            groups = exp
            break
    return body, labels, groups


def parse_team_row(cells, labels, groups, base_url, idx):
    texts = [own_text(c) for c in cells]
    team_idx = next((i for i, t in enumerate(texts) if re.search(r"[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,}", t)), None)
    if team_idx is None:
        return None
    name = re.sub(r"^\d+\s*[\.\-º]?\s*", "", texts[team_idx]).strip()
    pos = next((to_int(t) for t in texts[:team_idx] if to_int(t) is not None), idx + 1)
    row = {"pos": pos, "equipo": name}

    a = cells[team_idx].find("a", href=True)
    if a:
        row["url"] = urljoin(base_url, a["href"])
        q = {k.lower(): v for k, v in parse_qs(urlparse(row["url"]).query).items()}
        cod = q.get("codequipo") or q.get("codigo_equipo")
        if cod:
            row["codequipo"] = cod[0]

    casa, fuera, total = {}, {}, {}
    for i, t in enumerate(texts):
        if i <= team_idx or i >= len(labels):
            continue
        key = LABELS.get(norm(labels[i]))
        if not key:
            continue
        grp = norm(groups[i]) if i < len(groups) else ""
        v = to_int(t)
        if v is None:
            continue
        if "casa" in grp or "local" in grp:
            casa.setdefault(key, v)
        elif "fuera" in grp or "visit" in grp:
            fuera.setdefault(key, v)
        else:
            total.setdefault(key, v)
    for key in NUM_KEYS:
        if key in total:
            row[key] = total[key]
        elif key in casa or key in fuera:
            row[key] = casa.get(key, 0) + fuera.get(key, 0)
    if "pts" not in row or "pj" not in row:
        # Sin cabecera reconocible: orden habitual Pts, J, G, E, P, GF, GC tras el nombre.
        nums = [to_int(t) for t in texts[team_idx + 1:] if re.fullmatch(r"-?\d+", t)]
        for key, v in zip(NUM_KEYS, nums):
            row.setdefault(key, v)
    if casa:
        row["casa"] = casa
    if fuera:
        row["fuera"] = fuera
    if "gf" in row and "gc" in row:
        row["dg"] = row["gf"] - row["gc"]

    # Últimos resultados (spans con title Ganado/Empatado/Perdido) y puntos de sanción.
    forma = []
    for c in cells[team_idx + 1:]:
        for sp in c.find_all("span", title=True):
            t = norm(sp["title"])
            if t.startswith("gan"):
                forma.append("G")
            elif t.startswith("emp"):
                forma.append("E")
            elif t.startswith("perd"):
                forma.append("P")
    if forma:
        row["forma"] = forma
    for i, lab in enumerate(labels):
        if i < len(texts) and i > team_idx and re.search(r"sanci|descuento", norm(lab) + " " + (norm(groups[i]) if i < len(groups) else "")):
            v = to_int(texts[i])
            if v is not None:
                row["sancion"] = v
                break
    return row


# ---------------------------------------------------------------- resultados de la jornada
def parse_results(soup, base_url):
    out = []
    for table in soup.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            cells = cells_of(tr)
            if len(cells) != 3:
                continue
            m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", own_text(cells[1]))
            local, visit = own_text(cells[0]), own_text(cells[2])
            if not local or not visit:
                continue
            item = {"local": local, "visitante": visit}
            if m:
                item["goles_local"], item["goles_visitante"] = int(m.group(1)), int(m.group(2))
            for side, cell in (("local", cells[0]), ("visitante", cells[2])):
                a = cell.find("a", href=True)
                if a:
                    q = {k.lower(): v for k, v in parse_qs(urlparse(a["href"]).query).items()}
                    cod = q.get("codigo_equipo") or q.get("codequipo")
                    if cod:
                        item[f"cod_{side}"] = cod[0]
            rows.append(item)
        if len(rows) >= 2 and len(rows) > len(out):
            out = rows
    return out


def has_played_results(soup) -> bool:
    return any("goles_local" in r for r in parse_results(soup, ""))


# ---------------------------------------------------------------- metadatos
def find_meta(soup, url):
    meta = {}
    q = parse_qs(urlparse(url).query)
    for key in ("codcompeticion", "codgrupo"):
        if q.get(key):
            meta[key] = q[key][0]
    heads = [(h.name, re.sub(r"\s+", " ", h.get_text(" ", strip=True))) for h in soup.find_all(["h1", "h2", "h3", "h4", "h5"])]
    for name, t in heads:
        m = re.search(r"jornada\s*(\d+)\s*(?:\(([^)]*)\))?", t, re.I)
        if m and "jornada" not in meta:
            meta["jornada"] = int(m.group(1))
            if m.group(2):
                meta["fecha_jornada"] = m.group(2).strip()
        m = re.search(r"temporada\s*([0-9]{2,4}\s*[/\-]\s*[0-9]{2,4})", t, re.I)
        if m and "temporada" not in meta:
            meta["temporada"] = m.group(1).replace(" ", "")
    for name, t in heads:
        if name in ("h1", "h2", "h4") and 3 < len(t) < 90 and not re.search(r"jornada|temporada|\d+\s*-\s*\d+", t, re.I):
            meta["competicion"] = t
            break
    for name, t in heads:
        if name == "h5" and 1 < len(t) < 60:
            meta["grupo"] = t
            break
    if "competicion" not in meta and soup.title:
        meta["competicion"] = soup.title.get_text(strip=True)
    return meta


# ---------------------------------------------------------------- escudos
def escudo_from_team_page(html: bytes, page_url: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    candidates = []
    for img in soup.find_all("img", src=True):
        src = img["src"].strip()
        if not src or src.startswith("data:"):
            continue
        blob = " ".join([src, img.get("alt", ""), img.get("class") and " ".join(img.get("class")) or "", img.get("title", "")])
        score = 0
        if re.search(r"/pimg/", src, re.I):
            score += 20
        if re.search(r"escud|shield|logo_?equipo|club", blob, re.I):
            score += 10
        if SITE_IMG_PAT.search(src.rsplit("/", 1)[-1]) and not re.search(r"/pimg/", src, re.I):
            score -= 8
        if re.search(r"web_responsive|/img/web", src):
            score -= 5
        w = to_int(img.get("width")) or 0
        if 40 <= w <= 400:
            score += 2
        candidates.append((score, urljoin(page_url, src)))
    candidates.sort(reverse=True)
    if candidates and candidates[0][0] > 0:
        return candidates[0][1]
    print(f"[debug] imágenes en {page_url}: {[c[1] for c in candidates]}", file=sys.stderr)
    return None


def team_card_urls(soup, base_url, team):
    """Páginas candidatas donde buscar el escudo: ficha del equipo (NFG_VisEquipos) y su calendario."""
    urls = []
    cod = team.get("codequipo")
    if cod:
        tmpl = None
        for a in soup.find_all("a", href=re.compile(r"NFG_VisEquipos", re.I)):
            tmpl = urljoin(base_url, a["href"])
            break
        if tmpl:
            parts = urlparse(tmpl)
            q = {k: v[0] for k, v in parse_qs(parts.query).items()}
            for k in list(q):
                if k.lower() in ("codigo_equipo", "codequipo"):
                    q[k] = cod
            urls.append(urlunparse(parts._replace(query=urlencode(q))))
        else:
            urls.append(urljoin(base_url, f"NFG_VisEquipos?cod_primaria=1000109&Codigo_Equipo={cod}"))
    if team.get("url"):
        urls.append(team["url"])
    return urls


def existing_escudo(folder, team):
    """Escudo ya presente en disco (descargado antes o colocado a mano como <codequipo>.png/jpg/...)."""
    for base in filter(None, (team.get("codequipo"), slug(team["equipo"]))):
        for ext in (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"):
            path = os.path.join(folder, base + ext)
            if os.path.exists(path) and os.path.getsize(path) > 0:
                return path.replace(os.sep, "/")
    return None


def download_escudos(teams, folder, soup, base_url, debug_dir=None):
    os.makedirs(folder, exist_ok=True)
    saved = set()
    for t in teams:
        try:
            src = None
            html = b""
            for i, page in enumerate(team_card_urls(soup, base_url, t)):
                try:
                    html = fetch(page)
                except Exception as exc:  # noqa: BLE001
                    print(f"[aviso] {t['equipo']}: no se pudo cargar {page}: {exc}", file=sys.stderr)
                    continue
                if debug_dir and i not in saved:
                    os.makedirs(debug_dir, exist_ok=True)
                    with open(os.path.join(debug_dir, f"equipo_{i}.html"), "wb") as fh:
                        fh.write(html)
                    saved.add(i)
                src = escudo_from_team_page(html, page)
                if src:
                    break
            if not src:
                manual = existing_escudo(folder, t)
                if manual:
                    t["escudo"] = manual
                    print(f"[info] {t['equipo']}: usando escudo local {manual}", file=sys.stderr)
                    continue
                print(f"[aviso] sin escudo detectado para {t['equipo']}", file=sys.stderr)
                if debug_dir and "fail" not in saved and t.get("codequipo"):
                    with open(os.path.join(debug_dir, f"sin_escudo_{t['codequipo']}.html"), "wb") as fh:
                        fh.write(html)
                    saved.add("fail")
                continue
            t["escudo_url"] = src
            r = SESSION.get(src, timeout=30, headers={"Referer": t["url"]})
            r.raise_for_status()
            ctype = r.headers.get("Content-Type", "")
            ext = ".jpg" if ("jpeg" in ctype or "jpg" in ctype) else ".gif" if "gif" in ctype else ".svg" if "svg" in ctype else ".png"
            name = slug(t.get("codequipo") or t["equipo"]) + ext
            path = os.path.join(folder, name)
            if not os.path.exists(path) or open(path, "rb").read() != r.content:
                with open(path, "wb") as fh:
                    fh.write(r.content)
            t["escudo"] = path.replace(os.sep, "/")
        except Exception as exc:  # noqa: BLE001
            print(f"[aviso] no se pudo bajar el escudo de {t['equipo']}: {exc}", file=sys.stderr)


# ---------------------------------------------------------------- principal
def load_page(url, html_path=None):
    raw = open(html_path, "rb").read() if html_path else fetch(url)
    return raw, BeautifulSoup(raw, "html.parser")


def next_jornada(soup):
    for a in soup.find_all("a", href=True):
        if re.search(r"siguiente", a.get_text(" ", strip=True), re.I):
            m = re.search(r"IrA\((\d+)\)", a["href"])
            if m:
                return int(m.group(1))
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="URL de la clasificación en ffib.es")
    ap.add_argument("--html", help="Fichero HTML local en vez de descargar")
    ap.add_argument("--out", default="data/clasificacion.json")
    ap.add_argument("--escudos", default="data/escudos")
    ap.add_argument("--no-download", action="store_true", help="No descargar escudos")
    ap.add_argument("--jornada", default="auto", help="'auto' avanza hasta la última jornada con resultados; 'fija' usa la URL tal cual; o un número")
    ap.add_argument("--competicion", help="Nombre de la competición (sobrescribe el detectado)")
    ap.add_argument("--grupo", help="Nombre del grupo (sobrescribe el detectado)")
    ap.add_argument("--save-html", help="Guardar el HTML descargado en este fichero (depuración)")
    ap.add_argument("--debug-dir", help="Guardar también la ficha de un equipo en este directorio")
    args = ap.parse_args()

    url = args.url
    if args.jornada.isdigit():
        url = with_jornada(url, int(args.jornada))
    raw, soup = load_page(url, args.html)

    if args.jornada == "auto" and not args.html:
        for _ in range(60):
            nxt = next_jornada(soup)
            if not nxt:
                break
            nurl = with_jornada(url, nxt)
            try:
                nraw, nsoup = load_page(nurl)
            except Exception as exc:  # noqa: BLE001
                print(f"[aviso] no se pudo cargar la jornada {nxt}: {exc}", file=sys.stderr)
                break
            if not has_played_results(nsoup):
                break
            url, raw, soup = nurl, nraw, nsoup
    if args.save_html:
        os.makedirs(os.path.dirname(args.save_html) or ".", exist_ok=True)
        with open(args.save_html, "wb") as fh:
            fh.write(raw)

    body, labels, groups = find_standings_table(soup)
    if len(body) < 2:
        print("ERROR: no se encontró ninguna tabla de clasificación en la página", file=sys.stderr)
        return 2
    teams = []
    for i, cells in enumerate(body):
        row = parse_team_row(cells, labels, groups, url, i)
        if row and "pts" in row:
            teams.append(row)
    if len(teams) < 2:
        print("ERROR: la tabla encontrada no tiene filas de equipos válidas", file=sys.stderr)
        return 2
    teams.sort(key=lambda r: r["pos"])

    # Conservar escudos ya descargados si no se vuelven a bajar.
    previous = {}
    if os.path.exists(args.out):
        try:
            for t in json.load(open(args.out, encoding="utf-8")).get("equipos", []):
                previous[t.get("codequipo") or t["equipo"]] = t
        except Exception:  # noqa: BLE001
            pass
    if args.no_download:
        for t in teams:
            old = previous.get(t.get("codequipo") or t["equipo"])
            if old and old.get("escudo"):
                t["escudo"] = old["escudo"]
                if old.get("escudo_url"):
                    t["escudo_url"] = old["escudo_url"]
    else:
        download_escudos(teams, args.escudos, soup, url, args.debug_dir)

    meta = find_meta(soup, url)
    if args.competicion:
        meta["competicion"] = args.competicion
    if args.grupo:
        meta["grupo"] = args.grupo

    out = {
        "actualizado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "fuente": url,
        **{k: meta[k] for k in ("competicion", "grupo", "temporada", "jornada", "fecha_jornada", "codcompeticion", "codgrupo") if k in meta},
        "equipos": teams,
        "resultados": parse_results(soup, url),
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"OK: {len(teams)} equipos, jornada {meta.get('jornada', '?')} -> {args.out}")
    for t in teams:
        print(f"  {t['pos']:>2}. {t['equipo']:<32} {t.get('pts', '?'):>3} pts  {t.get('pj', '?')}J {t.get('gf', '?')}-{t.get('gc', '?')}  {''.join(t.get('forma', []))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
