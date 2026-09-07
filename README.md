# Torneo Chupete · Resultados

Web estática (GitHub Pages) con dos páginas:

- **`index.html`** — marcador del 17º Torneo Chupete: grupos, cruces y clasificación final.
- **`clasificacion.html`** — clasificación de liga del Sporting Ciutat de Palma con escudos, tomada de la web de la FFIB.

## Clasificación de liga (FFIB)

Los datos viven en `data/clasificacion.json` y los escudos en `data/escudos/`. Los genera
`scripts/clasificacion.py`, que descarga y parsea la página de clasificación de
[ffib.es](https://www.ffib.es) (sistema Fedintranet).

El workflow **Actualizar clasificación FFIB** (`.github/workflows/clasificacion.yml`) lo ejecuta
automáticamente cada día a las 21:00 UTC y los domingos a las 14:00 y 17:00 UTC, y hace commit
solo si hay cambios. Para lanzarlo a mano: pestaña *Actions → Actualizar clasificación FFIB → Run workflow*.

- Para cambiar de competición, grupo o jornada, define la variable de repositorio
  `CLASIFICACION_URL` (*Settings → Secrets and variables → Actions → Variables*) con la URL de
  ffib.es, o pásala como *input* al lanzar el workflow a mano.
- El equipo que se resalta en la tabla se configura con la constante `MI_EQUIPO` en `clasificacion.html`.
- El scraper avanza automáticamente con el botón «Jornada Siguiente» hasta la última jornada con
  resultados, así que no hace falta cambiar `codjornada` cada semana.
- Los escudos se toman de la ficha de cada equipo en ffib.es y se guardan como `data/escudos/<codequipo>.*`.
  Si a un equipo le falta, basta con dejar un `data/escudos/<codequipo>.png` a mano: el scraper lo respeta y
  no vuelve a pedirlo.
- El workflow también se ejecuta al hacer push de cambios en el scraper o en el propio workflow. El disparo
  manual y el programado solo funcionan cuando el workflow está en la rama por defecto (`main`).

Ejecución local:

```bash
pip install requests beautifulsoup4
python3 scripts/clasificacion.py --url "https://www.ffib.es/Fed/NPcd/NFG_VisClasificacion?...&codcompeticion=...&codgrupo=..."
```
