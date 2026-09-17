export function speakIntentions(texts: string[]): void {
  if (typeof speechSynthesis === "undefined" || texts.length === 0) {
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(texts.join(". "));
  utterance.rate = 0.9;
  utterance.pitch = 1;
  speechSynthesis.speak(utterance);
}

export function stopSpeech(): void {
  if (typeof speechSynthesis === "undefined") {
    return;
  }
  speechSynthesis.cancel();
}
