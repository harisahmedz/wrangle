"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type RecognitionResultAlternative = { transcript: string };

type RecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionResultAlternative;
};

type RecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  }
}

function getCtor():
  | (new () => RecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function subscribeNoop(onChange: () => void): () => void {
  void onChange;
  return () => {};
}

export function useSpeech(options: { onFinalize?: (transcript: string) => void } = {}) {
  const supported = useSyncExternalStore(
    subscribeNoop,
    () => Boolean(getCtor()),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const finalizeRef = useRef(options.onFinalize);

  useEffect(() => {
    finalizeRef.current = options.onFinalize;
  });

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        recognitionRef.current = null;
      }
    };
  }, []);

  const ensureRecognition = useCallback((): RecognitionLike | null => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = getCtor();
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en-US";
    recognition.onresult = (event) => {
      let finals = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finals += `${text} `;
        else interimText += text;
      }
      const finalText = finals.trim();
      if (finalText) {
        transcriptRef.current = transcriptRef.current
          ? `${transcriptRef.current} ${finalText}`
          : finalText;
        setTranscript(transcriptRef.current);
      }
      setInterim(interimText.trim());
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      setTranscript("");
      const finalText = transcriptRef.current;
      transcriptRef.current = "";
      if (finalText) finalizeRef.current?.(finalText);
    };
    recognition.onerror = () => {
      setListening(false);
      setInterim("");
      setTranscript("");
      transcriptRef.current = "";
    };
    try {
      recognition.processLocally = true;
    } catch {
      recognition.processLocally = undefined;
    }
    recognitionRef.current = recognition;
    return recognition;
  }, []);

  const start = useCallback(() => {
    const recognition = ensureRecognition();
    if (!recognition) return;
    transcriptRef.current = "";
    setTranscript("");
    setInterim("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [ensureRecognition]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      setListening(false);
      setInterim("");
      setTranscript("");
      transcriptRef.current = "";
    }
  }, []);

  return { supported, listening, transcript, interim, start, stop };
}
