// Leistungsbudget (RM-FR-PERF-03): Simulation des Referenz-Bahnhofs ohne Grafik messen.
// npm run perf -- --hours 6 --seed 1 [--json]
import { createServer } from 'vite';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { runPerf, formatPerf } = await server.ssrLoadModule('/src/dev/perf.ts');
  const r = runPerf(Number(opt('hours', '6')), Number(opt('seed', '1')));
  console.log(args.includes('--json') ? JSON.stringify(r, null, 1) : formatPerf(r));
  if (!r.ok) process.exitCode = 1;
} finally {
  await server.close();
}
