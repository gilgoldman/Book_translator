"use client";

import { useT } from "@/lib/i18n/client";
import type { Substitution } from "@/lib/recipe-types";

const VERDICT = { yes: "subs.askedYes", "with-changes": "subs.askedChanges", no: "subs.askedNo" } as const;

/** The swap they asked about, if any; then ranked swaps, the first the best bet. */
export function SubstitutionCard({ result }: { result: Substitution }) {
  const t = useT();
  // Answers cached before "asked" existed don't have it.
  const asked = result.asked ?? null;
  return (
    <div className="substitution">
      {asked && (
        <div className={`sub-asked verdict-${asked.verdict}`}>
          <p className="what">
            <strong>{t(VERDICT[asked.verdict])}</strong>
            {asked.amount && <> — {asked.amount}</>}
          </p>
          <p>{asked.how}</p>
          <p className="how">{asked.effect}</p>
        </div>
      )}
      {asked && result.options.length > 0 && <p className="sub-others">{t("subs.others")}</p>}
      <ol className="subs">
        {result.options.map((o, i) => (
          <li key={i}>
            <span className="rank" aria-hidden>
              {i + 1}
            </span>
            <p className="what">
              {i === 0 && <span className="visually-hidden">{t("subs.best")} </span>}
              {o.use} — {o.amount}
            </p>
            <p>{o.how}</p>
            <p className="how">{o.effect}</p>
          </li>
        ))}
      </ol>
      {result.tip && <p className="sub-tip">{result.tip}</p>}
    </div>
  );
}
