"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { todayInAppTimezone } from "@/lib/dates";
import { nextPosition } from "@/lib/sets";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ExerciseOption, SetRecord } from "@/lib/types";
import {
  exerciseNameSchema,
  setInputSchema,
  workoutMetaSchema,
} from "@/lib/validation";

/**
 * `kind` tells the caller whether retrying could ever help.
 *
 * "validation" is permanent — the input itself is wrong, so the client must
 * show the message and stop retrying. "transient" is a network/RLS/db failure
 * that the same input may well survive on a second attempt. Callers that do
 * not care may ignore it; it is optional so existing failure sites stay valid.
 */
export type ActionFailureKind = "validation" | "transient";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind?: ActionFailureKind };

const SAVE_FAILED = "Speichern fehlgeschlagen – wird automatisch wiederholt.";
const NOT_SIGNED_IN = "Nicht angemeldet.";

type RawSet = {
  id: string;
  position: number;
  weight_kg: number | string;
  reps: number;
  is_warmup: boolean;
};

const SET_COLUMNS = "id, position, weight_kg, reps, is_warmup";

function toSetRecord(raw: RawSet): SetRecord {
  return {
    id: raw.id,
    position: raw.position,
    weight_kg: Number(raw.weight_kg),
    reps: raw.reps,
    is_warmup: raw.is_warmup,
  };
}

/**
 * Creates a workout dated by the CLIENT's local date and opens it.
 *
 * The date comes from the browser because Postgres `current_date` is UTC: a
 * 23:30 CEST session would otherwise be filed under the next day.
 */
export async function startWorkout(localDate: string): Promise<never> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = workoutMetaSchema.shape.performed_on.safeParse(localDate);
  const performed_on = parsed.success ? parsed.data : todayInAppTimezone();

  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id: user.id, performed_on })
    .select("id")
    .single();

  if (error || !data) redirect("/?error=start");

  revalidatePath("/");
  redirect(`/workout/${data.id}`);
}

/**
 * Ends the logging session and sends the user back to the overview.
 *
 * A workout has no finished state — CONCEPT.md §2.4 keeps it "a dated
 * container that's always editable", so "beenden" is a navigation step, not a
 * status change: the same workout stays open for edits from the couch.
 *
 * It still goes through a server action rather than a plain link, because the
 * set mutations only revalidate the workout page. Navigating straight to "/"
 * would show yesterday's set counts in the workout list — exactly the numbers
 * the user just finished logging.
 */
export async function endWorkout(): Promise<never> {
  revalidatePath("/");
  redirect("/");
}

export async function updateWorkoutMeta(
  workoutId: string,
  meta: unknown
): Promise<ActionResult<null>> {
  const parsed = workoutMetaSchema.safeParse(meta);
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Angaben – prüfe Datum, Kategorie und Notiz." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("workouts")
    .update({
      performed_on: parsed.data.performed_on,
      category: parsed.data.category || null,
      note: parsed.data.note || null,
    })
    .eq("id", workoutId)
    .select("id");

  if (error || !data || data.length === 0) return { ok: false, error: SAVE_FAILED };

  revalidatePath(`/workout/${workoutId}`);
  revalidatePath("/");
  return { ok: true, data: null };
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string
): Promise<ActionResult<string>> {
  const supabase = await createServerSupabase();

  const { data: existing } = await supabase
    .from("workout_exercises")
    .select("position")
    .eq("workout_id", workoutId);

  const { data, error } = await supabase
    .from("workout_exercises")
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      position: nextPosition(existing ?? []),
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Übung konnte nicht hinzugefügt werden." };

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: data.id };
}

export async function removeWorkoutExercise(
  workoutId: string,
  workoutExerciseId: string
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("workout_exercises")
    .delete()
    .eq("id", workoutExerciseId)
    .select("id");

  if (error || !data || data.length === 0) {
    return { ok: false, error: "Übung konnte nicht entfernt werden." };
  }

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: null };
}

/**
 * Resolves a typed name to an exercise, creating it only if nothing matches.
 *
 * The lookup is case-insensitive on purpose: CONCEPT.md §2.5 calls out
 * "Bench Press" vs "bench press" silently splitting history as the main way
 * exercise identity breaks. The unique constraint is exact, so a case variant
 * would otherwise slip past it and create a second library entry.
 */
