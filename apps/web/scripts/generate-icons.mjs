// Rasterises public/icon-source.svg into the PNG sizes iOS and Android need.
// Run manually after editing the SVG: node scripts/generate-icons.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const source = await readFile(join(publicDir, "icon-source.svg"));

// apple-touch-icon must be exactly 180x180 and must not be transparent —
// iOS composites it on a white card otherwise.
const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-512-maskable.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of targets) {
  const png = await sharp(source)
    .resize(size, size)
    .flatten({ background: "#111317" })
    .png()
    .toBuffer();
  await writeFile(join(publicDir, file), png);
  console.log(`wrote ${file} (${size}x${size}, ${png.length} bytes)`);
}
