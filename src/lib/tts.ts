/**
 * TTS provider abstraction.
 *
 * Two providers are supported:
 *   - kokoro_local  : Calls the Gradio/Kokoro server at http://host.docker.internal:7861
 *                     via the HTTP predict API (no Python gradio_client dependency needed).
 *   - elevenlabs    : REST API  (model, voice_id, api_key)
 *   - openai        : OpenAI TTS REST API (model, voice, api_key)
 *   - generic_openai: Any OpenAI-compatible endpoint (base_url, model, voice, api_key)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { publicPathToAbsolute } from "@/lib/storage";
import { slugify } from "@/lib/utils";
export type { TtsProvider, KokoroVoice } from "@/lib/tts-voices";
export { KOKORO_VOICES } from "@/lib/tts-voices";
import type { TtsProvider } from "@/lib/tts-voices";

// Provider-specific settings types (server-only, not re-exported from tts-voices.ts)
export type KokoroSettings = Record<string, never>;

export type ElevenLabsSettings = {
  apiKey: string;
  voiceId: string;
  modelId?: string;
};

export type OpenAiSettings = {
  apiKey: string;
  model?: string;
};

export type GenericOpenAiSettings = {
  apiKey: string;
  baseUrl: string;
  model?: string;
};

export type RemoteTtsSettings = ElevenLabsSettings | OpenAiSettings | GenericOpenAiSettings;

// The Kokoro Gradio server URL. Inside Docker we reach the host machine via host.docker.internal.
const KOKORO_BASE_URL = process.env.KOKORO_URL ?? "http://host.docker.internal:7861";

function toSafeFilename(bookTitle: string, position: number, chapterTitle: string) {
  const safeBook = slugify(bookTitle).replace(/-/g, "_");
  const safeChapter = slugify(chapterTitle).replace(/-/g, "_");
  const pad = String(position).padStart(2, "0");
  return `${safeBook}_chapter_${pad}_${safeChapter}`;
}

/**
 * Call Kokoro local Gradio API via plain HTTP predict.
 * Returns the relative public path to the saved MP3.
 */
async function generateViaKokoro(
  text: string,
  voice: string,
  speed: number,
  outputAbsPath: string,
): Promise<void> {
  const url = `${KOKORO_BASE_URL}/gradio_api/call/generate_first`;

  // Step 1: POST to queue the prediction
  const queueRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [text, voice, speed, "MP3"] }),
  });

  if (!queueRes.ok) {
    const body = await queueRes.text().catch(() => "");
    throw new Error(`Kokoro queue failed (${queueRes.status}): ${body.slice(0, 300)}`);
  }

  const { event_id } = (await queueRes.json()) as { event_id: string };

  if (!event_id) {
    throw new Error("Kokoro did not return an event_id.");
  }

  // Step 2: Poll SSE result stream
  const resultUrl = `${KOKORO_BASE_URL}/gradio_api/call/generate_first/${event_id}`;
  const resultRes = await fetch(resultUrl);

  if (!resultRes.ok || !resultRes.body) {
    throw new Error(`Kokoro result fetch failed (${resultRes.status})`);
  }

  const reader = resultRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let audioUrl: string | null = null;

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        try {
          const parsed = JSON.parse(payload) as unknown[];
          // First element is the FileData object with a url or path
          const first = parsed[0] as { url?: string; path?: string } | null;
          if (first?.url) {
            audioUrl = first.url;
            break outer;
          }

          if (first?.path) {
            audioUrl = `${KOKORO_BASE_URL}/gradio_api/file=${first.path}`;
            break outer;
          }
        } catch {
          // partial JSON — keep reading
        }
      }
    }
  }

  if (!audioUrl) {
    throw new Error("Kokoro generation completed but no audio URL was returned.");
  }

  // Step 3: Download the audio file
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download Kokoro audio (${audioRes.status})`);
  }

  const buffer2 = Buffer.from(await audioRes.arrayBuffer());
  await mkdir(dirname(outputAbsPath), { recursive: true });
  await writeFile(outputAbsPath, buffer2);
}

/**
 * ElevenLabs TTS: POST /v1/text-to-speech/{voice_id}/stream
 * Returns MP3 bytes directly.
 */
async function generateViaElevenLabs(
  text: string,
  settings: ElevenLabsSettings,
  outputAbsPath: string,
): Promise<void> {
  const { apiKey, voiceId, modelId = "eleven_multilingual_v2" } = settings;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      output_format: "mp3_44100_128",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs error (${res.status}): ${body.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(outputAbsPath), { recursive: true });
  await writeFile(outputAbsPath, buf);
}

/**
 * OpenAI TTS: POST /v1/audio/speech
 * Compatible with openai.com and any generic_openai endpoint.
 */
async function generateViaOpenAiCompatible(
  text: string,
  voice: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  outputAbsPath: string,
): Promise<void> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: text, voice, response_format: "mp3" }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS error (${res.status}): ${body.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(outputAbsPath), { recursive: true });
  await writeFile(outputAbsPath, buf);
}

export type GenerateChapterAudioOptions = {
  text: string;
  bookTitle: string;
  position: number;
  chapterTitle: string;
  provider: TtsProvider;
  voice: string;
  speed: number;
  remoteSettings?: RemoteTtsSettings | null;
};

/**
 * Generate audio for a single chapter. Returns the relative public path (e.g. /storage/generated/tts/...).
 */
export async function generateChapterAudio(opts: GenerateChapterAudioOptions): Promise<string> {
  const { text, bookTitle, position, chapterTitle, provider, voice, speed, remoteSettings } = opts;

  const filename = toSafeFilename(bookTitle, position, chapterTitle);
  const relPath = `/storage/generated/tts/${filename}.mp3`;
  const absPath = publicPathToAbsolute(relPath);

  switch (provider) {
    case "kokoro_local": {
      await generateViaKokoro(text, voice, speed, absPath);
      break;
    }

    case "elevenlabs": {
      const s = remoteSettings as ElevenLabsSettings;
      await generateViaElevenLabs(text, s, absPath);
      break;
    }

    case "openai": {
      const s = remoteSettings as OpenAiSettings;
      await generateViaOpenAiCompatible(text, voice, s.apiKey, "https://api.openai.com", s.model ?? "tts-1", absPath);
      break;
    }

    case "generic_openai": {
      const s = remoteSettings as GenericOpenAiSettings;
      await generateViaOpenAiCompatible(text, voice, s.apiKey, s.baseUrl, s.model ?? "tts-1", absPath);
      break;
    }

    default:
      throw new Error(`Unknown TTS provider: ${provider}`);
  }

  return relPath;
}
