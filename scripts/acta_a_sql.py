#!/usr/bin/env python3
"""Convierte el calendario y las actas de la FFIB (HTML bajado con
descargar.py) en un script SQL para la app del equipo.

  python3 scripts/acta_a_sql.py --equipo preferente --nosotros "CIUTAT DE PALMA \"B\"" \
      --calendario data/raw/calendario-juvenil-b.html \
      --actas data/raw/acta-j1.html data/raw/acta-j2.html > partidos.sql

Genera, idempotente:
  · la plantilla (jugadores que salen en las actas, con dorsal)
  · un partido por jornada del calendario (fecha de la jornada a las 12:00;
    la hora real la pone el acta cuando existe)
  · para cada acta: resultado, alineación, cambios, goles (con penalti y
    propia puerta), tarjetas, y el estado finalizado
--equipo es un texto que debe aparecer en la liga, categoría o nombre corto
del equipo en la tabla teams (en minúsculas).
"""
from __future__ import annotations

import argparse
import re
import sys
import unicodedata

from bs4 import BeautifulSoup

SMALL = {"de", "del", "la", "les", "el", "i", "y", "da", "do", "das", "dos", "van", "von"}


def norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[\"“”']", "", t)
    return re.sub(r"\s+", " ", t).strip().lower()


def titulo(t: str) -> str:
    out = []
    for i, w in enumerate(t.lower().split()):
        if i > 0 and w in SMALL:
            out.append(w)
        else:
            out.append("-".join(p[:1].upper() + p[1:] for p in w.split("-")))
    return " ".join(out)


def nombre_persona(raw: str) -> tuple[str, str]:
    """'APELLIDO1 APELLIDO2, NOMBRE' → (Nombre, Apellido1 Apellido2)."""
    if "," in raw:
        ape, nom = raw.split(",", 1)
    else:
        partes = raw.split()
        nom, ape = partes[-1], " ".join(partes[:-1])
    return titulo(nom.strip()), titulo(ape.strip())


def rival_bonito(raw: str) -> str:
    t = re.sub(r'\s*["“”\']\s*[A-Z]\s*["“”\']\s*$', "", raw.strip())
    t = t.replace("Atº", "At.").replace("ATº", "AT.").replace("RTVº", "RTV.")
    partes = []
    for i, w in enumerate(t.split()):
        b = w.lower().rstrip(".")
        if b.replace(".", "") in {"fc", "cf", "cd", "ce", "ue", "ud", "sd", "rcd", "sad", "sp", "at", "rtv"} or re.fullmatch(r"[a-z]\.?", b):
            partes.append(w.upper())
        elif i > 0 and b in {"de", "del", "d'", "i", "y"}:
            partes.append(w.lower())
        else:
            partes.append(w[:1].upper() + w[1:].lower())
    return " ".join(partes)


def sql_str(s: str | None) -> str:
    return "null" if s is None else "'" + s.replace("'", "''") + "'"


# ------------------------------------------------------------ calendario
def leer_calendario(path: str, nosotros: str):
    soup = BeautifulSoup(open(path, "rb").read(), "html.parser")
    jornada = fecha = None
    vistos, out = set(), []
    for el in soup.descendants:
        if getattr(el, "name", None) is None:
            t = str(el).strip()
            m = re.match(r"^Jornada (\d+)$", t)
            if m:
                jornada = int(m.group(1))
                continue
            m = re.match(r"^\((\d{2})-(\d{2})-(\d{4})\)$", t)
            if m and jornada:
                fecha = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
        elif el.name == "tr":
            tds = el.find_all("td")
            if len(tds) == 3 and jornada and fecha:
                local = tds[0].get_text(" ", strip=True)
                visit = tds[2].get_text(" ", strip=True)
                if norm(nosotros) in norm(local) or norm(nosotros) in norm(visit):
                    clave = (jornada, local, visit)
                    if clave in vistos:
                        continue
                    vistos.add(clave)
                    es_local = norm(nosotros) in norm(local)
                    out.append({"jornada": jornada, "fecha": fecha, "es_local": es_local,
                                "rival": visit if es_local else local})
    return out


