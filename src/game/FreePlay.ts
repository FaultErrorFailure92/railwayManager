/**
 * Freies Spiel (RM-FR-MODE-01, RM-FR-MODE-05): ohne Auftragskette, alle Werkzeuge der Kampagne frei,
 * langfristige Ziele mit Belohnung. Der Verkehr wächst mit der Bahnhofsstufe (höchstens so viele Verträge).
 */
import type { Game } from './Game';
import { applyOpOverrides, type OperatorId, type OpOverride } from '../sim/Operators';
import { MISSIONS, TUTORIAL_MISSIONS } from './Missions';
import { buildDemo } from '../dev/demo';
import { seedDaily, startChallenge } from './Challenges';
import { CHAPTER_MISSIONS } from './Chapters';
import { addBonus, takeBonus } from './Profiles';
import { RESEARCH } from './Research';
import { TIERS } from './StationTiers';

export type GameMode = 'campaign' | 'free' | 'challenge';

/** Einstellungen des freien Spiels (RM-FR-MODE-06) */
export interface FreeCfg {
  map: string;
  /** Sandbox: kein Geld, keine Pleite, Forschung sofort (RM-FR-MODE-07) */
  sandbox?: boolean;
  /** Startkapital in € */
  money: number;
  /** Fahrgastaufkommen in % */
  pax: number;
  /** Häufigkeit von Störungen in % */
  faults: number;
  /** Anteil der Züge mit Verspätung von außen in % */
  ext: number;
  /** Verträge wachsen mit der Bahnhofsstufe oder sind sofort alle möglich */
  growth: 'tier' | 'instant';
  /** Pleite-Grenze (Schulden in €) */
  debt: number;
  /** Unternehmen, die nicht mitspielen (RM-FR-MOD-02) */
  off?: OperatorId[];
  /** Fremdbahnen ausgeschaltet: keine fremden Strecken, kein Forschungsbaum „Anschlussfragen“ (RM-FR-CPX-07) */
  noForeign?: boolean;
  /** eigene Unternehmen auf dem Platz mitgelieferter (RM-FR-MOD-01) */
  custom?: Partial<Record<OperatorId, OpOverride>>;
}

export const freeDefaults = (map: string, startMoney: number): FreeCfg => ({ map, money: startMoney, pax: 100, faults: 100, ext: 8, growth: 'tier', debt: 50000 });

/** Regler der Konfigseite */
export const FREE_SLIDERS: { key: 'money' | 'pax' | 'faults' | 'ext' | 'debt'; label: string; min: number; max: number; step: number; fmt: (v: number) => string; hint: string }[] = [
  { key: 'money', label: 'Startkapital', min: 2000, max: 50000, step: 1000, fmt: (v) => `${v.toLocaleString('de-AT')} €`, hint: 'Geld zum Start' },
  { key: 'pax', label: 'Fahrgastaufkommen', min: 50, max: 200, step: 10, fmt: (v) => `${v} %`, hint: 'mehr Fahrgäste = mehr Einnahmen, vollere Bahnsteige' },
  { key: 'faults', label: 'Störungen', min: 0, max: 200, step: 25, fmt: (v) => (v ? `${v} %` : 'keine'), hint: 'Ausfälle von Weichen/Signalen und Großstörungen' },
  { key: 'ext', label: 'Verspätungen von außen', min: 0, max: 30, step: 2, fmt: (v) => (v ? `${v} % der Züge` : 'keine'), hint: 'Züge, die schon zu spät ankommen' },
  { key: 'debt', label: 'Pleite-Grenze', min: 10000, max: 200000, step: 10000, fmt: (v) => `−${v.toLocaleString('de-AT')} €`, hint: 'ab diesen Schulden ist Schluss' },
];

/** Einstellungen auf das laufende Spiel anwenden (beim Start und nach dem Laden) */
export function applyFreeCfg(g: Game) {
  if (g.freeCfg) g.sim.extDelayChance = g.freeCfg.ext / 100;
  applyOpOverrides(g.freeCfg?.custom);
}

/** spielt das Unternehmen mit? (RM-FR-MOD-02) */
export const opAllowed = (g: Game, id: OperatorId) => !g.freeCfg?.off?.includes(id);

export const paxCfg = (g: Game) => (g.freeCfg ? g.freeCfg.pax / 100 : 1);
export const faultCfg = (g: Game) => (g.freeCfg ? g.freeCfg.faults / 100 : 1);

/** höchstens so viele Verträge je Bahnhofsstufe (Haltepunkt … Hauptbahnhof) */
export const FREE_CONTRACT_CAP = [3, 5, 7, Infinity];
/** Verkehrsstufe der Simulation je Bahnhofsstufe */
const FREE_LEVEL = [4, 5, 6, 8];

