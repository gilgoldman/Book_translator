"use client";

import { useEffect, useState } from "react";

const SIZES = [
  { value: "normal", label: "A", name: "Normal text" },
  { value: "large", label: "A+", name: "Large text" },
  { value: "xlarge", label: "A++", name: "Extra large text" },
] as const;

/** Applied before paint by the inline script in the root layout (no flash). */
export const A11Y_BOOT_SCRIPT = `try{var d=document.documentElement,s=localStorage;d.dataset.textSize=s.getItem("cookbook.textSize")||"normal";if(s.getItem("cookbook.contrast")==="high")d.dataset.contrast="high"}catch(e){}`;

function save(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
}

/** "Aa" button: text size in three steps and a high-contrast switch. */
export function A11yControls() {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState("normal");
  const [contrast, setContrast] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read what the boot script applied
    setSize(root.getAttribute("data-text-size") ?? "normal");
    setContrast(root.getAttribute("data-contrast") === "high");
  }, []);

  const applySize = (value: string) => {
    document.documentElement.setAttribute("data-text-size", value);
    save("cookbook.textSize", value);
    setSize(value);
  };
  const toggleContrast = () => {
    const next = !contrast;
    if (next) document.documentElement.setAttribute("data-contrast", "high");
    else document.documentElement.removeAttribute("data-contrast");
    save("cookbook.contrast", next ? "high" : null);
    setContrast(next);
  };

  return (
    <div className="a11y">
      <button className="icon-button" aria-expanded={open} aria-controls="a11y-panel" onClick={() => setOpen(!open)}>
        <span aria-hidden>Aa</span>
        <span className="visually-hidden">Text size and contrast</span>
      </button>
      {open && (
        <div id="a11y-panel" className="a11y-panel" role="group" aria-label="Reading settings">
          <p className="a11y-title">Text size</p>
          <div className="button-row" role="radiogroup" aria-label="Text size">
            {SIZES.map((s) => (
              <button
                key={s.value}
                role="radio"
                aria-checked={size === s.value}
                aria-label={s.name}
                className={`size-option size-${s.value}`}
                onClick={() => applySize(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button className="secondary" role="switch" aria-checked={contrast} onClick={toggleContrast}>
            High contrast: {contrast ? "on" : "off"}
          </button>
        </div>
      )}
    </div>
  );
}
