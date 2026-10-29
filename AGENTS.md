<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Branch-Workflow: staging zuerst

`main` ist Produktion. `staging` ist die Vorstufe und muss ein direkter Vorfahre
von `main` bleiben — nie eigenständig weiterlaufen.

**Ablauf für jede Änderung:**

1. Feature-Branch von `staging` abzweigen (nicht von `main`).
2. PR gegen `staging` öffnen. Dort wird getestet.
3. Wenn staging gut aussieht: PR `staging` → `main`.

Feature-Branches gehen **nicht** direkt nach `main`. Einzige Ausnahme sind
Hotfixes an der Produktion; danach `main` sofort per Fast-Forward nach `staging`
zurückspielen, damit die Branches nicht divergieren.

**Nach jedem Release** (`staging` → `main` gemerged) `staging` wieder gleichziehen:

```bash
git push origin origin/main:staging
```

Das ist ein Fast-Forward, solange die Regel oben eingehalten wurde. Wenn Git
einen Force-Push verlangt, sind die Branches divergiert — dann erst prüfen, was
auf `staging` liegt, das nicht in `main` ist (`git log main..staging`).

**Es gibt kein CI.** Vor jedem PR lokal laufen lassen:

```bash
npm run lint && npm run test && npm run build
```

**Datenbank:** Migrationen unter `supabase/migrations/` müssen auf der
Staging-Instanz angewendet sein, bevor der zugehörige Code dort deployt wird —
sonst läuft der Staging-Build gegen ein veraltetes Schema.