export interface LongGoal {
  id: string;
  label: string;
  reward: number;
  fp: number;
  /** Fortschritt 0..1 und kurzer Text */
  check: (g: Game) => { value: number; text: string };
}

const eur = (n: number) => Math.round(n).toLocaleString('de-AT');
const part = (n: number, of: number, unit = '') => ({ value: Math.min(1, n / of), text: `${eur(Math.min(n, of))}/${eur(of)}${unit}` });

export const LONG_GOALS: LongGoal[] = [
  { id: 'day100', label: '100 Züge an einem Tag, 90 % pünktlich', reward: 15000, fp: 5,
    check: (g) => {
      const best = Math.max(0, ...g.history.filter((d) => d.handled && d.punctual / d.handled >= 0.9).map((d) => d.handled), g.today().handled);
      return part(best, 100, ' Züge');
    } },
  { id: 'stars5', label: '5 Sterne Bewertung', reward: 10000, fp: 4, check: (g) => part(g.rating.stars, 5, ' ★') },
  { id: 'hbf', label: 'Hauptbahnhof werden', reward: 20000, fp: 6, check: (g) => part(g.tier, TIERS.length - 1, ` · ${TIERS[g.tier].name}`) },
  { id: 'research', label: 'Alles erforschen', reward: 15000, fp: 0, check: (g) => part(g.research.done.length, RESEARCH.length) },
  { id: 'contracts', label: '8 Verträge gleichzeitig', reward: 8000, fp: 3, check: (g) => part(g.activeOperators().filter((o) => g.contracts[o.id].status === 'active').length, 8) },
  { id: 'conn', label: '500 Anschlüsse erreicht', reward: 8000, fp: 3, check: (g) => part(g.stats.connOk ?? 0, 500) },
  { id: 'million', label: '1 Million € auf dem Konto', reward: 0, fp: 5, check: (g) => part(Math.max(0, g.money), 1e6, ' €') },
  // ---- Großprojekte (RM-FR-END-01)
  { id: 'yard', label: 'Großprojekt Rangierbahnhof: 300 Wagen sortiert', reward: 25000, fp: 6, check: (g) => part(g.stats.sortedWagons, 300, ' Wagen') },
  { id: 'hsr', label: 'Großprojekt Schnellfahrstrecke: 4 Schnellfahrweichen, 150 Fernzug-Halte', reward: 30000, fp: 6,
    check: (g) => {
      const fast = [...g.grid.pieces.values()].filter((p) => !g.grid.fixedPieces.has(p.id) && p.key.endsWith('_fast')).length;
      const v = Math.min(1, fast / 4) * 0.5 + Math.min(1, g.stats.stopsIC / 150) * 0.5;
      return { value: v >= 1 ? 1 : v, text: `${Math.min(fast, 4)}/4 · ${Math.min(g.stats.stopsIC, 150)}/150` };
    } },
  { id: 'net', label: 'Großprojekt Netz: 3 Bahnhöfe, 12 Bahnsteiggleise', reward: 30000, fp: 6,
    check: (g) => {
      const v = Math.min(1, g.stations().length / 3) * 0.5 + Math.min(1, g.platformRuns().length / 12) * 0.5;
      return { value: v >= 1 ? 1 : v, text: `${Math.min(g.stations().length, 3)}/3 · ${Math.min(g.platformRuns().length, 12)}/12` };
    } },
];

/** Neustart-Bonus fürs nächste freie Spiel: je erreichtem Langzeitziel 1 000 € (RM-FR-END-01) */
export const RESTART_BONUS_PER_GOAL = 1000;
export const restartBonus = (goals: number) => goals * RESTART_BONUS_PER_GOAL;

/** Auftragskette überspringen: alles freischalten, was die Aufträge freischalten würden */
export function enterFreePlay(g: Game) {
  for (let i = g.missionIdx; i < MISSIONS.length; i++) {
    MISSIONS[i].unlock.forEach((u) => g.unlocked.add(u));
    if (i < TUTORIAL_MISSIONS) g.research.points += MISSIONS[i].fp;
  }
  g.unlocked.add('research');
  g.missionIdx = MISSIONS.length;
  g.missionMark = undefined;
  freeTick(g);
}

/** Anzahl Verträge, ab der keine neuen Anfragen mehr kommen */
export function contractCap(g: Game) {
  if (g.mode !== 'free' || g.freeCfg?.growth === 'instant') return Infinity;
  return FREE_CONTRACT_CAP[g.tier] ?? Infinity;
}

