#!/usr/bin/env node
// Crea en GesDep la convocatoria de un partido con lo que ya hay en la app.
//
// Entrada: JSON en la variable GESDEP_PAYLOAD (o ruta a un fichero como
// primer argumento). Puede ser UNA convocatoria o { convocatorias: [...] }
// (se hacen en orden con la misma sesión). Si ya existe una del mismo día,
// motivo y equipo, se abre y se actualiza (jugadores que faltan se convocan,
// los que sobran se quitan, cabecera repasada). Campos de cada una:
//   modo            "prueba" (rellena, hace captura y NO guarda) | "real"
//   match_id        id del partido en la app (para el aviso de vuelta)
//   callback_url    adónde avisar al terminar (opcional)
//   equipo_gesdep   nombre del equipo en GesDep, p. ej. "JUVENIL ATLETICO A"
//   motivo          "JORNADA 5"
//   citacion_iso    instante de la citación (hora inicio; fin = +15 min)
//   lugar           campo (lugar de la convocatoria y donde se desarrolla)
//   vestimenta      "Primera Equipacion"
//   observaciones   texto libre (opcional)
//   publicar        true para marcar "Publicar la convocatoria en acceso padres/jugadores"
//   jugadores       [{ nombre, apellidos, apodo }] (vacío = solo la cabecera, no se quita a nadie)
//   personal        [{ nombre, apellidos }]
//
// Entorno: GESDEP_USER, GESDEP_PASS, GESDEP_CALLBACK_SECRET; para pruebas
// locales GESDEP_BASE_URL (por defecto https://www.gesdep.net) y
// GESDEP_SIN_LOGIN=1.

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { parseDeportista, parsePersonal, emparejar, fechaHoraES, login, avisarApp, norm } = require("./lib");

const BASE = (process.env.GESDEP_BASE_URL || "https://www.gesdep.net").replace(/\/$/, "");
const RUTA_LISTA = "/v3/forms/competitions/frmConvocatorias.aspx";
const SALIDA = path.join(__dirname, "salida");
const MINUTOS_FIN = 15;

const log = (m) => console.log(`[gesdep] ${m}`);

function leerPayload() {
  const crudo = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : process.env.GESDEP_PAYLOAD;
  if (!crudo) throw new Error("Falta el payload (GESDEP_PAYLOAD o fichero)");
  const raiz = JSON.parse(crudo);
  const lista = Array.isArray(raiz.convocatorias) ? raiz.convocatorias : [raiz];
  if (lista.length === 0) throw new Error("El payload no trae ninguna convocatoria");
  return lista.map((p, i) => {
    for (const k of ["equipo_gesdep", "motivo", "citacion_iso"]) {
      if (p[k] == null) throw new Error(`La convocatoria ${i + 1} no trae "${k}"`);
    }
    return {
      ...p,
      modo: (p.modo ?? raiz.modo) === "real" ? "real" : "prueba",
      callback_url: p.callback_url ?? raiz.callback_url,
      jugadores: p.jugadores ?? [],
      personal: p.personal ?? [],
      vestimenta: p.vestimenta ?? "Primera Equipacion",
    };
  });
}

