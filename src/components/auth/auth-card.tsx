"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Mode = "signup" | "login";

const ERROR_MESSAGES: Record<string, string> = {
  signup: "Konto konnte nicht erstellt werden – prüfe die E-Mail-Adresse.",
  magic: "Link konnte nicht gesendet werden – prüfe die E-Mail-Adresse.",
  password: "Anmeldung fehlgeschlagen – prüfe E-Mail und Passwort.",
  link: "Der Link ist ungültig oder abgelaufen. Fordere einen neuen an.",
};

type Props = {
  error?: string;
  sent: boolean;
  signUpAction: (formData: FormData) => void;
  magicLoginAction: (formData: FormData) => void;
  passwordLoginAction: (formData: FormData) => void;
};

export function AuthCard({
  error,
  sent,
  signUpAction,
  magicLoginAction,
  passwordLoginAction,
}: Props) {
  // error=link (a dead magic link) is a login-side problem regardless of
  // which form the user last submitted, so land them on "Anmelden".
  const [mode, setMode] = useState<Mode>(error === "password" || error === "link" ? "login" : "signup");
  const [usePassword, setUsePassword] = useState(error === "password");

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Prüfe dein Postfach</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Wir haben dir einen Anmeldelink per E-Mail geschickt. Öffne ihn auf diesem Gerät, um
            fortzufahren.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">GymTrack</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            className={tabClass(mode === "signup")}
            aria-pressed={mode === "signup"}
            onClick={() => setMode("signup")}
          >
            Konto erstellen
          </button>
          <button
            type="button"
            className={tabClass(mode === "login")}
            aria-pressed={mode === "login"}
            onClick={() => setMode("login")}
          >
            Anmelden
          </button>
        </div>

        {mode === "signup" && (
          <form action={signUpAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                className="min-h-11"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-email">E-Mail</Label>
              <Input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                className="min-h-11"
                required
              />
            </div>
            {error === "signup" && <p className="text-sm text-destructive">{ERROR_MESSAGES.signup}</p>}
            <Button type="submit" className="min-h-11 w-full">
              Link senden
            </Button>
          </form>
        )}

        {mode === "login" && usePassword && (
          <form action={passwordLoginAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password-email">E-Mail</Label>
              <Input
                id="password-email"
                name="email"
                type="email"
                autoComplete="email"
                className="min-h-11"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="min-h-11"
                required
              />
            </div>
            {error === "password" && <p className="text-sm text-destructive">{ERROR_MESSAGES.password}</p>}
            <Button type="submit" className="min-h-11 w-full">
              Anmelden
            </Button>
            <button
              type="button"
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => setUsePassword(false)}
            >
              Stattdessen Link per E-Mail senden
            </button>
          </form>
        )}

        {mode === "login" && !usePassword && (
          <form action={magicLoginAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="magic-email">E-Mail</Label>
              <Input
                id="magic-email"
                name="email"
                type="email"
                autoComplete="email"
                className="min-h-11"
                required
              />
            </div>
            {(error === "magic" || error === "link") && (
              <p className="text-sm text-destructive">{ERROR_MESSAGES[error]}</p>
            )}
            <Button type="submit" className="min-h-11 w-full">
              Link senden
            </Button>
            <button
              type="button"
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => setUsePassword(true)}
            >
              Stattdessen Passwort verwenden
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function tabClass(active: boolean) {
  return cn(
    "min-h-9 flex-1 rounded-md text-sm font-medium transition-colors",
    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
  );
}