/** stündlich ohne Auftrag (freies Spiel oder Kampagne geschafft): Langzeitziele prüfen; im freien Spiel Verkehrsstufe nachziehen */
export function freeTick(g: Game) {
  if (g.mission || !g.stations().length) return;
  if (g.mode === 'free') {
    const lvl = g.freeCfg?.growth === 'instant' ? 8 : FREE_LEVEL[g.tier] ?? 8;
    if (g.sim.level !== lvl) g.sim.setLevel(lvl);
  }
  for (const goal of LONG_GOALS) {
    if (g.longGoals.includes(goal.id) || goal.check(g).value < 1) continue;
    g.longGoals.push(goal.id);
    if (g.profileId) addBonus(g.profileId, RESTART_BONUS_PER_GOAL);
    g.book('Prämien', goal.reward);
    g.research.points += goal.fp;
    g.addLog(`Langzeitziel erreicht: ${goal.label}${goal.reward ? ` · +${eur(goal.reward)} €` : ''}${goal.fp ? ` · +${goal.fp} FP` : ''}`, 'good');
    g.uiEvents.push({ type: 'letter', mood: 'good', open: true, bonus: goal.reward || undefined, title: `Ziel erreicht: ${goal.label}`,
      text: `<p>${g.salutation()}</p><p>der Vorstand gratuliert: <b>${goal.label}</b> – geschafft! ${goal.reward ? `Als Dank gibt es eine Prämie von ${eur(goal.reward)} €` : 'Der Kontostand spricht für sich'}${goal.fp ? ` und ${goal.fp} Forschungspunkte` : ''}.</p>`
        + `<p>${g.longGoals.length < LONG_GOALS.length ? `Noch ${LONG_GOALS.length - g.longGoals.length} Ziele offen. Weiter so!` : 'Damit haben Sie alles erreicht, was wir uns je erträumt haben. Chapeau!'}</p>` });
  }
}

/** Anzeige im Auftragsfeld */
export function freeInfo(g: Game) {
  const checks = LONG_GOALS.map((goal) => {
    const done = g.longGoals.includes(goal.id);
    return { done, label: done ? goal.label : `${goal.label} (${goal.check(g).text})` };
  });
  const n = g.longGoals.length;
  return { title: 'Langzeitziele', short: g.mode === 'free' ? 'Freies Spiel' : 'Alle Aufträge erledigt', reward: 0, value: n / LONG_GOALS.length, text: `${n}/${LONG_GOALS.length}`, index: MISSIONS.length, total: MISSIONS.length, checks };
}

// ------------------------------------------------------------ Neues Spiel aus dem Hauptmenü
export interface NewGameSetup {
  mode: GameMode;
  map: string;
  profileId: string;
  company: string;
  player: Game['player'];
  /** Kampagne: mit Einschulung (Tutorial) */
  tutorial?: boolean;
  /** Herausforderung (RM-FR-MODE-08) */
  challenge?: string;
  cfg?: FreeCfg;
}

/** frisches Spiel nach dem Neuladen einrichten: Profil, Modus, Einstellungen */
export function applySetup(g: Game, s: NewGameSetup) {
  g.profileId = s.profileId;
  g.company = s.company;
  g.player = { ...s.player };
  g.startMission();
  if (s.mode === 'challenge' && s.challenge) {
    if (s.challenge.startsWith('daily-')) seedDaily(s.challenge.slice(6));
    buildDemo(g);
    g.company = s.company;
    g.player = { ...s.player };
    g.missionIdx = MISSIONS.length;
    startChallenge(g, s.challenge);
    g.history = [];
    g.life = { games: 1 };
    g.lifeMax = g.money;
    g.lifeMin = g.money;
    return;
  }
  if (s.mode === 'free') {
    g.freeCfg = s.cfg ?? freeDefaults(s.map, g.money);
    // Neustart-Bonus aus früheren freien Spielen (einmal einlösen)
    const bonus = g.freeCfg.sandbox ? 0 : takeBonus(s.profileId);
    g.money = g.freeCfg.sandbox ? 9_999_999 : g.freeCfg.money + bonus;
    if (bonus) g.addLog(`Neustart-Bonus: +${eur(bonus)} € aus früheren Großprojekten`, 'good');
    applyFreeCfg(g);
    g.sim.paxFactor *= paxCfg(g);
    g.startFreePlay(false);
  } else if (s.map !== 'donau' && CHAPTER_MISSIONS[s.map]) g.startChapter(s.map);
  else if (s.tutorial === false) g.skipTutorial();
  if (!(s.mode === 'campaign' && s.map !== 'donau' && CHAPTER_MISSIONS[s.map])) g.welcome();
  // Profil-Statistik und Finanzen: Startgeld zählt nicht als verdient
  g.history = [];
  g.life = { games: 1 };
  g.lifeMax = g.money;
  g.lifeMin = g.money;
}
