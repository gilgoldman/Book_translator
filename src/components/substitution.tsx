import type { Substitution } from "@/lib/recipe-types";

export function SubstitutionCard({ result }: { result: Substitution }) {
  return (
    <div className="substitution">
      <ol>
        {result.options.map((o, i) => (
          <li key={i}>
            <p className="sub-use">
              <strong>{o.use}</strong> — {o.amount}
            </p>
            <p>{o.how}</p>
            <p className="muted">{o.effect}</p>
          </li>
        ))}
      </ol>
      {result.tip && <p className="sub-tip">{result.tip}</p>}
    </div>
  );
}
