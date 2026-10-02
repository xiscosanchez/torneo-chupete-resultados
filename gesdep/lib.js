// Utilidades del robot de GesDep: nombres, fechas, sesión y aviso a la app.

/** Sin acentos, en mayúsculas, un solo espacio y sin signos raros. */
function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Una entrada de GesDep ("JUV A: CONDE - Conde, Alejandro" o
 * "LUIS - ARIAS BLANCO , LUIS") → { apodo, apellidos, nombre }.
 * El prefijo "XXX:" es el equipo y se ignora.
 */
function parseDeportista(texto) {
  let t = String(texto).trim().replace(/^[^:]{1,12}:\s*/, "");
  let apodo = null;
  const guion = t.indexOf(" - ");
  if (guion >= 0) {
    apodo = t.slice(0, guion).trim();
    t = t.slice(guion + 3);
  }
  const coma = t.indexOf(",");
  const apellidos = coma >= 0 ? t.slice(0, coma).trim() : t.trim();
  const nombre = coma >= 0 ? t.slice(coma + 1).trim() : "";
  return { apodo, apellidos, nombre, texto: String(texto).trim() };
}

/** "CORTES ROMERO, RAFAEL" → { apellidos, nombre } */
function parsePersonal(texto) {
  const coma = texto.indexOf(",");
  return {
    apellidos: coma >= 0 ? texto.slice(0, coma).trim() : texto.trim(),
    nombre: coma >= 0 ? texto.slice(coma + 1).trim() : "",
    texto: texto.trim(),
  };
}

/**
 * Empareja a los nuestros ({nombre, apellidos, apodo}) con las entradas de
 * GesDep ya parseadas. Por escalones: apellidos+nombre exactos → apellidos
 * exactos y primer nombre → apodo igual al apodo o al nombre → nuestros
 * apellidos contenidos en los suyos (o al revés) con el nombre coincidiendo.
 * Devuelve { emparejados: Map(nuestro → entrada), sinPareja: [nuestros] }.
 */
function emparejar(nuestros, entradas) {
  const libres = new Set(entradas);
  const emparejados = new Map();
  const sinPareja = [];
  const primer = (s) => norm(s).split(" ")[0] ?? "";
  const escalones = [
    (n, e) => norm(e.apellidos) === norm(n.apellidos) && norm(e.nombre) === norm(n.nombre),
    (n, e) => norm(e.apellidos) === norm(n.apellidos) && primer(e.nombre) === primer(n.nombre),
    (n, e) => e.apodo && (norm(e.apodo) === norm(n.apodo) || norm(e.apodo) === norm(n.nombre)),
    (n, e) =>
      primer(e.nombre) === primer(n.nombre) &&
      (norm(e.apellidos).includes(norm(n.apellidos)) || norm(n.apellidos).includes(norm(e.apellidos))) &&
      norm(n.apellidos).length >= 4,
  ];
  for (const n of nuestros) {
    let elegido = null;
    for (const ok of escalones) {
      const candidatos = [...libres].filter((e) => ok(n, e));
      if (candidatos.length === 1) {
        elegido = candidatos[0];
        break;
      }
    }
    if (elegido) {
      libres.delete(elegido);
      emparejados.set(n, elegido);
    } else {
      sinPareja.push(n);
    }
  }
  return { emparejados, sinPareja };
}

/** "2026-10-03T08:45:00.000Z" → { fecha: "03/10/2026", hora: "10:45" } en hora española. */
function fechaHoraES(iso) {
  const d = new Date(iso);
  const partes = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t) => partes.find((p) => p.type === t)?.value ?? "";
  return { fecha: `${v("day")}/${v("month")}/${v("year")}`, hora: `${v("hour")}:${v("minute")}` };
}

/** Inicia sesión en GesDep. Busca el usuario y la contraseña por tipo de campo. */
async function login(page, base, usuario, clave, log) {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const pass = page.locator('input[type="password"]').first();
  if ((await pass.count()) === 0) {
    // Algunas portadas tienen un enlace "Acceso" antes del formulario
    const acceso = page.getByRole("link", { name: /acceso|entrar|login|iniciar/i }).first();
    if ((await acceso.count()) > 0) {
      await acceso.click();
      await page.waitForLoadState("networkidle");
    }
  }
  if ((await page.locator('input[type="password"]').count()) === 0) {
    throw new Error("No encuentro el formulario de acceso de GesDep (ningún campo de contraseña)");
  }
  const user = page
    .locator('input[type="text"], input[type="email"], input:not([type])')
    .filter({ hasNot: page.locator('[type="hidden"]') })
    .first();
  await user.fill(usuario);
  await page.locator('input[type="password"]').first().fill(clave);
  await page.locator('input[type="password"]').first().press("Enter");
  await page.waitForLoadState("networkidle");
  if ((await page.locator('input[type="password"]').count()) > 0) {
    throw new Error("GesDep no ha aceptado el usuario y la contraseña");
  }
  log("sesión iniciada");
}

/** Avisa a la app del resultado (si el payload trae callback). */
async function avisarApp(payload, cuerpo, log) {
  const url = payload.callback_url;
  const secreto = process.env.GESDEP_CALLBACK_SECRET;
  if (!url || !secreto) {
    log("sin callback a la app (falta callback_url o GESDEP_CALLBACK_SECRET)");
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secreto}` },
    body: JSON.stringify(cuerpo),
  });
  log(`aviso a la app: ${res.status}`);
}

module.exports = { norm, parseDeportista, parsePersonal, emparejar, fechaHoraES, login, avisarApp };
