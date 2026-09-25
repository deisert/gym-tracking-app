/**
 * Line-numbered corrections for past-sets.md (spec §5.4).
 *
 * Every entry names the exact trimmed text it expects at that line, so an
 * edited log fails loudly instead of silently correcting the wrong line.
 * Replacement lines are parsed like normal lines; `{ header }` forces a new
 * exercise where the log ran two exercises together without a blank line.
 */
export type Override = { line: number; expect: string } & (
  | { replace: (string | { header: string })[] }
  | { note: string }
  | { drop: string }
  | { date: string }
);

const UNKNOWN_REPS = "Wiederholungen unbekannt";

export const OVERRIDES: Override[] = [
  // The first two sessions use "weight x reps x sets" notation.
  { line: 3, expect: "Bizepscurls 45 x 12 x 2 | 42.5x10", replace: [{ header: "Bizepscurls" }, "45/12", "45/12", "42.5/10"] },
  { line: 4, expect: "Legcurls 70x12 x2", replace: [{ header: "Legcurls" }, "70/12", "70/12"] },
  { line: 7, expect: "Incline DB 1x22 2x24 12 /12/10", replace: [{ header: "Incline DB" }, "22/12", "24/12", "24/10"] },
  { line: 8, expect: "Lateral lat pulldown 3x12 35", replace: [{ header: "Lateral lat pulldown" }, "35/12", "35/12", "35/12"] },
  {
    line: 9,
    expect: "Normal machine bicep curls 1x 42.5 x 12 // 1x45 x 9 // 1x45 x 6",
    replace: [{ header: "Normal machine bicep curls" }, "42.5/12", "45/9", "45/6"],
  },
  { line: 153, expect: "40/8-0", replace: ["40/8-10"] },
  { line: 300, expect: "408", replace: ["40/8"] },
  { line: 407, expect: "???", drop: "unklarer Eintrag" },
  { line: 522, expect: "80 (weirde Übersetzung)", drop: UNKNOWN_REPS },
  { line: 581, expect: "7011", replace: ["70/11"] },
  { line: 781, expect: "3 absetzen", note: "3 Wdh. mit Absetzen" },
  { line: 782, expect: "2 ohne", note: "2 Wdh. ohne Absetzen" },
  { line: 986, expect: "10x40 warmup", replace: ["40/10 warmup"] },
  { line: 1070, expect: "5010", replace: ["50/10"] },
  { line: 1680, expect: "21.25/", replace: ["21.25/10"] },
  { line: 1681, expect: "10", drop: "Wiederholungen von Zeile 1680" },
  { line: 1968, expect: "4.2/11/r", replace: ["4.2/11 R"] },
  { line: 2069, expect: "3x5 l r Wechsel", drop: "Gewicht unbekannt" },
  { line: 2103, expect: "17.06", date: "17.07" },
  { line: 2107, expect: "Incline bench press", replace: [{ header: "Incline bench press" }] },
  { line: 2118, expect: "26.25 metal", drop: UNKNOWN_REPS },
  { line: 2162, expect: "28/07", date: "28.07" },
  { line: 2184, expect: "25/7 32.5/7", replace: ["25/7", "32.5/7"] },
  { line: 2678, expect: "80/80", replace: ["80/8"] },
  { line: 2890, expect: "87/5/7_3", replace: ["87.5/7_3"] },
  { line: 3019, expect: "35 dropset 6", replace: ["35/6 dropset"] },
  { line: 3092, expect: "20/10 15/3", replace: ["20/10", "15/3 dropset"] },
  { line: 3093, expect: "20/11 15/4", replace: ["20/11", "15/4 dropset"] },
  { line: 3798, expect: "17/5/9", replace: ["17.5/9"] },
  { line: 3937, expect: "6.25 jeweils", drop: UNKNOWN_REPS },
  { line: 3939, expect: "Assisted pull ups", replace: [{ header: "Assisted pull ups" }] },
  { line: 4089, expect: "3 sets of?", drop: UNKNOWN_REPS },
  { line: 4245, expect: "65/8 lateral L/R", replace: ["65/8 einarmig L+R"] },
  { line: 4296, expect: "28.375/9", replace: ["29.375/9"] },
  { line: 4338, expect: "19.07", date: "19.06" },
  { line: 4373, expect: "80%pp", note: "80%pp" },
];
