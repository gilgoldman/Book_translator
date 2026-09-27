"use client";

import { useT } from "@/lib/i18n/client";
import type { Substitution } from "@/lib/recipe-types";

/** Ranked swaps; the first is the best bet. */
export function SubstitutionCard({ result }: { result: Substitution }) {
  const t = useT();
  return (
    <div className="substitution">
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