/** Campo (input/textarea) que sigue a una etiqueta con ese texto exacto. */
function campo(page, etiqueta, tipo = "input") {
  const t = etiqueta.replace(/'/g, "\\'");
  const filtro = tipo === "input" ? "input[not(@type='hidden') and not(@type='checkbox') and not(@type='radio')]" : tipo;
  return page
    .locator(`xpath=//*[self::label or self::span or self::div or self::td][normalize-space(.)='${t}']/following::${filtro}[1]`)
    .first();
}

async function rellenar(page, etiqueta, valor, tipo = "input") {
  const c = campo(page, etiqueta, tipo);
  if ((await c.count()) === 0) throw new Error(`No encuentro el campo "${etiqueta}"`);
  await c.fill(String(valor));
  // Los campos de fecha/hora suelen llevar selector: Tab para que lo acepte
  await c.press("Tab");
}

/** Desplegable que sigue a una etiqueta. */
function desplegable(page, etiqueta) {
  const t = etiqueta.replace(/'/g, "\\'");
  return page.locator(`xpath=//*[normalize-space(.)='${t}']/following::select[1]`).first();
}

async function elegirEquipo(page, select, nombre) {
  const opciones = await select.locator("option").allTextContents();
  const op = opciones.find((o) => norm(o) === norm(nombre));
  if (!op) throw new Error(`El equipo "${nombre}" no está en el desplegable (hay: ${opciones.map((o) => o.trim()).filter(Boolean).join(" | ")})`);
  const actual = await select.evaluate((s) => s.options[s.selectedIndex]?.text ?? "");
  if (norm(actual) === norm(nombre)) return;
  await Promise.all([
    page.waitForLoadState("networkidle"),
    select.selectOption({ label: op }),
  ]);
  await page.waitForLoadState("networkidle");
}

/**
 * Todas las casillas de la zona de listas, repartidas por columna según la
 * cabecera más cercana en horizontal: "disponibles", "convocados", "personal".
 */
async function casillasPorColumna(page) {
  return page.evaluate(() => {
    const cabeceras = [];
    const todos = Array.from(document.querySelectorAll("body *"));
    const buscar = (re, clave) => {
      const el = todos.find((e) => e.children.length === 0 && re.test(e.textContent || ""))
        || todos.find((e) => re.test((e.textContent || "").trim()) && (e.textContent || "").trim().length < 60);
      if (el) {
        const r = el.getBoundingClientRect();
        cabeceras.push({ clave, x: r.left + r.width / 2, y: r.top });
      }
    };
    buscar(/Deportistas disponibles/i, "disponibles");
    buscar(/Deportistas convocados/i, "convocados");
    buscar(/Personal que acompa/i, "personal");
    const yMin = Math.min(...cabeceras.map((c) => c.y));
    const salida = { disponibles: [], convocados: [], personal: [] };
    document.querySelectorAll('input[type="checkbox"]').forEach((cb, i) => {
      const r = cb.getBoundingClientRect();
      if (r.top < yMin) return; // transporte, publicar…
      const x = r.left + r.width / 2;
      let mejor = null;
      for (const c of cabeceras) if (!mejor || Math.abs(c.x - x) < Math.abs(mejor.x - x)) mejor = c;
      if (!mejor) return;
      // Texto: la etiqueta asociada o el texto del contenedor más cercano
      let texto = "";
      if (cb.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
        if (lab) texto = lab.textContent || "";
      }
      if (!texto.trim()) {
        let el = cb.parentElement;
        while (el && !(el.textContent || "").trim() && el !== document.body) el = el.parentElement;
        texto = el ? el.textContent || "" : "";
      }
      cb.setAttribute("data-robot-idx", String(i));
      salida[mejor.clave].push({ idx: i, texto: texto.replace(/\s+/g, " ").trim() });
    });
    return salida;
  });
}

async function marcar(page, idx) {
  const cb = page.locator(`input[type="checkbox"][data-robot-idx="${idx}"]`);
  if (!(await cb.isChecked())) await cb.check();
}

/** Abre una convocatoria ya existente desde la lista (fila con ese texto). */
async function abrirFila(page, inicio, p) {
  const fila = page
    .locator("table tr")
    .filter({ hasText: inicio.fecha })
    .filter({ hasText: new RegExp(p.motivo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
    .first();
  const enlace = fila.locator("a").first();
  if ((await enlace.count()) > 0) await enlace.click();
  else await fila.locator("td").first().click();
  await page.waitForLoadState("networkidle");
  if ((await campo(page, "Motivo").count()) === 0) {
    throw new Error("He pulsado en la convocatoria existente pero no se ha abierto el formulario");
  }
}

/** Una convocatoria: crear o actualizar. Devuelve el resumen para la app. */
async function procesar(page, p, captura) {
  const resumen = { match_id: p.match_id, tipo: "convocatoria", modo: p.modo, estado: "error", mensaje: "", sin_pareja: [], personal_sin_pareja: [] };
  const inicio = fechaHoraES(p.citacion_iso);
  const fin = fechaHoraES(new Date(new Date(p.citacion_iso).getTime() + MINUTOS_FIN * 60_000).toISOString());
  log(`convocatoria ${p.equipo_gesdep} · ${p.motivo} · ${inicio.fecha} ${inicio.hora}-${fin.hora} · ${p.lugar ?? "sin lugar"} · ${p.jugadores.length} jugadores`);

  // 1) Lista: ¿ya existe? → se abre y se actualiza; si no → Nueva
  await page.goto(`${BASE}${RUTA_LISTA}`, { waitUntil: "networkidle" });
  const filas = await page.locator("table tr").allTextContents();
  const existe = filas.some((f) => f.includes(inicio.fecha) && norm(f).includes(norm(p.motivo)) && norm(f).includes(norm(p.equipo_gesdep)));
  if (existe) {
    log("ya existe: la abro para actualizarla");
    await abrirFila(page, inicio, p);
  } else {
    const nueva = page.getByRole("button", { name: /^Nueva$/i }).or(page.getByRole("link", { name: /^Nueva$/i })).first();
    if ((await nueva.count()) === 0) throw new Error('No encuentro el botón "Nueva"');
    await nueva.click();
    await page.waitForLoadState("networkidle");
    await elegirEquipo(page, desplegable(page, "Equipo"), p.equipo_gesdep);
  }

  // 2) Cabecera (en una existente se repasa: los valores son los mismos siempre)
  await rellenar(page, "Motivo", p.motivo);
  await rellenar(page, "Fecha Inicio", inicio.fecha);
  await rellenar(page, "Hora inicio", inicio.hora);
  await rellenar(page, "Fecha fin", fin.fecha);
  await rellenar(page, "Hora fin", fin.hora);
  if (p.lugar) {
    await rellenar(page, "Lugar de la convocatoria", p.lugar);
    await rellenar(page, "Lugar dónde se desarrolla", p.lugar);
  }
  await rellenar(page, "Vestimenta", p.vestimenta);
  if (p.observaciones) await rellenar(page, "Observaciones", p.observaciones, "textarea");
  const publicar = page.locator("xpath=//label[contains(normalize-space(.),'Publicar la convocatoria')]//input[@type='checkbox'] | //input[@type='checkbox'][following::*[contains(normalize-space(.),'Publicar la convocatoria')]][last()]").first();
  if ((await publicar.count()) > 0 && p.publicar != null) {
    if (p.publicar) await publicar.check(); else await publicar.uncheck();
  }

  // 3) Jugadores: los que faltan se convocan; los que sobran se quitan
  await elegirEquipo(page, desplegable(page, "Equipo -"), p.equipo_gesdep);
  let columnas = await casillasPorColumna(page);
  let convocadosGes = columnas.convocados.map((c) => ({ ...parseDeportista(c.texto), idx: c.idx }));
  const disponibles = columnas.disponibles.map((c) => ({ ...parseDeportista(c.texto), idx: c.idx }));
  const yaEstan = emparejar(p.jugadores, convocadosGes);
  const { emparejados, sinPareja } = emparejar(yaEstan.sinPareja, disponibles);
  resumen.sin_pareja = sinPareja.map((j) => `${j.nombre} ${j.apellidos}`.trim());
  const sobran = p.jugadores.length > 0 ? convocadosGes.filter((c) => ![...yaEstan.emparejados.values()].includes(c)) : [];
  log(`jugadores: ${p.jugadores.length} en la app · ${yaEstan.emparejados.size} ya convocados · ${emparejados.size} a convocar · ${sobran.length} a quitar · ${sinPareja.length} sin pareja`);

  if (sobran.length > 0) {
    for (const c of sobran) await marcar(page, c.idx);
    const quitar = page.getByRole("button", { name: /Quitar de la convocatoria/i }).first();
    if ((await quitar.count()) === 0) throw new Error('No encuentro el botón "Quitar de la convocatoria"');
    await quitar.click();
    await page.waitForLoadState("networkidle");
    columnas = await casillasPorColumna(page);
  }
  if (emparejados.size > 0) {
    // Tras quitar, los índices han cambiado: se vuelven a localizar por texto
    const disponiblesAhora = columnas.disponibles.map((c) => ({ ...parseDeportista(c.texto), idx: c.idx }));
    for (const e of emparejados.values()) {
      const d = disponiblesAhora.find((x) => norm(x.texto) === norm(e.texto));
      if (!d) throw new Error(`"${e.texto}" ha desaparecido de disponibles`);
      await marcar(page, d.idx);
    }
    const convocar = page.getByRole("button", { name: /Convocar/i }).first();
    if ((await convocar.count()) === 0) throw new Error('No encuentro el botón "Convocar ->"');
    await convocar.click();
    await page.waitForLoadState("networkidle");
    columnas = await casillasPorColumna(page);
    const ahora = columnas.convocados.map((c) => parseDeportista(c.texto));
    const noPasaron = [...emparejados.values()].filter((e) => !ahora.some((a) => norm(a.texto.replace(/^[^:]{1,12}:\s*/, "")) === norm(e.texto)));
    if (noPasaron.length > 0) throw new Error(`Tras "Convocar" no aparecen en convocados: ${noPasaron.map((e) => e.texto).join(", ")}`);
  }
  const totalConvocados = columnas.convocados.length;

  // 4) Personal que acompaña (se marcan los nuestros; no se desmarca a nadie)
  const personal = columnas.personal.map((c) => ({ ...parsePersonal(c.texto), idx: c.idx }));
  const emp = emparejar(p.personal.map((s) => ({ ...s, apodo: null })), personal);
  resumen.personal_sin_pareja = emp.sinPareja.map((s) => `${s.nombre} ${s.apellidos}`.trim());
  for (const e of emp.emparejados.values()) await marcar(page, e.idx);
  log(`personal: ${emp.emparejados.size} marcados · ${emp.sinPareja.length} sin pareja`);

  await captura(`convocatoria-${p.match_id ?? "sin-id"}-formulario`);

  // 5) Guardar (solo en modo real)
  const accion = existe ? "actualizada" : "creada";
  if (p.modo === "real") {
    const guardar = page.getByRole("button", { name: /^Guardar y salir$/i }).first();
    if ((await guardar.count()) === 0) throw new Error('No encuentro el botón "Guardar y salir"');
    await guardar.click();
    await page.waitForLoadState("networkidle");
    const filasDespues = await page.locator("table tr").allTextContents();
    const guardada = filasDespues.find((f) => f.includes(inicio.fecha) && norm(f).includes(norm(p.motivo)));
    await captura(`convocatoria-${p.match_id ?? "sin-id"}-lista`);
    if (!guardada) throw new Error("He pulsado Guardar pero la convocatoria no aparece en la lista");
    resumen.estado = "ok";
    resumen.mensaje = `Convocatoria ${accion} en GesDep (${inicio.fecha} ${inicio.hora}, ${totalConvocados} jugadores, ${emp.emparejados.size} del cuerpo técnico)`;
  } else {
    resumen.estado = "prueba_ok";
    resumen.mensaje = `Prueba correcta: sería ${accion} (${inicio.fecha} ${inicio.hora}, ${totalConvocados} jugadores, ${emp.emparejados.size} del cuerpo técnico), sin guardar`;
  }
  if (resumen.sin_pareja.length > 0) resumen.mensaje += ` · sin pareja en GesDep: ${resumen.sin_pareja.join(", ")}`;
  if (resumen.personal_sin_pareja.length > 0) resumen.mensaje += ` · cuerpo técnico sin pareja: ${resumen.personal_sin_pareja.join(", ")}`;
  log(resumen.mensaje);
  return resumen;
}

async function main() {
  const lista = leerPayload();
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1800 }, locale: "es-ES" });
  const captura = (nombre) => page.screenshot({ path: path.join(SALIDA, `${nombre}.png`), fullPage: true }).catch(() => {});
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;
  const resumenes = [];

  try {
    if (!process.env.GESDEP_SIN_LOGIN) {
      if (!process.env.GESDEP_USER || !process.env.GESDEP_PASS) throw new Error("Faltan GESDEP_USER / GESDEP_PASS");
      await login(page, BASE, process.env.GESDEP_USER, process.env.GESDEP_PASS, log);
    }
  } catch (e) {
    // Sin sesión no hay nada que hacer: se avisa de todas y se sale
    log(`ERROR: ${e.message}`);
    await captura("login-error");
    for (const p of lista) {
      const r = { match_id: p.match_id, tipo: "convocatoria", modo: p.modo, estado: "error", mensaje: e.message, run_url: runUrl };
      resumenes.push(r);
      await avisarApp(p, r, log).catch((err) => log(`no se pudo avisar a la app: ${err.message}`));
    }
    await browser.close();
    fs.writeFileSync(path.join(SALIDA, "resumen.json"), JSON.stringify(resumenes.length === 1 ? resumenes[0] : resumenes, null, 2));
    process.exit(1);
  }

  let fallos = 0;
  for (const p of lista) {
    let resumen;
    try {
      resumen = await procesar(page, p, captura);
    } catch (e) {
      fallos++;
      resumen = { match_id: p.match_id, tipo: "convocatoria", modo: p.modo, estado: "error", mensaje: e.message, sin_pareja: [], personal_sin_pareja: [] };
      log(`ERROR: ${e.message}`);
      await captura(`convocatoria-${p.match_id ?? "sin-id"}-error`);
    }
    resumen.run_url = runUrl;
    resumenes.push(resumen);
    await avisarApp(p, resumen, log).catch((err) => log(`no se pudo avisar a la app: ${err.message}`));
  }
  await browser.close();
  fs.writeFileSync(path.join(SALIDA, "resumen.json"), JSON.stringify(resumenes.length === 1 ? resumenes[0] : resumenes, null, 2));
  log(`${lista.length - fallos}/${lista.length} convocatorias bien`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