# ------------------------------------------------------------ acta
def leer_acta(path: str, nosotros: str):
    raw = open(path, "rb").read()
    try:
        html = raw.decode("utf-8")
    except UnicodeDecodeError:
        html = raw.decode("cp1252", "replace")
    soup = BeautifulSoup(html, "html.parser")
    for sc in soup(["script", "style"]):
        sc.decompose()
    lines = [l.strip() for l in soup.get_text("\n").split("\n") if l.strip()]
    i = lines.index("Ficha de Partido")
    lines = lines[i:]

    acta = {"path": path}
    m = re.search(r"Jornada (\d+)", " ".join(lines[:4]))
    acta["jornada"] = int(m.group(1)) if m else None
    m = next((re.match(r"^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})", l) for l in lines[:6] if re.match(r"^\d{2}-\d{2}-\d{4}", l)), None)
    acta["fecha"] = f"{m.group(3)}-{m.group(2)}-{m.group(1)} {m.group(4)}:{m.group(5)}" if m else None
    # equipos: las dos líneas que siguen a la competición (que sigue a la fecha)
    d = next(k for k, l in enumerate(lines[:8]) if re.match(r"^\d{2}-\d{2}-\d{4}", l))
    local, visit = lines[d + 2], lines[d + 3]
    acta["local"], acta["visitante"] = local, visit
    acta["es_local"] = norm(nosotros) in norm(local)
    acta["rival"] = visit if acta["es_local"] else local
    m = re.search(r"Estadio:\s*(.+?)\s*Ciudad", " ".join(lines))
    acta["estadio"] = re.sub(r"\s*F-11\s*$", "", m.group(1)).strip() if m else None

    # Goles: en HTML, cada fila con su tipo
    goles = []
    for tr in soup.find_all("tr"):
        a = tr.find("a", class_="img")
        sp = tr.find("span", class_="font-blue")
        if a and sp and tr.find_parent("div"):
            mm = re.search(r"\((\d+)'\)", sp.get_text())
            nombre = tr.get_text(" ", strip=True)
            nombre = re.sub(r".*\(\d+'\)\s*", "", nombre).strip()
            tipo = (a.get("title") or "").lower()
            goles.append({"minuto": int(mm.group(1)) if mm else 0, "jugador": nombre,
                          "penalti": "penalti" in tipo, "propia": "propia" in tipo})
    acta["goles"] = goles

    # Bloques por equipo: desde el nombre del equipo (línea igual al nombre) hasta el siguiente
    def bloque(nombre_equipo):
        idx = [k for k, l in enumerate(lines) if l == nombre_equipo and k + 1 < len(lines) and lines[k + 1] == "Titulares"]
        if not idx:
            return []
        s = idx[0]
        e = next((k for k in range(s + 1, len(lines)) if lines[k] in (local, visit) and k + 1 < len(lines) and lines[k + 1] == "Titulares"), len(lines))
        return lines[s:e]

    def jugadores(bl, seccion):
        out = []
        if seccion not in bl:
            return out
        s = bl.index(seccion) + 1
        k = s
        while k + 1 < len(bl) and re.fullmatch(r"\d+", bl[k]) and not re.fullmatch(r"\d+", bl[k + 1]):
            out.append({"dorsal": int(bl[k]), "nombre": bl[k + 1]})
            k += 2
        return out

    def cambios(bl):
        out = []
        if "Sustituciones" not in bl:
            return out
        k = bl.index("Sustituciones") + 1
        while k + 4 < len(bl) and re.fullmatch(r"\d+", bl[k]) and re.fullmatch(r"\d+", bl[k + 2]) and re.match(r"\(\d+'\)", bl[k + 3]):
            out.append({"entra_dorsal": int(bl[k]), "entra": bl[k + 1], "sale_dorsal": int(bl[k + 2]),
                        "minuto": int(re.match(r"\((\d+)'\)", bl[k + 3]).group(1)), "sale": bl[k + 4]})
            k += 5
        return out

    def tarjetas(bl):
        out = []
        if "Tarjetas" not in bl:
            return out
        k = bl.index("Tarjetas") + 1
        while k + 1 < len(bl) and re.match(r"\(\d+'\)", bl[k]):
            out.append({"minuto": int(re.match(r"\((\d+)'\)", bl[k]).group(1)), "jugador": bl[k + 1]})
            k += 2
        return out

    # colores de las tarjetas, en orden de aparición en el HTML
    colores = re.findall(r"tarj_(\w+)\.gif", html)
    equipos_acta = {}
    for nombre_equipo in (local, visit):
        bl = bloque(nombre_equipo)
        equipos_acta[nombre_equipo] = {
            "titulares": jugadores(bl, "Titulares"),
            "suplentes": jugadores(bl, "Suplentes"),
            "cambios": cambios(bl),
            "tarjetas": tarjetas(bl),
        }
    todas = equipos_acta[local]["tarjetas"] + equipos_acta[visit]["tarjetas"]
    if len(colores) == len(todas):
        for t, c in zip(todas, colores):
            t["tipo"] = "roja" if "roj" in c else "amarilla"
    else:
        for t in todas:
            t["tipo"] = "amarilla"
        print(f"[aviso] {path}: no cuadran los colores de tarjeta ({len(colores)} vs {len(todas)}); todas amarillas", file=sys.stderr)
    acta["equipos"] = equipos_acta
    nuestro = local if acta["es_local"] else visit
    acta["nuestro"], acta["rival_nombre"] = nuestro, (visit if acta["es_local"] else local)
    acta["goles_favor"] = sum(1 for g in goles if es_de(g["jugador"], equipos_acta[nuestro]) != g["propia"])
    acta["goles_contra"] = len(goles) - acta["goles_favor"]
    return acta


