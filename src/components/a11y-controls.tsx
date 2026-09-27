"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./icons";

const SIZES = [
  { value: "normal", label: "a11y.size.normal", aa: "1rem" },
  { value: "large", label: "a11y.size.large", aa: "1.25rem" },
  { value: "xl", label: "a11y.size.xl", aa: "1.5rem" },
] as const;

const THEMES = [
  { value: "system", label: "a11y.theme.system" },
  { value: "light", label: "a11y.theme.light" },
  { value: "dark", label: "a11y.theme.dark" },
] as const;

/** Applied before paint by the inline script in the root layout (no flash). */
export const A11Y_BOOT_SCRIPT = `try{var d=document.documentElement,s=localStorage,t=s.getItem("cookbook.textSize");if(t==="xlarge")t="xl";d.setAttribute("data-text-size",t||"normal");var m=s.getItem("cookbook.theme");if(m==="light"||m==="dark")d.setAttribute("data-theme",m);if(s.getItem("cookbook.contrast")==="high")d.setAttribute("data-contrast","high")}catch(e){}`;

function save(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
}

function setRootAttr(name: string, value: string | null) {
  if (value) document.documentElement.setAttribute(name, value);
  else document.documentElement.removeAttribute(name);
}

/** "Text & colours": text size in three steps, light/dark, and high contrast. */
export function A11yControls() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState("normal");
  const [theme, setTheme] = useState("system");
  const [contrast, setContrast] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    /* eslint-disable react-hooks/set-state-in-effect -- read what the boot script applied */
    setSize(root.getAttribute("data-text-size") ?? "normal");
    setTheme(root.getAttribute("data-theme") ?? "system");
    setContrast(root.getAttribute("data-contrast") === "high");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  return (
    <>
      <button className="btn" aria-expanded={open} aria-controls="display-sheet" onClick={() => setOpen(!open)}>
        <Icon name="text" /> {t("a11y.button")}
      </button>
      {open && (
        <section id="display-sheet" className="sheet" aria-label={t("a11y.sheet")}>
          <div className="sheet-grid">
            <div>
              <span className="field-label" id="size-label">
                {t("a11y.size")}
              </span>
              <div className="seg" role="radiogroup" aria-labelledby="size-label">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    role="radio"
                    aria-checked={size === s.value}
                    onClick={() => {
                      setRootAttr("data-text-size", s.value);
                      save("cookbook.textSize", s.value);
                      setSize(s.value);
                    }}
                  >
                    <span className="aa" style={{ fontSize: s.aa }} aria-hidden>
                      Aa
                    </span>
                    {t(s.label)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="field-label" id="theme-label">
                {t("a11y.colours")}
              </span>
              <div className="seg" role="radiogroup" aria-labelledby="theme-label">
                {THEMES.map((th) => (
                  <button
                    key={th.value}
                    role="radio"
                    aria-checked={theme === th.value}
                    onClick={() => {
                      setRootAttr("data-theme", th.value === "system" ? null : th.value);
                      save("cookbook.theme", th.value === "system" ? null : th.value);
                      setTheme(th.value);
                    }}
                  >
                    {t(th.label)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <button
                className="switch"
                role="switch"
                aria-checked={contrast}
                onClick={() => {
                  const next = !contrast;
                  setRootAttr("data-contrast", next ? "high" : null);
                  save("cookbook.contrast", next ? "high" : null);
                  setContrast(next);
                }}
              >
                <span>
                  {t("a11y.contrast")}
                  <span className="state">
                    {contrast ? t("a11y.on") : t("a11y.off")} · {t("a11y.contrastHint")}
                  </span>
                </span>
                <span className="track" aria-hidden />
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
