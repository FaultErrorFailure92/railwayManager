// Balancing-Werkzeug (RM-FR-BAL-01): Simulation ohne Grafik.
// npm run balance -- --days 3 --strategy demo,leer --seed 1 [--map donautal] [--json]
import { createServer } from 'vite';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const days = Number(opt('days', '3'));
const strategies = opt('strategy', 'demo').split(',');
const seed = Number(opt('seed', '1'));
const map = opt('map', undefined);
const json = args.includes('--json');

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { runBalance, formatResult, STRATEGIES } = await server.ssrLoadModule('/src/dev/balance.ts');
  if (args.includes('--help')) {
    console.log('Strategien:\n' + Object.entries(STRATEGIES).map(([k, v]) => `  ${k.padEnd(12)} ${v.text}`).join('\n'));
  } else {
    const results = [];
    for (const s of strategies) {
      const r = runBalance(s, days, seed, map);
      results.push(r);
      if (!json) console.log(formatResult(r) + '\n');
    }
    if (json) console.log(JSON.stringify(results, null, 1));
  }
} finally {
  await server.close();
}
