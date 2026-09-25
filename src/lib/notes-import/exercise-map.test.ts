import { describe, expect, it } from "vitest";
import { isBodyweightHeader, isCardio, resolveExercise } from "@/lib/notes-import/exercise-map";

function resolve(header: string, maxWeightKg: number, opts: { details?: string[]; date?: string; perSide?: boolean } = {}) {
  return resolveExercise({
    header,
    details: opts.details ?? [],
    maxWeightKg,
    performedOn: opts.date ?? "2025-03-01",
    perSideNoted: opts.perSide ?? false,
  });
}

describe("resolveExercise", () => {
  it.each([
    // [header, max kg, expected name]
    ["Ab crunches", 85, "Ab crunches machine"],
    ["Abdominal crunch", 82.5, "Ab crunches machine"],
    ["Ab crunches front", 17.5, "Ab crunches freeweight"],
    ["Ab crunch tower", 38, "Ab crunches freeweight"],
    ["Assisted pull ups for", 22.5, "Assisted pull ups"],
    ["Bayesian curls tower front", 11.25, "Bayesian Curls"],
    ["Leg curls für hammies", 75, "Seated leg curls"],
    ["Legcurls", 70, "Seated leg curls"],
    ["Bizepscurls", 45, "Bicep curls machine"],
    ["Bicep curls", 25, "Bicep curls tower"],
    ["Bicep curl tower", 28.75, "Bicep curls tower"],
    ["Bicep curl hinten", 37.5, "Bicep curls free machine with free weights"],
    ["Curls machine", 47.5, "Bicep curls machine"],
    ["Hyperextensions", 20, "Hyperextensions"],
    ["Lex Extension", 72.5, "Leg extension"],
    ["Standing leg press / hack squats", 150, "Hack squat"],
    ["Hackssquads", 120, "Hack squat"],
    ["Seated leg press", 140, "Seated leg press"],
    ["Trap bar deadlifts", 120, "Trap bar deadlift"],
    ["Deadlifts", 140, "Deadlift"],
    ["Squats", 80, "Squat"],
    ["Trip overhead", 21.88, "Tri overhead pull"],
    ["Tri press down", 85, "Tri press machine"],
    ["Tri pulldown long rope", 26.25, "Tri pushdown rope"],
    ["Tri pushdown straight metal", 29.38, "Tri pushdown tower"],
    ["Incline smith bench", 60, "Incline smith press"],
    ["Smith sheoulder press", 40, "Smith shoulder press"],
    ["Super inline presss", 22.5, "Super incline press"],
    ["Chest press", 62.5, "Chest press machine"],
    ["Bench press machine", 60, "Chest press machine"],
    ["Machine incline press", 25, "Incline bench machine"],
    ["Incline machine", 60, "Incline bench machine"],
    ["DB incline press", 22, "Incline bench press"],
    ["Incline bench", 26, "Incline bench press"],
    ["Incline bench", 65, "Incline bench press barbell"],
    ["Incline bench press", 60, "Incline bench press barbell"],
    ["Bench incline BB", 65, "Incline bench press barbell"],
    ["Bench press", 75, "Bench Press"],
    ["Lateral bench press machine", 25, "Incline bench machine"],
    ["Chest press lateral", 60, "Chest press machine"],
    ["T bar row", 50, "T-bar row"],
    ["Row high to low machine", 50, "Row machine high to low"],
    ["Row tower lat focus single", 42.5, "Single Lat row tower"],
    ["Lateral row tower", 42.5, "Single Lat row tower"],
    ["Row lateral machine", 85, "Row machine free weight"],
    ["Row front", 47.5, "Row machine free weight"],
    ["Row machine", 87.5, "Row machine"],
    ["Seated row grip", 80, "Row machine"],
    ["Row wide plastic grip", 80, "Row tower"],
    ["Lat pulldown machine front", 45, "Lat pulldown machine"],
    ["Pulldown high to low", 50, "Lat pulldown machine"],
    ["Tower pull-down single grip", 40, "Lat Pulldown"],
    ["Pulldown lateral", 80, "Lat Pulldown"],
    ["Tower pull-down metal", 40, "Lat Pulldown"],
    ["Lat pulldown mid wide grip", 80, "Lat Pulldown"],
    ["Lat raise machine", 45, "Lateral raise"],
    ["Lateral machine", 42.5, "Lateral raise"],
    ["Lateral raise", 6.85, "Single Lateral raise tower"],
    ["Cross body lateral raise", 6.25, "Single Lateral raise tower"],
    ["Shoulder press machine", 45, "Shoulder press machine"],
    ["DB SHoulder press", 22, "DB shoulder press"],
    ["Butterfy", 80, "Butterfly"],
    ["Butterfly high to low", 13.75, "Cable Fly"],
    ["Tower flys high to low", 11.88, "Cable Fly"],
    ["Leg raises ball", 0, "Leg raises"],
  ])("%s at %s kg → %s", (header, kg, name) => {
    expect(resolve(header, kg)?.name).toBe(name);
  });

  it("routes plate-loaded rows by the per-side note", () => {
    expect(resolve("Row machine", 40, { perSide: true })?.name).toBe("Row machine free weight");
    expect(resolve("Lat pulldown lateral", 45, { perSide: true })?.name).toBe("Lat pulldown machine");
  });

  it("sends uni/single/lateral tower pulldowns to Lat Pulldown lateral even with a per-side note", () => {
    expect(resolve("Tower lat pulldown uni lateral grips", 40, { perSide: true })).toMatchObject({
      name: "Lat Pulldown",
      attributes: { grip: "lateral" },
    });
  });

  it("sends tricep-range 'lat pulldowns' to the pushdown", () => {
    expect(resolve("Lat pulldown short rope", 28.25)).toMatchObject({ name: "Tri pushdown rope" });
    expect(resolve("Lat pulldown triangle", 31.25)).toMatchObject({
      name: "Tri pushdown tower",
      attributes: { grip: "triangle" },
    });
  });

  it("gives the 2026 pulldown machine its own exercise, split by weight", () => {
    expect(resolve("Lat pulldown tower", 87, { date: "2026-07-31" })?.name).toBe("Lat pulldown tower");
    expect(resolve("Lat pulldown wide lat focus", 38.5, { date: "2026-06-12" })?.name).toBe(
      "Lat Pulldown (neue Maschine)"
    );
    expect(resolve("Lat pulldown tower", 90, { date: "2025-11-04" })?.name).toBe("Lat Pulldown");
  });

  it("maps grips to attributes", () => {
    expect(resolve("Lat pulldown tower close grip", 90)?.attributes).toEqual({ grip: "narrow" });
    expect(resolve("Pulldown tower wide", 80)?.attributes).toEqual({ grip: "wide" });
    expect(resolve("Tri pushdown triangle metal", 32.5)?.attributes).toEqual({ grip: "triangle" });
    expect(resolve("Tri pushdown bent metal", 32.5)?.attributes).toEqual({ grip: "bent" });
  });

  it("marks single-arm incline presses", () => {
    expect(resolve("Incline lateral bench press machine", 50)).toMatchObject({
      name: "Incline bench machine",
      attributes: { arm: "single" },
    });
    expect(resolve("Lateral bench press machine", 25)).toMatchObject({
      name: "Incline bench machine",
      attributes: { arm: "single" },
    });
  });

  it("falls back to the detail lines when the header alone says nothing", () => {
    expect(resolve("Lateral back", 80, { details: ["Pulldown"] })).toMatchObject({
      name: "Lat Pulldown",
      attributes: { grip: "lateral" },
    });
  });

  it("returns null for text it does not know", () => {
    expect(resolve("Mit Zoffi", 0)).toBeNull();
  });
});

describe("isBodyweightHeader / isCardio", () => {
  it("knows leg raises", () => {
    expect(isBodyweightHeader("Leg raises ball")).toBe(true);
    expect(isBodyweightHeader("Ball leg pull-ups (idk)")).toBe(true);
    expect(isBodyweightHeader("Leg extension")).toBe(false);
  });

  it("knows the treadmill", () => {
    expect(isCardio("Laufband 25min")).toBe(true);
    expect(isCardio("25min laufband")).toBe(true);
    expect(isCardio("Butterfly")).toBe(false);
  });
});
