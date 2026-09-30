"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { formatClock, formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./icons";

type Timer = {
  id: string;
  label: string;
  recipeTitle: string;
  seconds: number;
  endsAt: number | null; // null while paused
  remaining: number; // seconds left when paused
  done: boolean;
};

type TimersApi = {
  timers: Timer[];
  start: (label: string, seconds: number, recipeTitle: string) => void;
};

const TimersContext = createContext<TimersApi | null>(null);
const STORAGE_KEY = "cookbook.timers";

export function useTimers() {
  const ctx = useContext(TimersContext);
  if (!ctx) throw new Error("useTimers outside TimersProvider");
  return ctx;
}

// ---------- sound ----------

let audioCtx: AudioContext | null = null;
function getAudio() {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** A soft bell: a few inharmonic partials with slow exponential decay, struck three times. */
function chime() {
  const ctx = getAudio();
  const partials = [
    { f: 880, g: 0.22, d: 2.4 },
    { f: 880 * 2.76, g: 0.07, d: 1.2 },
    { f: 880 * 5.4, g: 0.03, d: 0.6 },
  ];
  for (let strike = 0; strike < 3; strike++) {
    const t0 = ctx.currentTime + strike * 1.1;
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = strike === 1 ? p.f * 0.75 : p.f; // gentle two-note motif
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(p.g, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + p.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + p.d + 0.05);
    }
  }
}

async function notify(title: string, body: string) {
  navigator.vibrate?.([200, 100, 200]);
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  // Android Chrome only shows notifications through a service worker.
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) await reg.showNotification(title, { body, tag: title, icon: "/icon.svg" });
}

// ---------- provider ----------

export function TimersProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [timers, setTimers] = useState<Timer[]>([]);
  const [, setTick] = useState(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // Restore after a reload.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Timer[];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
      if (saved.length) setTimers(saved);
    } catch {}
    void navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch {}
  }, [timers]);

  const running = timers.some((t) => t.endsAt && !t.done);

  // Tick, and fire finished timers.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const now = Date.now();
      const finished = timers.filter((x) => x.endsAt && !x.done && x.endsAt <= now);
      if (finished.length) {
        chime();
        for (const x of finished) void notify(t("timers.notifyDone", { label: x.label }), x.recipeTitle);
        const ids = new Set(finished.map((x) => x.id));
        setTimers((list) => list.map((x) => (ids.has(x.id) ? { ...x, done: true } : x)));
      } else {
        setTick((n) => n + 1);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, timers, t]);

  // Keep the screen on while anything is running, so the chime is heard.
  useEffect(() => {
    if (!running) {
      void wakeLock.current?.release();
      wakeLock.current = null;
      return;
    }
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && !wakeLock.current) {
          wakeLock.current = await navigator.wakeLock?.request("screen");
          wakeLock.current?.addEventListener("release", () => (wakeLock.current = null));
        }
      } catch {}
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => document.removeEventListener("visibilitychange", acquire);
  }, [running]);

  const start = useCallback((label: string, seconds: number, recipeTitle: string) => {
    getAudio(); // unlock audio on this user gesture
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setTimers((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        label,
        recipeTitle,
        seconds,
        endsAt: Date.now() + seconds * 1000,
        remaining: seconds,
        done: false,
      },
    ]);
  }, []);

  const api = useMemo(() => ({ timers, start }), [timers, start]);

  return (
    <TimersContext.Provider value={api}>
      {children}
      <TimerTray timers={timers} setTimers={setTimers} />
    </TimersContext.Provider>
  );
}

function remainingOf(t: Timer) {
  if (t.done) return 0;
  return t.endsAt ? Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000)) : t.remaining;
}

