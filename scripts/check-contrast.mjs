// WCAG contrast check for Scrub Teal text tokens. Run: node scripts/check-contrast.mjs
const L = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) =>
    parseInt(hex.slice(i, i + 2), 16) / 255,
  ).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const surfaces = { surface: '#f7f9f9', card: '#ffffff', sunken: '#eef2f2', soft: '#e4efee' };
const text = { ink: '#1e2a2e', 'ink-muted': '#5b6b70', 'accent-fg': '#2a6763' };
let fail = 0;
for (const [tn, tv] of Object.entries(text))
  for (const [sn, sv] of Object.entries(surfaces)) {
    const r = ratio(tv, sv);
    const ok = r >= 4.5;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${tn} on ${sn}: ${r.toFixed(2)}:1`);
  }
console.log(`white on accent: ${ratio('#ffffff', '#337b77').toFixed(2)}:1 (button text, need >=4.5)`);
if (ratio('#ffffff', '#337b77') < 4.5) fail++;
process.exit(fail ? 1 : 0);
