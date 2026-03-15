/**
 * Client-safe TTS constants — no Node.js imports.
 * Imported by both tts.ts (server) and tts-form.tsx (client).
 */

export type TtsProvider = "kokoro_local" | "elevenlabs" | "openai" | "generic_openai";

export const KOKORO_VOICES = [
  "🇺🇸 🚺 Heart ❤️",
  "🇺🇸 🚺 Bella 🔥",
  "🇺🇸 🚺 Nicole 🎧",
  "🇺🇸 🚺 Aoede",
  "🇺🇸 🚺 Kore",
  "🇺🇸 🚺 Sarah",
  "🇺🇸 🚺 Nova",
  "🇺🇸 🚺 Sky",
  "🇺🇸 🚺 Alloy",
  "🇺🇸 🚺 Jessica",
  "🇺🇸 🚺 River",
  "🇺🇸 🚹 Michael",
  "🇺🇸 🚹 Fenrir",
  "🇺🇸 🚹 Puck",
  "🇺🇸 🚹 Echo",
  "🇺🇸 🚹 Eric",
  "🇺🇸 🚹 Liam",
  "🇺🇸 🚹 Onyx",
  "🇺🇸 🚹 Santa",
  "🇺🇸 🚹 Adam",
  "🇬🇧 🚺 Emma",
  "🇬🇧 🚺 Isabella",
  "🇬🇧 🚺 Alice",
  "🇬🇧 🚺 Lily",
  "🇬🇧 🚹 George",
  "🇬🇧 🚹 Fable",
  "🇬🇧 🚹 Lewis",
  "🇬🇧 🚹 Daniel",
  "PF 🚺 Dora",
  "PM 🚹 Alex",
  "PM 🚹 Santa",
  "🇮🇹 🚺 Sara",
  "🇮🇹 🚹 Nicola",
] as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[number];
