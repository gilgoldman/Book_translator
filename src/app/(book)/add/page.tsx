import { ImportForm } from "@/components/import-form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("add.title") };
}
// Extraction, enrichment and translation can take a while on long pages or voice notes.
export const maxDuration = 300;

export default async function AddPage() {
  const t = await getT();
  return (
    <div className="narrow">
      <p className="kicker">{t("add.kicker")}</p>
      <h1>{t("add.title")}</h1>
      <div className="card">
        <ImportForm />
      </div>
    </div>
  );
}