export async function findOrCreateExercise(
  name: string
): Promise<ActionResult<ExerciseOption>> {
  const parsed = exerciseNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: "Name darf nicht leer sein (höchstens 80 Zeichen)." };
  }
  const cleanName = parsed.data;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: NOT_SIGNED_IN };

  const { data: matches, error: matchError } = await supabase
    .from("exercises")
    .select("id, name, note")
    .ilike("name", cleanName)
    .order("created_at", { ascending: true })
    .limit(1);

  if (matchError) {
    console.error("findOrCreateExercise: lookup failed", { name: cleanName }, matchError);
  }

  if (matches && matches.length > 0) return { ok: true, data: matches[0] };

  const { data, error } = await supabase
    .from("exercises")
    .insert({ user_id: user.id, name: cleanName })
    .select("id, name, note")
    .single();

  if (error || !data) {
    // Lost a race against another tab, or hit the exact-match unique index.
    const { data: retryMatches, error: retryError } = await supabase
      .from("exercises")
      .select("id, name, note")
      .ilike("name", cleanName)
      .order("created_at", { ascending: true })
      .limit(1);

    if (retryError) {
      console.error("findOrCreateExercise: retry lookup failed", { name: cleanName }, retryError);
    }

    if (retryMatches && retryMatches.length > 0) return { ok: true, data: retryMatches[0] };
    return { ok: false, error: "Übung konnte nicht angelegt werden." };
  }

  return { ok: true, data };
}

export async function addSet(
  workoutId: string,
  workoutExerciseId: string,
  input: unknown
): Promise<ActionResult<SetRecord>> {
  const parsed = setInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Prüfe Gewicht und Wiederholungen.", kind: "validation" };
  }

  const supabase = await createServerSupabase();

  const { data: existing } = await supabase
    .from("sets")
    .select("position")
    .eq("workout_exercise_id", workoutExerciseId);

  const { data, error } = await supabase
    .from("sets")
    .insert({
      workout_exercise_id: workoutExerciseId,
      position: nextPosition(existing ?? []),
      weight_kg: parsed.data.weight_kg,
      reps: parsed.data.reps,
      is_warmup: parsed.data.is_warmup,
    })
    .select(SET_COLUMNS)
    .single();

  if (error || !data) return { ok: false, error: SAVE_FAILED, kind: "transient" };

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: toSetRecord(data as RawSet) };
}

export async function updateSet(
  workoutId: string,
  setId: string,
  input: unknown
): Promise<ActionResult<SetRecord>> {
  const parsed = setInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Prüfe Gewicht und Wiederholungen.", kind: "validation" };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("sets")
    .update({
      weight_kg: parsed.data.weight_kg,
      reps: parsed.data.reps,
      is_warmup: parsed.data.is_warmup,
    })
    .eq("id", setId)
    .select(SET_COLUMNS)
    .single();

  if (error || !data) return { ok: false, error: SAVE_FAILED, kind: "transient" };

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: toSetRecord(data as RawSet) };
}

export async function deleteSet(
  workoutId: string,
  setId: string
): Promise<ActionResult<null>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("sets")
    .delete()
    .eq("id", setId)
    .select("id");

  if (error || !data || data.length === 0) {
    return { ok: false, error: "Satz konnte nicht gelöscht werden.", kind: "transient" };
  }

  revalidatePath(`/workout/${workoutId}`);
  return { ok: true, data: null };
}

/**
 * Deletes a whole workout, and with it every exercise and set of that day.
 *
 * No cascade is done by hand: `workout_exercises.workout_id` and
 * `sets.workout_exercise_id` are both `on delete cascade` (see the init
 * migration). The `exercises` FK is `on delete restrict`, but that guards
 * deleting an exercise from the library, not a workout that references one.
 */
export async function deleteWorkout(workoutId: string): Promise<ActionResult<null>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", workoutId)
    .select("id");

  // RLS turns a foreign or missing id into zero deleted rows rather than an
  // error, so an empty result is a failure just as much as `error` is.
  if (error || !data || data.length === 0) {
    return { ok: false, error: "Workout konnte nicht gelöscht werden.", kind: "transient" };
  }

  // The one list renders every workout, including this week's count above it.
  revalidatePath("/");
  return { ok: true, data: null };
}
