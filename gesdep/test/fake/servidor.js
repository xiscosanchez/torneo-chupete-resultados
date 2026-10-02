// GesDep de mentira: dos páginas con el mismo aspecto que las reales
// (lista y formulario de convocatoria) para probar el robot sin tocar la web
// del club. Guarda lo que recibe en `recibido`.
const http = require("http");

const RUTA = "/v3/forms/competitions";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function crear({ equipo = "JUVENIL ATLETICO A", disponibles, personal, filas = [] } = {}) {
  const estado = { filas: [...filas], recibido: [] };

  const lista = () => `<!doctype html><html><head><meta charset="utf-8"><title>Convocatorias</title></head><body>
<h1>Convocatorias</h1>
<a href="${RUTA}/frmConvocatoria.aspx" role="button">Nueva</a>
<label>Equipos</label><select><option>Todos</option><option>${esc(equipo)}</option></select>
<table><tr><th>Fecha</th><th>Equipo</th><th>Hora</th><th>Motivo</th><th>Lugar de la convocatoria</th><th>Lugar dónde se desarrolla</th></tr>
${estado.filas.map((f) => `<tr><td>${esc(f.fecha)}</td><td>${esc(f.equipo)}</td><td>${esc(f.hora)}</td><td>${esc(f.motivo)}</td><td>${esc(f.lugar)}</td><td>${esc(f.lugar)}</td></tr>`).join("\n")}
</table></body></html>`;

  const casilla = (col, texto, i) =>
    `<div><input type="checkbox" name="${col}" value="${esc(texto)}" id="${col}-${i}"><label for="${col}-${i}">${esc(texto)}</label></div>`;

  const formulario = () => `<!doctype html><html><head><meta charset="utf-8"><title>Convocatoria</title>
<style>
 body{font-family:sans-serif;width:1300px}
 .fila{display:flex;gap:16px;margin:8px 0} .fila>div{flex:1}
 label.et{display:block;font-size:13px;color:#456}
 .cols{display:flex;gap:16px;margin-top:24px} .cols>div{flex:1;border:1px solid #ccc;min-height:300px}
 .cols h3{text-align:center;background:#eee;margin:0;padding:8px}
</style></head><body>
<h1>Convocatoria</h1>
<form method="post" action="${RUTA}/guardar" id="f">
<button type="submit" name="accion" value="guardar">Guardar y salir</button>
<button type="button">Hoja de ruta</button> <button type="button">Prepartido</button>
<a href="${RUTA}/frmConvocatorias.aspx">Volver</a>
<div class="fila"><div><label class="et">Equipo</label><select name="equipo"><option></option><option selected>${esc(equipo)}</option><option>INFANTIL A</option></select></div></div>
<div class="fila">
 <div><label class="et">Motivo</label><input name="motivo"></div>
 <div><label class="et">Fecha Inicio</label><input name="fecha_inicio"></div>
 <div><label class="et">Hora inicio</label><input name="hora_inicio"></div>
 <div><label class="et">Fecha fin</label><input name="fecha_fin"></div>
 <div><label class="et">Hora fin</label><input name="hora_fin"></div>
</div>
<div class="fila">
 <div><label class="et">Lugar de la convocatoria</label><input name="lugar_convocatoria"></div>
 <div><label class="et">Lugar dónde se desarrolla</label><input name="lugar_desarrollo"></div>
 <div><label class="et">Vestimenta</label><input name="vestimenta"></div>
</div>
<div class="fila">
 <div><label class="et">Desplazamiento</label><label><input type="radio" name="desplazamiento" value="propia" checked> Por cuenta propia</label> <label><input type="radio" name="desplazamiento" value="club"> Club</label></div>
 <div><label class="et">Medio de transporte</label><label><input type="checkbox" name="transporte" value="auto"> Automóvil</label> <label><input type="checkbox" name="transporte" value="autocar"> Autocar</label></div>
</div>
<div class="fila"><div><label class="et">Observaciones</label><textarea name="observaciones" rows="3" style="width:100%"></textarea></div></div>
<div><label><input type="checkbox" name="publicar" value="1"> Publicar la convocatoria en acceso padres/jugadores</label></div>
<div class="cols">
 <div><h3>Deportistas disponibles</h3><label class="et">Equipo -</label><select name="equipo_panel"><option></option><option selected>${esc(equipo)}</option><option>INFANTIL A</option></select>
  <div id="disponibles">${disponibles.map((t, i) => casilla("disp", t, i)).join("")}</div>
  <button type="button" id="convocar">Convocar -&gt;</button></div>
 <div><h3>Deportistas convocados <span id="n">0</span></h3><div id="convocados"></div><button type="button">Quitar de la convocatoria</button></div>
 <div><h3>Personal que acompaña al equipo</h3>${personal.map((t, i) => casilla("personal", t, i)).join("")}</div>
</div>
</form>
<script>
 document.getElementById("convocar").onclick = () => {
   const prefijo = "JUV A: ";
   document.querySelectorAll('#disponibles input:checked').forEach((cb) => {
     const fila = cb.parentElement; fila.remove();
     const texto = prefijo + cb.value;
     const nuevo = document.createElement("div");
     nuevo.innerHTML = '<input type="checkbox" name="conv" value="' + cb.value.replace(/"/g, "&quot;") + '"><label>' + texto + '</label>';
     document.getElementById("convocados").appendChild(nuevo);
   });
   document.getElementById("n").textContent = document.querySelectorAll('#convocados input').length;
 };
 // Los convocados viajan al guardar aunque no estén marcados: se marcan al enviar
 document.getElementById("f").onsubmit = () => { document.querySelectorAll('#convocados input').forEach((c) => (c.checked = true)); };
</script>
</body></html>`;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === `${RUTA}/frmConvocatorias.aspx`) return res.end(lista());
    if (url.pathname === `${RUTA}/frmConvocatoria.aspx`) return res.end(formulario());
    if (url.pathname === `${RUTA}/guardar` && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const datos = {};
        for (const [k, v] of new URLSearchParams(body)) (datos[k] ??= []).push(v);
        estado.recibido.push(datos);
        estado.filas.unshift({ fecha: datos.fecha_inicio?.[0], equipo: datos.equipo?.[0], hora: datos.hora_inicio?.[0], motivo: datos.motivo?.[0], lugar: datos.lugar_convocatoria?.[0] });
        res.writeHead(302, { Location: `${RUTA}/frmConvocatorias.aspx` });
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end("no");
  });
  return { server, estado };
}

module.exports = { crear };
