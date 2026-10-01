"use client";

import { useEffect, useRef, useState } from "react";
import { micProblem, type MicProblem } from "@/lib/mic";

/**
 * Record from the microphone; `onDone` gets the recording when it stops. `problem` says why
 * the browser wouldn't give us the microphone, if it didn't (see src/lib/mic.ts).
 */
export function useRecorder(onDone: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<MicProblem | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  async function start() {
    setProblem(null);
    let stream: MediaStream;
    try {
      // Asked straight from the tap: browsers only show "Allow microphone?" for one.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (typeof MediaRecorder === "undefined") {
        stream.getTracks().forEach((track) => track.stop());
        throw new TypeError("MediaRecorder is not supported");
      }
    } catch (err) {
      console.warn("microphone refused", err);
      setProblem(micProblem(err, navigator.userAgent));
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      setRecording(false);
      const type = rec.mimeType.split(";")[0] || "audio/webm";
      const file = new File(chunks, `voice.${type.split("/")[1]}`, { type });
      if (file.size > 0) done.current(file);
    };
    rec.start();
    recorder.current = rec;
    setRecording(true);
  }

  function stop() {
    recorder.current?.stop();
  }

  return {
    recording,
    problem,
    clearProblem: () => setProblem(null),
    start,
    stop,
    toggle: () => (recording ? stop() : void start()),
  };
}
