// Prueba del robot contra el GesDep de mentira: modo prueba (no guarda),
// modo real (guarda lo esperado) y convocatoria repetida (no duplica).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { crear } = require("./fake/servidor");
const { parseDeportista, emparejar } = require("../lib");

const DISPONIBLES = [
  "LUIS - ARIAS BLANCO , LUIS",
  "RICA - GOMEZ BARBOSA , RICARDO ADRIAN",
  "AARON - FERRAGUT LOPEZ, AARON",
  "ADRIAN - ALARCON FERER, ADRIAN",
  "CONDE - Conde, Alejandro",
  "PETER - BADASERAYE MUNAR, PETER",
  "KARLO - JIMÉNEZ JARAMILLO, KARLO ANDREU",
  "FULLANA - FULLANA PERICAS, ALEJANDRO",
];
const PERSONAL = ["AGUILO ROS, JORGE VICENTE", "CORTES ROMERO, RAFAEL", "FUSTER TALAVULL, RAUL"];

const payloadBase = {
  match_id: "m-99",
  equipo_gesdep: "Juvenil Atletico A",
  motivo: "JORNADA 5",
  citacion_iso: "2026-10-03T08:45:00.000Z", // 10:45 en Madrid (CEST)
  lugar: "MIQUEL NADAL",
  observaciones: "Llegar cambiados",
  publicar: false,
  jugadores: [
    { nombre: "Luis", apellidos: "Arias Blanco", apodo: null },
    { nombre: "Ricardo Adrián", apellidos: "Gómez Barbosa", apodo: "Rica" },
    { nombre: "Alejandro", apellidos: "Conde", apodo: "Conde" },
    { nombre: "Peter", apellidos: "Badaseraye", apodo: null }, // apellido parcial
    { nombre: "Karlo", apellidos: "Jiménez", apodo: "Karlo" }, // por apodo
    { nombre: "Nadie", apellidos: "Inventado", apodo: null }, // sin pareja
  ],
  personal: [{ nombre: "Rafael", apellidos: "Cortés Romero" }, { nombre: "Xisco", apellidos: "Sánchez" }],
};

// --- emparejado puro ---
{
  const entradas = DISPONIBLES.map(parseDeportista);
  const { emparejados, sinPareja } = emparejar(payloadBase.jugadores, entradas);
  assert.strictEqual(emparejados.size, 5, "cinco emparejados");
  assert.deepStrictEqual(sinPareja.map((j) => j.nombre), ["Nadie"]);
  assert.strictEqual(emparejados.get(payloadBase.jugadores[3]).apodo, "PETER");
  console.log("✓ emparejado por escalones");
}

// El servidor de mentira vive en este mismo proceso: el robot va en un hijo
// asíncrono para que las peticiones se puedan atender mientras corre.
function ejecutar(payload, puerto) {
  return new Promise((resolve) => {
    const hijo = spawn(process.execPath, [path.join(__dirname, "..", "convocatoria.js")], {
      env: { ...process.env, GESDEP_BASE_URL: `http://127.0.0.1:${puerto}`, GESDEP_SIN_LOGIN: "1", GESDEP_PAYLOAD: JSON.stringify(payload) },
    });
    let salida = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (salida += d));
    hijo.on("close", (status) => {
      const resumen = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "salida", "resumen.json"), "utf8"));
      resolve({ r: { status, stdout: salida, stderr: "" }, resumen });
    });
  });
}