def es_de(nombre, equipo):
    n = norm(nombre)
    return any(norm(j["nombre"]) == n for j in equipo["titulares"] + equipo["suplentes"])


def dorsal_de(nombre, equipo):
    n = norm(nombre)
    for j in equipo["titulares"] + equipo["suplentes"]:
        if norm(j["nombre"]) == n:
            return j["dorsal"]
    return None


# ------------------------------------------------------------ SQL
def v(*vals):
    """Fila de un VALUES: str → literal, bool/int tal cual, None → null."""
    out = []
    for x in vals:
        if x is None:
            out.append("null")
        elif isinstance(x, bool):
            out.append("true" if x else "false")
        elif isinstance(x, (int, float)):
            out.append(str(x))
        else:
            out.append(sql_str(x))
    return "(" + ", ".join(out) + ")"


def generar(equipo_patron, nosotros, calendario, actas):
    out = []
    w = out.append
    w("-- Generado por scripts/acta_a_sql.py (repo torneo-chupete-resultados) a partir del")
    w("-- calendario y las actas de la FFIB. Se puede repetir: los partidos se buscan por")
    w("-- jornada, la plantilla por nombre y apellidos, y de cada acta se borran y regraban")
    w("-- alineación y eventos.")
    w("do $$")
    w("declare")
    w("  t uuid; m uuid; l uuid; n int;")
    w("begin")
    w(f"  select id into t from public.teams where lower(coalesce(liga,'') || ' ' || coalesce(categoria,'') || ' ' || corto || ' ' || nombre) like '%{equipo_patron.lower()}%' order by created_at limit 1;")
    w(f"  if t is null then raise exception 'No encuentro ningún equipo con \"{equipo_patron}\" en su liga, categoría o nombre.'; end if;")
    w("")
    # plantilla
    plantilla = {}
    for a in actas:
        for j in a["equipos"][a["nuestro"]]["titulares"] + a["equipos"][a["nuestro"]]["suplentes"]:
            nom, ape = nombre_persona(j["nombre"])
            plantilla.setdefault((nom, ape), j["dorsal"])
    if plantilla:
        w("  -- ---- plantilla: los que salen en las actas (se crean si no están) ----")
        w("  create temp table j (nombre text, apellidos text, dorsal int, dem text) on commit drop;")
        w("  insert into j values")
        filas = [v(nom, ape, d, "POR" if d == 1 else "CEN") for (nom, ape), d in sorted(plantilla.items(), key=lambda x: x[1])]
        w("    " + ",\n    ".join(filas) + ";")
        w("  insert into public.players (team_id, nombre, apellidos, dorsal, demarcacion)")
        w("  select t, j.nombre, j.apellidos, j.dorsal, j.dem::public.position_group from j")
        w("  where not exists (select 1 from public.players p where p.team_id = t and lower(p.nombre) = lower(j.nombre) and lower(p.apellidos) = lower(j.apellidos));")
        w("  get diagnostics n = row_count;")
        w("  update public.players p set dorsal = j.dorsal from j where p.team_id = t and p.dorsal is null and lower(p.nombre) = lower(j.nombre) and lower(p.apellidos) = lower(j.apellidos);")
        w(f"  raise notice 'Plantilla: % jugadores nuevos ({len(plantilla)} en las actas).', n;")
        w("")
    # calendario
    if calendario:
        w("  -- ---- calendario: un partido por jornada (solo se crean los que faltan) ----")
        w("  create temp table c (jornada int, rival text, fecha timestamptz, es_local boolean, lugar text) on commit drop;")
        w("  insert into c values")
        filas = []
        for f in calendario:
            filas.append(f"({f['jornada']}, {sql_str(rival_bonito(f['rival']))}, '{f['fecha']} 12:00'::timestamp at time zone 'Europe/Madrid', {str(f['es_local']).lower()}, {sql_str('Miquel Nadal') if f['es_local'] else 'null'})")
        w("    " + ",\n    ".join(filas) + ";")
        w("  insert into public.matches (team_id, tipo, rival, fecha, es_local, lugar, jornada, estado)")
        w("  select t, 'liga', c.rival, c.fecha, c.es_local, c.lugar, c.jornada, 'programado' from c")
        w("  where not exists (select 1 from public.matches x where x.team_id = t and x.tipo = 'liga' and x.jornada = c.jornada);")
        w("  get diagnostics n = row_count;")
        w(f"  raise notice 'Calendario: % partidos nuevos ({len(calendario)} jornadas).', n;")
        w("")
    # actas
    for a in actas:
        nuestro = a["equipos"][a["nuestro"]]
        rival_eq = a["equipos"][a["rival_nombre"]]
        gl = a["goles_favor"] if a["es_local"] else a["goles_contra"]
        gv = a["goles_contra"] if a["es_local"] else a["goles_favor"]
        w(f"  -- ---- jornada {a['jornada']}: {a['local']} {gl}-{gv} {a['visitante']} ----")
        w(f"  select id into m from public.matches where team_id = t and tipo = 'liga' and jornada = {a['jornada']};")
        w(f"  if m is null then raise exception 'Falta el partido de la jornada {a['jornada']}.'; end if;")
        fecha = f"'{a['fecha']}'::timestamp at time zone 'Europe/Madrid'" if a["fecha"] else "fecha"
        lugar = sql_str(titulo(a["estadio"]) if a["estadio"] else None)
        w(f"  update public.matches set fecha = {fecha}, lugar = coalesce({lugar}, lugar), es_local = {str(a['es_local']).lower()}, estado = 'finalizado', goles_favor = {a['goles_favor']}, goles_contra = {a['goles_contra']}, duracion_min = 90 where id = m;")
        w("  insert into public.lineups (match_id, formacion, published_at) values (m, '4-3-3', now()) on conflict (match_id) do update set published_at = coalesce(public.lineups.published_at, now()) returning id into l;")
        w("  delete from public.lineup_players where lineup_id = l;")
        w("  insert into public.lineup_players (lineup_id, player_id, titular)")
        w("  select l, p.id, a.titular from (values")
        filas = []
        for j in nuestro["titulares"]:
            nom, ape = nombre_persona(j["nombre"]); filas.append(v(nom, ape, True))
        for j in nuestro["suplentes"]:
            nom, ape = nombre_persona(j["nombre"]); filas.append(v(nom, ape, False))
        w("    " + ",\n    ".join(filas))
        w("  ) a(nombre, apellidos, titular)")
        w("  join public.players p on p.team_id = t and lower(p.nombre) = lower(a.nombre) and lower(p.apellidos) = lower(a.apellidos);")
        w("  delete from public.match_events where match_id = m;")
        # eventos: (orden, minuto, equipo, tipo, nombre, apellidos, nombre2, apellidos2, dorsal_rival, dorsal_rival2, penalti, propia, en_descanso)
        ev = []
        for c in nuestro["cambios"]:
            n1, a1 = nombre_persona(c["sale"]); n2, a2 = nombre_persona(c["entra"])
            ev.append((c["minuto"], "favor", "cambio", n1, a1, n2, a2, None, None, False, False, c["minuto"] in (45, 46)))
        for c in rival_eq["cambios"]:
            ev.append((c["minuto"], "contra", "cambio", None, None, None, None, c["sale_dorsal"], c["entra_dorsal"], False, False, c["minuto"] in (45, 46)))
        for g in a["goles"]:
            mio = es_de(g["jugador"], nuestro)
            eq = "favor" if mio != g["propia"] else "contra"
            if mio:
                n1, a1 = nombre_persona(g["jugador"])
                ev.append((g["minuto"], eq, "gol", n1, a1, None, None, None, None, g["penalti"], g["propia"], False))
            else:
                ev.append((g["minuto"], eq, "gol", None, None, None, None, dorsal_de(g["jugador"], rival_eq), None, g["penalti"], g["propia"], False))
        for tj in nuestro["tarjetas"]:
            n1, a1 = nombre_persona(tj["jugador"])
            ev.append((tj["minuto"], "favor", tj["tipo"], n1, a1, None, None, None, None, False, False, False))
        for tj in rival_eq["tarjetas"]:
            ev.append((tj["minuto"], "contra", tj["tipo"], None, None, None, None, dorsal_de(tj["jugador"], rival_eq), None, False, False, False))
        if ev:
            w("  insert into public.match_events (match_id, minuto, equipo, tipo, player_id, player2_id, dorsal_rival, dorsal_rival2, penalti, propia, en_descanso, created_at)")
            # los casts: una columna toda a null en VALUES sale como text
            w("  select m, e.minuto, e.equipo::public.event_team, e.tipo::public.event_type, p.id, p2.id, e.dorsal_rival::int, e.dorsal_rival2::int, e.penalti, e.propia, e.en_descanso, now() + make_interval(secs => e.orden)")
            w("  from (values")
            filas = []
            for i, e in enumerate(ev, 1):
                filas.append(v(i, *e))
            # primera fila con tipos explícitos para las columnas que pueden ir a null
            filas[0] = filas[0].replace("(", "(", 1)
            w("    " + ",\n    ".join(filas))
            w("  ) e(orden, minuto, equipo, tipo, nombre, apellidos, nombre2, apellidos2, dorsal_rival, dorsal_rival2, penalti, propia, en_descanso)")
            w("  left join public.players p on p.team_id = t and lower(p.nombre) = lower(e.nombre::text) and lower(p.apellidos) = lower(e.apellidos::text)")
            w("  left join public.players p2 on p2.team_id = t and lower(p2.nombre) = lower(e.nombre2::text) and lower(p2.apellidos) = lower(e.apellidos2::text);")
        w(f"  raise notice 'Jornada {a['jornada']} grabada: {a['goles_favor']}-{a['goles_contra']}, % eventos.', (select count(*) from public.match_events where match_id = m);")
        w("")
    w("end $$;")
    w("")
    w("-- Comprobación: partidos del equipo")
    w("select m.jornada, to_char(m.fecha at time zone 'Europe/Madrid', 'DD/MM HH24:MI') as fecha, case when m.es_local then 'casa' else 'fuera' end as donde, m.rival, m.estado, m.goles_favor || '-' || m.goles_contra as resultado")
    w(f"from public.matches m join public.teams t on t.id = m.team_id where lower(coalesce(t.liga,'') || ' ' || coalesce(t.categoria,'') || ' ' || t.corto || ' ' || t.nombre) like '%{equipo_patron.lower()}%' order by m.jornada;")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--equipo", required=True, help="texto que identifica al equipo en teams (liga, categoría o nombre)")
    ap.add_argument("--nosotros", required=True, help="cómo escribe la FFIB nuestro equipo (o parte)")
    ap.add_argument("--calendario")
    ap.add_argument("--actas", nargs="*", default=[])
    args = ap.parse_args()
    cal = leer_calendario(args.calendario, args.nosotros) if args.calendario else []
    actas = [leer_acta(p, args.nosotros) for p in args.actas]
    for a in actas:
        print(f"[info] jornada {a['jornada']}: {a['local']} vs {a['visitante']} → {a['goles_favor']}-{a['goles_contra']} (nuestros), {len(a['goles'])} goles, {a['fecha']}, {a['estadio']}", file=sys.stderr)
    sys.stdout.write(generar(args.equipo, args.nosotros, cal, actas))


if __name__ == "__main__":
    main()
