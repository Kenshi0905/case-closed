import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/components/OpeningWorld.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('OpeningWorld.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = file.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && ['renderWorld', 'drawIncident'].includes(node.name?.text)) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ['clamp', 'ease', 'color', 'FLOOR_COLORS'].includes(declaration.name.getText(file))))
).map(node => node.getText(file)).join('\n');
const code = source.split('type Props =')[0].replace(/^import .*;\r?\n/gm, '') + '\n' + helpers + '\nexport {renderWorld};';
const javascript = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { renderWorld, openingShot } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));

test('steady rendering reuses large buffers and draws visible sprites in spans', () => {
  const OriginalImage = globalThis.HTMLImageElement;
  globalThis.HTMLImageElement = class {};
  let allocations = 0, gradients = 0, draws = 0;
  const ctx = { createImageData(w, h) { allocations++; return { data: new Uint8ClampedArray(w * h * 4) }; }, createRadialGradient() { gradients++; return { addColorStop() {} }; }, putImageData() {}, drawImage() { draws++; }, fillRect() {} };
  const textures = Object.fromEntries(['bench', 'doctor', 'fallen', 'watch', 'plant', 'workstation', 'flask', 'terminal', 'sign', 'alarm'].map(name => [name, { width: 64, height: 64 }]));
  const art = { textures, wallPixels: Array.from({ length: 4 }, () => new Uint8ClampedArray(64 * 64 * 4).fill(128)) }, buffers = {};
  const shot = openingShot(1), pose = { ...shot.position, angle: -Math.PI / 2, pitch: shot.pitch, focus: shot.focus };
  try {
    for (let frame = 0; frame < 5; frame++) renderWorld(ctx, 256, 400, pose, art, 1, frame * 34, true, false, buffers, null, false);
    assert.equal(allocations, 1, 'pixel memory must survive successive frames');
    assert.equal(gradients, 1, 'vignette is viewport-cached');
    assert(draws > 0 && draws < 80, 'sprite calls must be spans, not hundreds of per-column calls');
    const oldDepth = buffers.depth;
    renderWorld(ctx, 256, 400, pose, art, 1, 200, false, false, buffers, null, false);
    assert.equal(buffers.depth, oldDepth);
    renderWorld(ctx, 320, 200, pose, art, 1, 240, false, false, buffers, null, false);
    assert.equal(allocations, 2); assert.equal(gradients, 2);
  } finally { if (OriginalImage === undefined) delete globalThis.HTMLImageElement; else globalThis.HTMLImageElement = OriginalImage; }
});
