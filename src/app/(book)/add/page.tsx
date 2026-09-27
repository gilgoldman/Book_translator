import { ImportForm } from "@/components/import-form";

export const metadata = { title: "Add a recipe" };
// Extraction + enrichment can take a while on long pages or voice notes.
export const maxDuration = 300;

export default function AddPage() {
  return (
    <div className="narrow">
      <p className="kicker">New recipe</p>
      <h1>Add a recipe</h1>
      <div className="card">
        <ImportForm />
      </div>
    </div>
  );
}
