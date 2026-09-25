/**
 * Raw exercise text from the log → one canonical exercise.
 *
 * Rules run top to bottom; the first match wins, so ORDER MATTERS (e.g. "leg
 * curl" before "curl", rows before flys because of "Row tower metal butterfly",
 * triceps before pulldowns because of "Tri pull down"). Names that already
 * exist in the account are reused verbatim — `exercises` is unique on
 * (user_id, name), case-sensitive.
 */

export type ExerciseContext = {
  header: string;
  details: string[];
  /** Heaviest set as written, before any per-side halving. */
  maxWeightKg: number;
  performedOn: string;
  perSideNoted: boolean;
};

export type Resolved = {
  name: string;
  attributes: Record<string, string>;
  /**
   * Per-side machine: a session written WITHOUT "each side" whose heaviest set
   * reaches this weight was written as a total and gets halved. null = not a
   * per-side machine.
   */
  halveAbove: number | null;
};

/** From here on the pulldown and row towers are a different machine (77/87 kg stack). */
const NEW_TOWER_FROM = "2026-06-01";

export function isBodyweightHeader(header: string): boolean {
  return /leg raises|ball leg/i.test(header);
}

export function isCardio(line: string): boolean {
  return /laufband/i.test(line);
}

function plain(name: string, attributes: Record<string, string> = {}): Resolved {
  return { name, attributes, halveAbove: null };
}

function perSide(name: string, halveAbove: number, attributes: Record<string, string> = {}): Resolved {
  return { name, attributes, halveAbove };
}

function gripOf(t: string): Record<string, string> {
  if (/triangle/.test(t)) return { grip: "neutral" };
  if (/close/.test(t)) return { grip: "narrow" };
  if (/wide/.test(t)) return { grip: "wide" };
  return {};
}

function tricepGripOf(t: string): Record<string, string> {
  if (/triangle/.test(t)) return { grip: "triangle" };
  if (/bent/.test(t)) return { grip: "bent" };
  if (/straight/.test(t)) return { grip: "straight" };
  return {};
}

function triceps(t: string, w: number): Resolved {
  if (w >= 80) return plain("Tri press machine");
  if (/overhead/.test(t)) return plain("Tri overhead pull");
  if (/rope|robe/.test(t)) return plain("Tri pushdown rope");
  return plain("Tri pushdown tower", tricepGripOf(t));
}

function match(t: string, ctx: ExerciseContext): Resolved | null {
  const w = ctx.maxWeightKg;
  const newTower = ctx.performedOn >= NEW_TOWER_FROM;

  if (/leg raises|ball leg/.test(t)) return plain("Leg raises", /ball/.test(t) ? { variant: "ball" } : {});
  if (/crunch/.test(t)) return plain(w >= 80 ? "Ab crunches machine" : "Ab crunches freeweight");
  if (/assisted pull/.test(t)) return plain("Assisted pull ups");
  if (/bayesian/.test(t)) return plain("Bayesian Curls");
  if (/leg ?curl|legcurl/.test(t)) return plain("Seated leg curls");
  if (/curl/.test(t)) {
    if (/tower/.test(t)) return plain("Bicep curls tower");
    if (w >= 45) return plain("Bicep curls machine");
    if (w >= 18 && w <= 25) return plain("Bicep curls tower");
    return plain("Bicep curls free weight");
  }
  if (/hyperextension/.test(t)) return plain("Hyperextensions");
  if (/extension/.test(t)) return plain("Leg extension");
  if (/hack\s?s+qua[dt]/.test(t)) return plain("Hack squat");
  if (/leg press/.test(t)) return plain("Seated leg press");
  if (/trap bar/.test(t)) return plain("Trap bar deadlift");
  if (/deadlift/.test(t)) return plain("Deadlift");
  if (/squat/.test(t)) return plain("Squat");
  if (/^tri|tricep/.test(t)) return triceps(t, w);

  if (/smith/.test(t)) return plain(/bench|incline/.test(t) ? "Incline smith press" : "Smith shoulder press");
  if (/super/.test(t)) return perSide("Super incline press", 40);
  if ((/chest press|bench press machine/.test(t)) && !/lateral/.test(t)) return plain("Chest press machine");
  if (
    /lateral bench press/.test(t) ||
    (/incline|bench/.test(t) && /machine/.test(t)) ||
    (/incline press/.test(t) && !/db/.test(t))
  ) {
    return perSide("Incline bench machine", 40, /lateral/.test(t) ? { arm: "single" } : {});
  }
  if (/incline/.test(t)) {
    if (/db/.test(t)) return plain("Incline bench press");
    if (/bb|barbell/.test(t)) return plain("Incline bench press barbell");
    return plain(w <= 30 ? "Incline bench press" : "Incline bench press barbell");
  }
  if (/bench press/.test(t)) return plain("Bench Press");

  if (/\brow\b/.test(t)) {
    if (/t bar/.test(t)) return plain("T-bar row");
    if (/high to low/.test(t)) return perSide("Row machine high to low", 60);
    if (/single/.test(t) || (/lateral/.test(t) && /tower/.test(t))) return plain("Single Lat row tower");
    if (/lateral|unilateral|free weight|front/.test(t) || ctx.perSideNoted) {
      return perSide("Row machine free weight", 60);
    }
    if (/tower|close|wide|metal|plastic/.test(t)) {
      return plain(newTower ? "Row tower (neue Maschine)" : "Row tower", gripOf(t));
    }
    return plain("Row machine");
  }

  if (/pull ?-?down|pulldown|lap pull/.test(t)) {
    // Tricep-stack weights: these were pushdowns written down as pulldowns.
    if (w < 35) return /rope/.test(t) ? plain("Tri pushdown rope") : plain("Tri pushdown tower", tricepGripOf(t));
    if (/machine|front|high to low/.test(t) || ctx.perSideNoted) return perSide("Lat pulldown machine", 60);
    if (newTower) return plain("Lat Pulldown (neue Maschine)", gripOf(t));
    // "lateral" means single-arm (owner, 2026-09-24).
    if (/single|uni|lateral/.test(t) || w <= 45) return plain("Single Lat pulldown tower");
    return plain("Lat Pulldown", gripOf(t));
  }

  if (/raise|lateral machine/.test(t)) {
    return plain(w < 20 || /cross|single/.test(t) ? "Single Lateral raise tower" : "Lateral raise");
  }
  if (/should/.test(t)) return plain(/machine/.test(t) ? "Shoulder press machine" : "DB shoulder press");
  if (/butterf?l?y/.test(t) && !/high to low/.test(t)) return plain("Butterfly");
  if (/fly|flys|butterfly/.test(t)) return plain("Cable Fly");
  return null;
}

/** The header decides; detail lines are consulted only when it says nothing ("Lateral back" + "Pulldown"). */
export function resolveExercise(ctx: ExerciseContext): Resolved | null {
  const header = ctx.header.toLowerCase();
  return match(header, ctx) ?? match(`${header} ${ctx.details.join(" ").toLowerCase()}`, ctx);
}
