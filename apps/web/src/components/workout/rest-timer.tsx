"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { setRestTimerEnabled } from "@/app/workout/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatRestTime,
  REST_EXTEND_SECONDS,
  REST_TIMER_SECONDS,
  restRemainingSeconds,
} from "@gymtrack/core";

/** How often the bar re-reads the clock; the time itself comes from `endsAt`. */
const TICK_MS = 250;

type RestTimer = {
  enabled: boolean;
  error: string | null;
  setEnabled: (next: boolean) => void;
  /** Starts (or restarts) the countdown; does nothing while the switch is off. */
  start: () => void;
  extend: () => void;
  skip: () => void;
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

  // `start` is called from `SetList.commit`, which must not be rebuilt on
  // every toggle — so it reads the switch from a ref instead of closing over it.
  const enabledRef = useRef(enabled);
  // The last value the server acknowledged. A failed toggle reverts to this, not
  // to the value before the tap: with two toggles in flight the latter is stale.
  const confirmedRef = useRef(initialEnabled);

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

  const start = useCallback(() => {
    if (enabledRef.current) setEndsAt(Date.now() + REST_TIMER_SECONDS * 1000);
  }, []);
  const extend = useCallback(() => {
    setEndsAt((current) => (current === null ? null : current + REST_EXTEND_SECONDS * 1000));
  }, []);
  const skip = useCallback(() => setEndsAt(null), []);

  const value = useMemo(
    () => ({ enabled, error, setEnabled, start, extend, skip, endsAt }),
    [enabled, error, setEnabled, start, extend, skip, endsAt],
  );

  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
}

export function useRestTimer(): RestTimer {
  const timer = useContext(RestTimerContext);
  if (!timer) throw new Error("useRestTimer must be used inside a RestTimerProvider");
  return timer;
}

/** The chip under the date: tap to switch the rest timer on or off for this workout. */
export function RestTimerToggle() {
  const { enabled, error, setEnabled } = useRestTimer();

  return (
    <div className="mb-1">
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "min-h-11 rounded-full px-4 text-sm font-medium",
          enabled ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
        )}
      >
        {enabled ? `⏱ Pause: an · ${formatRestTime(REST_TIMER_SECONDS)}` : "⏱ Pause: aus"}
      </button>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** The countdown, pinned above the tab bar while one runs. */
export function RestTimerBar() {
  const { endsAt } = useRestTimer();
  // Keyed by the end time, so a (re)start or extension mounts with a fresh clock
  // reading instead of flashing the `now` of the previous countdown.
  return endsAt === null ? null : <Countdown key={endsAt} endsAt={endsAt} />;
}

function Countdown({ endsAt }: { endsAt: number }) {
  const { extend, skip } = useRestTimer();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      if (current >= endsAt) {
        navigator.vibrate?.([200, 100, 200]);
        skip();
        return;
      }
      setNow(current);
    };

    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [endsAt, skip]);

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
