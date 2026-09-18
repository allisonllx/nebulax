import { useEffect, useState } from "react";
import type { Language } from "./journey";

export function useSpeech(
  language: Language,
  offline: boolean,
  context: string,
) {
  const key = `${language}-${context}`;
  const [audio, setAudio] = useState({ key, speaking: false, message: "" });
  const speaking = audio.key === key && audio.speaking;
  const message = audio.key === key ? audio.message : "";
  const setSpeaking = (value: boolean) =>
    setAudio((previous) => ({ ...previous, key, speaking: value }));
  const setMessage = (value: string) =>
    setAudio((previous) => ({ ...previous, key, message: value }));
  useEffect(() => {
    window.speechSynthesis?.cancel();
    return () => window.speechSynthesis?.cancel();
  }, [language, context]);
  function speak(text: string) {
    setMessage("");
    if (!("speechSynthesis" in window)) {
      setMessage(
        language === "en"
          ? "Read-aloud is unavailable on this browser. Your written instructions are below."
          : "此浏览器暂不支持朗读。请查看文字指引。",
      );
      return;
    }
    window.speechSynthesis.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const voices = window.speechSynthesis
      .getVoices()
      .filter(
        (voice) =>
          voice.lang.startsWith(language) && (!offline || voice.localService),
      );
    if (offline && !voices.length) {
      setMessage(
        language === "en"
          ? "No offline voice is available for this language. Your written instructions still work."
          : "此语言暂无离线语音。您仍可查看文字指引。",
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "en" ? "en-SG" : "zh-CN";
    if (voices[0]) utterance.voice = voices[0];
    utterance.rate = 0.85;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = (event) => {
      setSpeaking(false);
      if (event.error !== "canceled" && event.error !== "interrupted")
        setMessage(
          language === "en"
            ? "Audio could not play. Please use the written instruction."
            : "暂时无法播放语音。请查看文字指引。",
        );
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }
  return { speak, speaking, message };
}
