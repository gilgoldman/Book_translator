"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Record from the microphone; `onDone` gets the recording when it stops. `failed` is set when
 * the browser won't give us the microphone (no permission, no mic).
 */
export function useRecorder(onDone: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const [failed, setFailed] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  async function start() {
    setFailed(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setFailed(true);
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

  return { recording, failed, start, stop, toggle: () => (recording ? stop() : void start()) };
}