function TimerTray({
  timers,
  setTimers,
}: {
  timers: Timer[];
  setTimers: React.Dispatch<React.SetStateAction<Timer[]>>;
}) {
  const t = useT();
  const tray = useRef<HTMLElement>(null);
  const shown = timers.length > 0;
  // Its height, so things pinned to the bottom (the chat button) sit above it.
  useEffect(() => {
    const root = document.documentElement.style;
    if (!shown || !tray.current) return;
    const observer = new ResizeObserver(([entry]) => root.setProperty("--tray-h", `${entry.borderBoxSize[0].blockSize}px`));
    observer.observe(tray.current);
    return () => {
      observer.disconnect();
      root.removeProperty("--tray-h");
    };
  }, [shown]);
  if (!shown) return null;
  const update = (id: string, f: (t: Timer) => Timer | null) =>
    setTimers((list) => list.flatMap((t) => (t.id === id ? (f(t) ?? []) : [t])));

  return (
    <aside ref={tray} className="timer-tray" aria-label={t("timers.title")}>
      <p className="tray-head">
        <Icon name="clock" /> {t("timers.title")}
      </p>
      <ul className="tray-list">
        {timers.map((timer) => {
          const left = remainingOf(timer);
          const paused = !timer.endsAt && !timer.done;
          return (
            <li key={timer.id} className={`timer${timer.done ? " is-done" : ""}${paused ? " is-paused" : ""}`}>
              <div className="t-info">
                <span className="t-label">{timer.label}</span>
                <span className="t-time" dir="ltr" aria-live={timer.done ? "assertive" : "off"}>
                  {timer.done ? t("timers.done") : formatClock(left)}
                </span>
                <span className="t-state">
                  {timer.done ? (
                    <>
                      <Icon name="bell" /> {timer.recipeTitle}
                    </>
                  ) : paused ? (
                    t("timers.paused")
                  ) : (
                    t("timers.of", { d: formatDuration(timer.seconds, t) })
                  )}
                </span>
              </div>
              <div className="t-actions">
                {!timer.done && (
                  <button
                    className="btn"
                    onClick={() =>
                      update(timer.id, (x) =>
                        paused
                          ? { ...x, endsAt: Date.now() + x.remaining * 1000 }
                          : { ...x, endsAt: null, remaining: remainingOf(x) },
                      )
                    }
                  >
                    <Icon name={paused ? "play" : "pause"} /> {paused ? t("timers.resume") : t("timers.pause")}
                  </button>
                )}
                <button className="btn" onClick={() => update(timer.id, () => null)}>
                  <Icon name={timer.done ? "check" : "stop"} /> {timer.done ? t("timers.ok") : t("timers.stop")}
                </button>
              </div>
              <span className="t-bar" aria-hidden>
                <i style={{ transform: `scaleX(${timer.seconds ? 1 - left / timer.seconds : 1})` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ---------- pills ----------

export function TimerPill({ label, seconds, recipeTitle }: { label: string; seconds: number; recipeTitle: string }) {
  const { start } = useTimers();
  const t = useT();
  return (
    <button className="pill" onClick={() => start(label, seconds, recipeTitle)}>
      <Icon name="clock" /> {label} · {formatDuration(seconds, t)}
      <span className="visually-hidden">{t("timers.startHidden")}</span>
    </button>
  );
}

export function AddTimer({ recipeTitle, defaultLabel }: { recipeTitle: string; defaultLabel: string }) {
  const { start } = useTimers();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("10");
  if (!open) {
    return (
      <button className="pill pill-ghost" onClick={() => setOpen(true)}>
        <Icon name="plus" /> {t("timers.add")}
      </button>
    );
  }
  return (
    <form
      className="add-timer"
      onSubmit={(e) => {
        e.preventDefault();
        const m = parseFloat(minutes);
        if (m > 0) start(defaultLabel, Math.round(m * 60), recipeTitle);
        setOpen(false);
      }}
    >
      <label htmlFor={`min-${defaultLabel}`}>{t("timers.minutes")}</label>
      <input
        id={`min-${defaultLabel}`}
        type="number"
        inputMode="decimal"
        min="0.1"
        step="any"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        autoFocus
      />
      <button className="btn btn-primary">{t("timers.start")}</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        {t("common.cancel")}
      </button>
    </form>
  );
}
