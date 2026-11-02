// Converts a textured OBJ scan to a GLB with the texture embedded.
//   node scripts/obj2glb.mjs <in.obj> <texture.jpg> <out.glb> [maxTriangles] [maxTextureSize]
import fs from 'node:fs';
import { openPage } from './lib/browser.mjs';

const [objPath, texPath, outPath, maxTris = 'Infinity', maxTexture = '4096'] = process.argv.slice(2);
if (!outPath) {
  console.log('Usage: node scripts/obj2glb.mjs <in.obj> <texture.jpg> <out.glb> [maxTriangles] [maxTextureSize]');
  process.exit(1);
}

const { page, close } = await openPage('?batch');
try {
  const objText = fs.readFileSync(objPath, 'utf8');
  const texture = `data:image/jpeg;base64,${fs.readFileSync(texPath).toString('base64')}`;
  const result = await page.evaluate(async ([obj, tex, opts]) => {
    const { objToGlb } = await import('/scripts/lib/convert-browser.js');
    return objToGlb(obj, tex, opts);
  }, [objText, texture, { maxTris: Number(maxTris), maxTexture: Number(maxTexture) }]);
  fs.writeFileSync(outPath, Buffer.from(result.base64, 'base64'));
  console.log(`${outPath}: ${result.tris.toLocaleString()} triangles, ${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB`);
} finally {
  await close();
}