(async () => {
  const { server, estado } = crear({ disponibles: DISPONIBLES, personal: PERSONAL });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const puerto = server.address().port;
  try {
    // modo prueba: no guarda
    let { r, resumen } = await ejecutar({ ...payloadBase, modo: "prueba" }, puerto);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(resumen.estado, "prueba_ok", resumen.mensaje);
    assert.strictEqual(estado.recibido.length, 0, "en modo prueba no se guarda");
    assert.deepStrictEqual(resumen.sin_pareja, ["Nadie Inventado"]);
    assert.deepStrictEqual(resumen.personal_sin_pareja, ["Xisco Sánchez"]);
    console.log("✓ modo prueba: rellena y no guarda —", resumen.mensaje);

    // modo real: guarda con los datos esperados
    ({ r, resumen } = await ejecutar({ ...payloadBase, modo: "real" }, puerto));
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(resumen.estado, "ok", resumen.mensaje);
    assert.strictEqual(estado.recibido.length, 1);
    const d = estado.recibido[0];
    assert.deepStrictEqual(
      { motivo: d.motivo[0], fi: d.fecha_inicio[0], hi: d.hora_inicio[0], ff: d.fecha_fin[0], hf: d.hora_fin[0], lc: d.lugar_convocatoria[0], ld: d.lugar_desarrollo[0], v: d.vestimenta[0], obs: d.observaciones[0], eq: d.equipo[0], pub: d.publicar },
      { motivo: "JORNADA 5", fi: "03/10/2026", hi: "10:45", ff: "03/10/2026", hf: "11:00", lc: "MIQUEL NADAL", ld: "MIQUEL NADAL", v: "Primera Equipacion", obs: "Llegar cambiados", eq: "JUVENIL ATLETICO A", pub: undefined }
    );
    assert.deepStrictEqual(
      d.conv.sort(),
      ["CONDE - Conde, Alejandro", "KARLO - JIMÉNEZ JARAMILLO, KARLO ANDREU", "LUIS - ARIAS BLANCO , LUIS", "PETER - BADASERAYE MUNAR, PETER", "RICA - GOMEZ BARBOSA , RICARDO ADRIAN"].sort()
    );
    assert.deepStrictEqual(d.personal, ["CORTES ROMERO, RAFAEL"]);
    assert.strictEqual(d.transporte, undefined, "no toca el transporte");
    console.log("✓ modo real: guarda cabecera, 5 jugadores y 1 del cuerpo técnico");

    // ya existe: se actualiza (entra Aarón, sale Luis), sin duplicar
    const jugadores2 = payloadBase.jugadores.filter((j) => j.nombre !== "Luis").concat([{ nombre: "Aaron", apellidos: "Ferragut Lopez", apodo: null }]);
    ({ r, resumen } = await ejecutar({ ...payloadBase, modo: "real", jugadores: jugadores2 }, puerto));
    assert.strictEqual(r.status, 0, r.stdout);
    assert.strictEqual(resumen.estado, "ok", resumen.mensaje);
    assert.match(resumen.mensaje, /actualizada/);
    assert.strictEqual(estado.filas.length, 1, "no duplica");
    assert.deepStrictEqual(
      estado.filas[0].convocados.sort(),
      ["AARON - FERRAGUT LOPEZ, AARON", "CONDE - Conde, Alejandro", "KARLO - JIMÉNEZ JARAMILLO, KARLO ANDREU", "PETER - BADASERAYE MUNAR, PETER", "RICA - GOMEZ BARBOSA , RICARDO ADRIAN"].sort()
    );
    console.log("✓ existente: entra Aarón, sale Luis, sin duplicar —", resumen.mensaje);

    // solo cabecera (sin jugadores): no quita a nadie
    ({ r, resumen } = await ejecutar({ ...payloadBase, modo: "real", jugadores: [] }, puerto));
    assert.strictEqual(resumen.estado, "ok", resumen.mensaje);
    assert.strictEqual(estado.filas[0].convocados.length, 5, "sin jugadores en el payload no se quita a nadie");
    console.log("✓ solo cabecera: respeta a los convocados");

    // lote: dos convocatorias en una sola sesión (una nueva, una existente)
    const jornada6 = { ...payloadBase, match_id: "m-100", motivo: "JORNADA 6", citacion_iso: "2026-10-10T15:30:00.000Z", jugadores: payloadBase.jugadores.slice(0, 2) };
    ({ r, resumen } = await ejecutar({ modo: "real", convocatorias: [payloadBase, jornada6] }, puerto));
    assert.strictEqual(r.status, 0, r.stdout);
    assert.ok(Array.isArray(resumen) && resumen.length === 2, "un resumen por convocatoria");
    assert.deepStrictEqual(resumen.map((x) => x.estado), ["ok", "ok"]);
    assert.strictEqual(estado.filas.length, 2);
    const j6 = estado.filas.find((f) => f.motivo === "JORNADA 6");
    assert.deepStrictEqual({ fecha: j6.fecha, hora: j6.hora, n: j6.convocados.length }, { fecha: "10/10/2026", hora: "17:30", n: 2 });
    console.log("✓ lote: dos convocatorias en una sesión —", resumen.map((x) => x.mensaje).join(" | "));
    console.log("TODO OK");
  } finally {
    server.close();
  }
})().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
