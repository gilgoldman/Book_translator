"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { formatClock, formatDuration } from "@/lib/format";
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
      const finished = timers.filter((t) => t.endsAt && !t.done && t.endsAt <= now);
      if (finished.length) {
        chime();
        for (const t of finished) void notify(`${t.label} — done`, t.recipeTitle);
        const ids = new Set(finished.map((t) => t.id));
        setTimers((list) => list.map((t) => (ids.has(t.id) ? { ...t, done: true } : t)));
      } else {
        setTick((n) => n + 1);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, timers]);

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
  if (timers.length === 0) return null;
  const update = (id: string, f: (t: Timer) => Timer | null) =>
    setTimers((list) => list.flatMap((t) => (t.id === id ? (f(t) ?? []) : [t])));

  return (
    <aside className="timer-tray" aria-label="Timers">
      <p className="tray-head">
        <Icon name="clock" /> Timers
      </p>
      <ul className="tray-list">
        {timers.map((t) => {
          const left = remainingOf(t);
          const paused = !t.endsAt && !t.done;
          return (
            <li key={t.id} className={`timer${t.done ? " is-done" : ""}${paused ? " is-paused" : ""}`}>
              <div className="t-info">
                <span className="t-label">{t.label}</span>
                <span className="t-time" aria-live={t.done ? "assertive" : "off"}>
                  {t.done ? "Done!" : formatClock(left)}
                </span>
                <span className="t-state">
                  {t.done ? (
                    <>
                      <Icon name="bell" /> {t.recipeTitle}
                    </>
                  ) : paused ? (
                    "Paused"
                  ) : (
                    `of ${formatDuration(t.seconds)}`
                  )}
                </span>
              </div>
              <div className="t-actions">
                {!t.done && (
                  <button
                    className="btn"
                    onClick={() =>
                      update(t.id, (x) =>
                        paused
                          ? { ...x, endsAt: Date.now() + x.remaining * 1000 }
                          : { ...x, endsAt: null, remaining: remainingOf(x) },
                      )
                    }
                  >
                    <Icon name={paused ? "play" : "pause"} /> {paused ? "Resume" : "Pause"}
                  </button>
                )}
                <button className="btn" onClick={() => update(t.id, () => null)}>
                  <Icon name={t.done ? "check" : "stop"} /> {t.done ? "OK" : "Stop"}
                </button>
              </div>
              <span className="t-bar" aria-hidden>
                <i style={{ transform: `scaleX(${t.seconds ? 1 - left / t.seconds : 1})` }} />
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
  return (
    <button className="pill" onClick={() => start(label, seconds, recipeTitle)}>
      <Icon name="clock" /> {label} · {formatDuration(seconds)}
      <span className="visually-hidden">: start timer</span>
    </button>
  );
}

export function AddTimer({ recipeTitle, defaultLabel }: { recipeTitle: string; defaultLabel: string }) {
  const { start } = useTimers();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("10");
  if (!open) {
    return (
      <button className="pill pill-ghost" onClick={() => setOpen(true)}>
        <Icon name="plus" /> Timer
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
      <label htmlFor={`min-${defaultLabel}`}>Minutes</label>
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
      <button className="btn btn-primary">Start</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
