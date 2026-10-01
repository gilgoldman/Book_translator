"use client";

import { useT } from "@/lib/i18n/client";
import type { MicProblem } from "@/lib/mic";

/**
 * Why recording didn't start and what to do, plus a way round it: the phone's own recorder (or a
 * recording they already have), which works even where the browser won't share the microphone.
 */
export function MicHelp({
  problem,
  onFile,
  className = "",
}: {
  problem: MicProblem;
  onFile: (file: File) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={`mic-help ${className}`} role="alert">
      <p>{t(`mic.${problem}`)}</p>
      <label className="btn">
        {t("mic.pick")}
        <input
          type="file"
          accept="audio/*"
          capture
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
      </label>
    </div>
  );
}
