// Genera los iconos de la PWA a partir del escudo del club.
// Uso: coloca el escudo en public/escudo.png y ejecuta `npm run icons`.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.dirname(new URL(import.meta.url).pathname);
const pub = path.join(root, "..", "public");
const src = path.join(pub, "escudo.png");

if (!fs.existsSync(src)) {
  console.error("No existe public/escudo.png — copia ahí el escudo del club y repite.");
  process.exit(1);
}

for (const size of [192, 512]) {
  await sharp(src)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(pub, "icons", `icon-${size}.png`));
  console.log(`icons/icon-${size}.png regenerado desde escudo.png`);
}
