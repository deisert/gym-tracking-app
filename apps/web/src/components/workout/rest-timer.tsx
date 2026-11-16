"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { Minus, Plus, Timer } from "lucide-react";

import { setRestTimerEnabled } from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { playDing, unlockDing } from "@/lib/ding";
import { cn } from "@/lib/utils";
import {
  clampRestSeconds,
  formatRestTime,
  parseRestTimerPrefs,
  REST_EXTEND_SECONDS,
  REST_MAX_SECONDS,
  REST_MIN_SECONDS,
  REST_PRESET_SECONDS,
  REST_STEP_SECONDS,
  restRemainingSeconds,
  type RestTimerPrefs,
} from "@gymtrack/core";

/** How often the bar re-reads the clock; the time itself comes from `endsAt`. */
const TICK_MS = 250;

// ---------------------------------------------------------------------------
// Device preferences (duration, sound)
//
// The on/off switch is per workout and lives in the database. Duration and
// sound are about the lifter and their phone, not one session, so they stay in
// localStorage and carry over to every workout on this device.
// ---------------------------------------------------------------------------

const PREFS_KEY = "gymtrack:rest-timer";
const PREFS_EVENT = "gymtrack:rest-timer-prefs";
/** Fallback when localStorage refuses the write. */
let memoryPrefsRaw: string | null = null;

function readPrefsRaw(): string | null {
  try {
    return window.localStorage.getItem(PREFS_KEY);
  } catch {
    // Storage can be blocked (private mode, quota); the defaults still work.
    return null;
  }
}

function writePrefs(prefs: RestTimerPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not persisted — the change still applies until the page is left.
    memoryPrefsRaw = JSON.stringify(prefs);
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

function subscribePrefs(onChange: () => void): () => void {
  window.addEventListener(PREFS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREFS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useRestTimerPrefs(): RestTimerPrefs {
  // The raw string is the snapshot: it is stable between reads, so React only
  // re-renders when the stored value really changed. The server renders the
  // defaults; the stored value takes over right after hydration.
  const raw = useSyncExternalStore(
    subscribePrefs,
    () => readPrefsRaw() ?? memoryPrefsRaw,
    () => null,
  );
  return useMemo(() => parseRestTimerPrefs(raw), [raw]);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type RestTimer = {
  enabled: boolean;
  error: string | null;
  setEnabled: (next: boolean) => void;
  /** Rest length in seconds for the next countdown. */
  seconds: number;
  setSeconds: (next: number) => void;
  /** Whether the end of a countdown dings. */
  sound: boolean;
  setSound: (next: boolean) => void;
  /** Starts (or restarts) the countdown; does nothing while the switch is off. */
  start: () => void;
  extend: () => void;
  skip: () => void;
  /** The countdown ran out: ding (if wanted), vibrate, hide the bar. */
  finish: () => void;
  /** Epoch ms the countdown ends at, null while none runs. */
  endsAt: number | null;
};

const RestTimerContext = createContext<RestTimer | null>(null);

export function RestTimerProvider({
  workoutId,
  initialEnabled,
  children,
}: {
  workoutId: string;
  initialEnabled: boolean;
  children: ReactNode;
}) {
  const [enabled, setEnabledState] = useState(initialEnabled);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const prefs = useRestTimerPrefs();

  // `start` is called from `SetList.commit`, which must not be rebuilt on
  // every toggle — so it reads the switch (and prefs) from refs instead of
  // closing over them.
  const enabledRef = useRef(enabled);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  // The last value the server acknowledged. A failed toggle reverts to this, not
  // to the value before the tap: with two toggles in flight the latter is stale.
  const confirmedRef = useRef(initialEnabled);

  // iOS keeps web audio muted until it is resumed inside a tap, and suspends
  // it again in the background. The ding is fired by a timer, so every tap on
  // the page re-arms it — cheap once the context is already running.
  useEffect(() => {
    if (!enabled || !prefs.sound) return;
    const unlock = () => unlockDing();
    document.addEventListener("pointerup", unlock, true);
    document.addEventListener("touchend", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      document.removeEventListener("pointerup", unlock, true);
      document.removeEventListener("touchend", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    };
  }, [enabled, prefs.sound]);

  const setEnabled = useCallback(
    (next: boolean) => {
      enabledRef.current = next;
      setEnabledState(next);
      setError(null);
      if (!next) setEndsAt(null);

      startTransition(async () => {
        // A network failure makes the action throw rather than return `ok: false`.
        const result = await setRestTimerEnabled(workoutId, next).catch(() => ({
          ok: false as const,
          error: "Speichern fehlgeschlagen.",
        }));
        if (result.ok) {
          confirmedRef.current = next;
        } else {
          enabledRef.current = confirmedRef.current;
          setEnabledState(confirmedRef.current);
          setError(result.error);
        }
      });
    },
    [workoutId],
  );

  const setSeconds = useCallback((next: number) => {
    const seconds = clampRestSeconds(next);
    writePrefs({ ...prefsRef.current, seconds });
    // A countdown already running restarts from the full new length.
    setEndsAt((current) => (current === null ? null : Date.now() + seconds * 1000));
  }, []);
  const setSound = useCallback((next: boolean) => {
    writePrefs({ ...prefsRef.current, sound: next });
  }, []);

  const start = useCallback(() => {
    if (enabledRef.current) setEndsAt(Date.now() + prefsRef.current.seconds * 1000);
  }, []);
  const extend = useCallback(() => {
    setEndsAt((current) => (current === null ? null : current + REST_EXTEND_SECONDS * 1000));
  }, []);
  const skip = useCallback(() => setEndsAt(null), []);
  const finish = useCallback(() => {
    if (prefsRef.current.sound) playDing();
    navigator.vibrate?.([200, 100, 200]);
    setEndsAt(null);
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      error,
      setEnabled,
      seconds: prefs.seconds,
      setSeconds,
      sound: prefs.sound,
      setSound,
      start,
      extend,
      skip,
      finish,
      endsAt,
    }),
    [enabled, error, setEnabled, prefs, setSeconds, setSound, start, extend, skip, finish, endsAt],
  );

  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
}

export function useRestTimer(): RestTimer {
  const timer = useContext(RestTimerContext);
  if (!timer) throw new Error("useRestTimer must be used inside a RestTimerProvider");
  return timer;
}

// ---------------------------------------------------------------------------
// Chip + settings sheet
// ---------------------------------------------------------------------------

/** The chip under the date: shows the current state, tap to open the timer settings. */
export function RestTimerToggle() {
  const { enabled, error, seconds } = useRestTimer();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          // Opening the sheet is a tap — a good moment to arm iOS audio.
          unlockDing();
          setIsOpen(true);
        }}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium tabular-nums",
          enabled
            ? "bg-primary/15 text-primary ring-1 ring-primary/40 ring-inset"
            : "bg-secondary text-muted-foreground",
        )}
      >
        <Timer className="size-4" aria-hidden />
        {enabled ? `Pause ${formatRestTime(seconds)}` : "Pause aus"}
      </button>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}

      <RestTimerSheet open={isOpen} onOpenChange={setIsOpen} />
    </div>
  );
}

function RestTimerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { enabled, setEnabled, seconds, setSeconds, sound, setSound } = useRestTimer();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A bottom sheet (DESIGN_SYSTEM.md §1: no modals mid-logging where a
          sheet works). `sm:max-w-md` overrides DialogContent's `sm:max-w-sm`. */}
      <DialogContent
        className="inset-x-0 top-auto bottom-0 mx-auto w-full max-w-md translate-x-0 translate-y-0 gap-5 rounded-t-2xl rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.35)] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-lg">Pausentimer</DialogTitle>
        </DialogHeader>

        <SwitchRow
          label="Timer an"
          description="Startet nach jedem neuen Satz."
          checked={enabled}
          onChange={setEnabled}
        />

        <fieldset className={cn("flex flex-col gap-3", !enabled && "opacity-50")}>
          <legend className="mb-3 text-sm text-muted-foreground">Dauer</legend>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              className="size-14 rounded-xl"
              aria-label={`${REST_STEP_SECONDS} Sekunden weniger`}
              disabled={seconds <= REST_MIN_SECONDS}
              onClick={() => setSeconds(seconds - REST_STEP_SECONDS)}
            >
              <Minus className="size-6" aria-hidden />
            </Button>
            <output
              aria-live="polite"
              className="text-5xl font-semibold tabular-nums"
              aria-label={`Pause ${formatRestTime(seconds)} Minuten`}
            >
              {formatRestTime(seconds)}
            </output>
            <Button
              type="button"
              variant="secondary"
              className="size-14 rounded-xl"
              aria-label={`${REST_STEP_SECONDS} Sekunden mehr`}
              disabled={seconds >= REST_MAX_SECONDS}
              onClick={() => setSeconds(seconds + REST_STEP_SECONDS)}
            >
              <Plus className="size-6" aria-hidden />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {REST_PRESET_SECONDS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={seconds === preset}
                onClick={() => setSeconds(preset)}
                className={cn(
                  "min-h-11 rounded-full text-sm font-medium tabular-nums",
                  seconds === preset
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {formatRestTime(preset)}
              </button>
            ))}
          </div>
        </fieldset>

        <SwitchRow
          label="Ton am Ende"
          description="Ein kurzes „Ding“, wenn die Pause um ist."
          checked={sound}
          onChange={(next) => {
            setSound(next);
            // Preview on switch-on; the tap also unlocks audio on iOS.
            if (next) playDing();
          }}
        />

        <Button
          type="button"
          size="lg"
          className="min-h-12 w-full text-base"
          onClick={() => onOpenChange(false)}
        >
          Fertig
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 text-left"
    >
      <span className="flex flex-col">
        <span className="text-base font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-6 rounded-full bg-foreground transition-transform",
            checked && "translate-x-5 bg-primary-foreground",
          )}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Countdown bar
// ---------------------------------------------------------------------------

/** The countdown, pinned above the tab bar while one runs. */
export function RestTimerBar() {
  const { endsAt } = useRestTimer();
  // Keyed by the end time, so a (re)start or extension mounts with a fresh clock
  // reading instead of flashing the `now` of the previous countdown.
  return endsAt === null ? null : <Countdown key={endsAt} endsAt={endsAt} />;
}

function Countdown({ endsAt }: { endsAt: number }) {
  const { extend, skip, finish } = useRestTimer();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      if (current >= endsAt) {
        finish();
        return;
      }
      setNow(current);
    };

    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [endsAt, finish]);

  return (
    <>
      {/* Keeps the last row from sitting underneath the fixed bar. */}
      <div className="h-20" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 px-4 pb-2">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-2 shadow-lg">
          <span role="timer" className="text-3xl font-semibold tabular-nums">
            {formatRestTime(restRemainingSeconds(endsAt, now))}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="min-h-12 px-4" onClick={extend}>
              +{REST_EXTEND_SECONDS} s
            </Button>
            <Button type="button" variant="outline" className="min-h-12 px-4" onClick={skip}>
              Skip
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
