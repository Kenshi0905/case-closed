/** Original, non-graphic lying pose. Designed on a 96×48 pixel grid, never a rotated standing sprite. */
export function drawFallenDoctor(ctx: CanvasRenderingContext2D, x = 0, y = 0, scale = 1): void {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
  const box = (color: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const shape = (color: string, points: number[][]) => { ctx.fillStyle = color; ctx.beginPath(); points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill(); };
  const ink = '#13232c';
  // Grounding shadow, separated bent knees, and feet rest on the same floor plane.
  box('#0b202647', 8, 34, 78, 7); box('#0b20267a', 17, 30, 72, 8);
  shape(ink, [[50,17],[61,13],[74,17],[86,13],[94,16],[93,22],[83,24],[69,23],[56,27]]);
  shape('#344656', [[54,19],[61,16],[72,19],[85,16],[88,20],[71,21],[59,24]]);
  box('#6b7781', 61, 16, 10, 2); box('#1d2c3b', 83, 17, 10, 5); box('#82908f', 85, 17, 7, 1);
  shape(ink, [[50,26],[60,25],[70,33],[83,31],[92,35],[91,41],[79,41],[66,40],[54,33]]);
  shape('#263b4c', [[53,28],[59,28],[69,36],[82,34],[85,38],[69,38],[57,32]]);
  box('#566a77', 60, 30, 6, 2); box('#111d2b', 83, 35, 10, 6); box('#65797f', 86, 35, 6, 1);
  // One arm bent above the shoulder, one lying alongside the body.
  shape(ink, [[23,17],[30,8],[39,7],[47,12],[43,18],[36,14],[31,19]]);
  shape('#c8d3c4', [[26,16],[31,11],[37,10],[42,13],[40,16],[35,13],[30,19]]);
  box('#f4ead1', 30, 11, 6, 2); box('#c39672', 41, 12, 8, 5); box('#edc195', 43, 12, 5, 2);
  // Open coat has lapels, folds, a teal shirt, and a visible badge.
  shape(ink, [[22,17],[31,14],[45,14],[57,18],[64,24],[61,33],[48,35],[34,31],[25,28]]);
  shape('#d2d9c9', [[25,18],[33,16],[44,16],[54,19],[61,25],[58,31],[48,32],[35,29],[26,26]]);
  shape('#f4edda', [[26,18],[34,16],[46,18],[42,23],[30,24],[26,22]]);
  shape('#8fa99f', [[43,25],[55,21],[61,26],[58,31],[48,32],[34,28]]);
  shape('#285363', [[28,19],[36,18],[50,23],[52,28],[43,29],[33,25]]);
  box('#51818a', 31, 19, 8, 2); shape('#ede8d2', [[31,17],[42,19],[36,23],[30,21]]);
  shape('#b8c8b8', [[36,26],[44,23],[53,29],[45,31]]);
  box('#203b43', 39, 17, 5, 4); box('#d9bb69', 40, 17, 3, 3);
  shape(ink, [[25,23],[32,27],[35,34],[45,34],[47,39],[33,41],[27,33],[22,29]]);
  shape('#e0e1ca', [[25,25],[30,28],[33,36],[41,36],[41,39],[34,38],[29,32],[24,28]]);
  box('#91ab9f', 30, 31, 3, 5); box('#c49370', 41, 35, 8, 5); box('#f0c499', 42, 35, 6, 2);
  // Silver hair, glasses, moustache and closed eyes retain Dr. Sen's identity.
  shape(ink, [[8,16],[14,11],[23,13],[27,18],[25,27],[20,31],[10,28],[6,22]]);
  shape('#c7a07d', [[13,15],[21,15],[24,19],[22,27],[18,29],[11,26],[9,21]]);
  box('#efcaa0', 11, 18, 6, 5); box('#a7755d', 21, 20, 3, 6);
  shape('#8eaaa5', [[7,17],[11,12],[18,10],[23,13],[23,16],[15,16],[11,21],[8,25],[5,21]]);
  box('#edf0d9', 12, 12, 7, 3); box('#c8d5c9', 8, 16, 5, 3); box('#6b8389', 7, 20, 3, 5);
  box('#203642', 13, 20, 10, 2); box('#243642', 12, 21, 4, 3); box('#243642', 19, 22, 4, 3);
  box('#819b98', 13, 21, 2, 1); box('#819b98', 20, 23, 2, 1); box('#657b7b', 16, 26, 6, 2);
  ctx.restore();
}
