import type { ReactNode } from "react";

/** One dashboard block: the small uppercase label, then its content. */
export function DashboardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** What a block says when its query failed — never a zero that looks like data. */
export function BlockError() {
  return <p className="text-sm text-muted-foreground">Konnte gerade nicht geladen werden.</p>;
}
