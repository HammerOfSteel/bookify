"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { saveTtsProjectAction } from "@/app/actions";
import { KOKORO_VOICES } from "@/lib/tts-voices";
import type { TtsProvider } from "@/lib/tts-voices";

const TTS_FLASH_KEY = "bookify:tts-flash";

type RemoteSettings = {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  model?: string;
  baseUrl?: string;
};

type Chapter = {
  title: string;
  textContent?: string | null;
  textFileName?: string | null;
  audioPath?: string | null;
};

type TtsFormProps = {
  project?: {
    id?: string;
    title: string;
    description: string;
    author: string;
    ttsProvider: TtsProvider;
    ttsVoice: string;
    ttsSpeed: number;
    ttsRemoteSettings?: RemoteSettings | null;
    chapterCount: number;
    status?: string;
    generatedOutputPaths?: string[] | null;
    chapters: Chapter[];
  };
};

const emptyProject = {
  title: "",
  description: "",
  author: "",
  ttsProvider: "kokoro_local" as TtsProvider,
  ttsVoice: "🇺🇸 🚺 Nicole 🎧",
  ttsSpeed: 1.0,
  ttsRemoteSettings: null,
  chapterCount: 3,
  chapters: [{ title: "Chapter 1" }, { title: "Chapter 2" }, { title: "Chapter 3" }],
};

type BatchTextMapping = {
  chapters: Record<string, string>;
  unmatched: string[];
  matchedCount: number;
};

function inferBatchTextMapping(files: File[], chapterCount: number): BatchTextMapping {
  const result: BatchTextMapping = { chapters: {}, unmatched: [], matchedCount: 0 };

  for (const file of files) {
    const lower = file.name.toLowerCase();
    const match = lower.match(/(?:chapter|ch)[\s._-]*(\d{1,3})/i);

    if (!match) {
      result.unmatched.push(file.name);
      continue;
    }

    const num = Number.parseInt(match[1], 10);

    if (num < 1 || num > chapterCount) {
      result.unmatched.push(file.name);
      continue;
    }

    const key = String(num);

    if (!result.chapters[key]) {
      result.chapters[key] = file.name;
      result.matchedCount += 1;
    } else {
      result.unmatched.push(file.name);
    }
  }

  return result;
}

function GenerationProgress({
  percent,
  logs,
  logsExpanded,
  onToggleLogs,
}: {
  percent: number;
  logs: string[];
  logsExpanded: boolean;
  onToggleLogs: () => void;
}) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsExpanded]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-white/70">Generating TTS audio…</span>
            <span className="text-xs font-semibold tabular-nums text-[var(--sand)]">{percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-[var(--sand)] transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <button
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white/90"
          onClick={onToggleLogs}
          type="button"
        >
          {logsExpanded ? "Hide logs ▲" : "Show logs ▼"}
        </button>
      </div>
      {logsExpanded && (
        <div className="max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-5 text-white/70">
          {logs.length === 0 ? (
            <p className="text-white/40">Waiting for generation to start…</p>
          ) : (
            logs.map((log, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log list
              <p key={index}>{log}</p>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}

export function TtsForm({ project = emptyProject }: TtsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(saveTtsProjectAction, null);

  const [chapterCount, setChapterCount] = useState(
    Math.max(project.chapters.length || project.chapterCount || 1, 1),
  );
  const [provider, setProvider] = useState<TtsProvider>(project.ttsProvider);
  const [voice, setVoice] = useState(project.ttsVoice);
  const [speed, setSpeed] = useState(project.ttsSpeed);

  const [chapterTexts, setChapterTexts] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    project.chapters.forEach((ch, i) => {
      if (ch.textContent) initial[i] = ch.textContent;
    });
    return initial;
  });

  const [chapterFileNames, setChapterFileNames] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    project.chapters.forEach((ch, i) => {
      if (ch.textFileName) initial[i] = ch.textFileName;
    });
    return initial;
  });

  const [batchTextFiles, setBatchTextFiles] = useState<File[]>([]);
  const batchMapping = useMemo(
    () => inferBatchTextMapping(batchTextFiles, chapterCount),
    [batchTextFiles, chapterCount],
  );

  const existing = project.ttsRemoteSettings ?? {};
  const [remoteApiKey, setRemoteApiKey] = useState((existing as RemoteSettings).apiKey ?? "");
  const [remoteVoiceId, setRemoteVoiceId] = useState((existing as RemoteSettings).voiceId ?? "");
  const [remoteModelId, setRemoteModelId] = useState((existing as RemoteSettings).model ?? (existing as RemoteSettings).modelId ?? "");
  const [remoteBaseUrl, setRemoteBaseUrl] = useState((existing as RemoteSettings).baseUrl ?? "");

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPercent, setGenerationPercent] = useState(0);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  useEffect(() => {
    const msg = window.sessionStorage.getItem(TTS_FLASH_KEY);
    if (!msg) return;
    setFlashMessage(msg);
    window.sessionStorage.removeItem(TTS_FLASH_KEY);
  }, []);

  // Read batch text files and apply them to matched chapter slots
  useEffect(() => {
    if (batchTextFiles.length === 0) return;

    const batchByName = new Map(batchTextFiles.map((f) => [f.name, f]));
    const entries = Object.entries(batchMapping.chapters);

    if (entries.length === 0) return;

    Promise.all(
      entries.map(async ([key, fileName]) => {
        const index = Number.parseInt(key, 10) - 1;
        const file = batchByName.get(fileName);
        if (!file) return null;
        const content = await file.text();
        return { index, content, fileName: file.name };
      }),
    ).then((results) => {
      setChapterTexts((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r) next[r.index] = r.content;
        }
        return next;
      });
      setChapterFileNames((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r) next[r.index] = r.fileName;
        }
        return next;
      });
      setBatchTextFiles([]);
    });
  }, [batchTextFiles, batchMapping]);

  const remoteSettingsJson = useMemo(() => {
    if (provider === "kokoro_local") return "";

    if (provider === "elevenlabs") {
      return JSON.stringify({
        apiKey: remoteApiKey,
        voiceId: remoteVoiceId,
        ...(remoteModelId ? { modelId: remoteModelId } : {}),
      });
    }

    if (provider === "openai") {
      return JSON.stringify({
        apiKey: remoteApiKey,
        ...(remoteModelId ? { model: remoteModelId } : {}),
      });
    }

    // generic_openai
    return JSON.stringify({
      apiKey: remoteApiKey,
      baseUrl: remoteBaseUrl,
      ...(remoteModelId ? { model: remoteModelId } : {}),
    });
  }, [provider, remoteApiKey, remoteVoiceId, remoteModelId, remoteBaseUrl]);

  async function handleGenerate() {
    if (!project.id) return;

    setIsGenerating(true);
    setGenerationPercent(0);
    setGenerationLogs([]);
    setLogsExpanded(false);
    setClientError(null);

    try {
      const response = await fetch(`/api/tts/${project.id}/generate`, { method: "POST" });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({ error: "Generation failed to start." }))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Generation failed to start.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.startsWith("data: ") ? part.slice(6) : part.trim();
          if (!line) continue;

          try {
            const event = JSON.parse(line) as {
              type: string;
              percent?: number;
              message?: string;
              redirectUrl?: string;
            };

            if (event.type === "progress") {
              setGenerationPercent(event.percent ?? 0);
              if (event.message) {
                setGenerationLogs((prev) => [...prev, event.message!]);
              }
            } else if (event.type === "done") {
              setGenerationPercent(100);
              window.location.href = event.redirectUrl ?? `/dashboard/tts/${project.id}`;
              return;
            } else if (event.type === "error") {
              throw new Error(event.message ?? "Generation failed.");
            }
          } catch (parseError) {
            if (parseError instanceof SyntaxError) continue;
            throw parseError;
          }
        }
      }
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Generation failed.");
      setIsGenerating(false);
    }
  }

  const chaptersForRender = Array.from({ length: chapterCount }, (_, index) => ({
    title: project.chapters[index]?.title ?? `Chapter ${index + 1}`,
    audioPath: project.chapters[index]?.audioPath,
  }));

  return (
    <form action={formAction} className="space-y-10" ref={formRef}>
      <input name="projectId" type="hidden" value={project.id ?? ""} />
      <input name="chapterCount" type="hidden" value={chapterCount} />
      <input name="ttsRemoteSettings" type="hidden" value={remoteSettingsJson} />
      <input name="ttsSpeed" type="hidden" value={speed} />

      {state?.error && (
        <div className="rounded-[1.25rem] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {state.error}
        </div>
      )}
      {clientError && (
        <div className="rounded-[1.25rem] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {clientError}
        </div>
      )}
      {flashMessage && (
        <div className="rounded-[1.25rem] border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          {flashMessage}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        {/* Book details */}
        <div className="space-y-6 rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Project details</p>
            <h2 className="mt-3 font-serif text-4xl">Shape the voice</h2>
          </div>

          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input
              className="field"
              defaultValue={project.title}
              id="title"
              name="title"
              placeholder="The Quiet Atlas"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea
              className="field min-h-28"
              defaultValue={project.description}
              id="description"
              name="description"
              placeholder="What is this about?"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="author">
              Author
            </label>
            <input
              className="field"
              defaultValue={project.author}
              id="author"
              name="author"
              placeholder="Author name"
              required
            />
          </div>
        </div>

        {/* TTS settings */}
        <div className="space-y-6 rounded-[1.75rem] border border-white/10 bg-black/15 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">TTS settings</p>
            <h3 className="mt-3 text-xl font-semibold">Voice and provider</h3>
          </div>

          <div>
            <label className="label" htmlFor="chapterCountControl">
              Number of chapters
            </label>
            <input
              className="field"
              id="chapterCountControl"
              max={40}
              min={1}
              onChange={(e) => setChapterCount(Number.parseInt(e.target.value, 10) || 1)}
              type="number"
              value={chapterCount}
            />
          </div>

          <div>
            <label className="label" htmlFor="ttsProviderSelect">
              TTS provider
            </label>
            <select
              className="field"
              id="ttsProviderSelect"
              name="ttsProvider"
              onChange={(e) => setProvider(e.target.value as TtsProvider)}
              value={provider}
            >
              <option className="bg-slate-900 text-white" value="kokoro_local">
                Kokoro (local)
              </option>
              <option className="bg-slate-900 text-white" value="elevenlabs">
                ElevenLabs
              </option>
              <option className="bg-slate-900 text-white" value="openai">
                OpenAI TTS
              </option>
              <option className="bg-slate-900 text-white" value="generic_openai">
                Generic OpenAI-compatible
              </option>
            </select>
          </div>

          {provider === "kokoro_local" ? (
            <>
              <div>
                <label className="label" htmlFor="ttsVoiceSelect">
                  Voice
                </label>
                <select
                  className="field"
                  id="ttsVoiceSelect"
                  name="ttsVoice"
                  onChange={(e) => setVoice(e.target.value)}
                  value={voice}
                >
                  {KOKORO_VOICES.map((v) => (
                    <option className="bg-slate-900 text-white" key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="ttsSpeedRange">
                  Speed —{" "}
                  <span className="text-[var(--sand)]">{speed.toFixed(2)}×</span>
                </label>
                <input
                  className="w-full accent-[var(--sand)]"
                  id="ttsSpeedRange"
                  max={4}
                  min={0.5}
                  onChange={(e) => setSpeed(Number.parseFloat(e.target.value))}
                  step={0.05}
                  type="range"
                  value={speed}
                />
                <div className="mt-1 flex justify-between text-xs text-white/40">
                  <span>0.5×</span>
                  <span>4×</span>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="remoteApiKey">
                  API key
                </label>
                <input
                  autoComplete="off"
                  className="field font-mono text-sm"
                  id="remoteApiKey"
                  onChange={(e) => setRemoteApiKey(e.target.value)}
                  placeholder="sk-..."
                  type="password"
                  value={remoteApiKey}
                />
              </div>

              {provider === "generic_openai" && (
                <div>
                  <label className="label" htmlFor="remoteBaseUrl">
                    Base URL
                  </label>
                  <input
                    className="field font-mono text-sm"
                    id="remoteBaseUrl"
                    onChange={(e) => setRemoteBaseUrl(e.target.value)}
                    placeholder="https://api.yourprovider.com"
                    value={remoteBaseUrl}
                  />
                </div>
              )}

              {provider === "elevenlabs" && (
                <div>
                  <label className="label" htmlFor="remoteVoiceId">
                    Voice ID
                  </label>
                  <input
                    className="field"
                    id="remoteVoiceId"
                    onChange={(e) => setRemoteVoiceId(e.target.value)}
                    placeholder="pNInz6obpgDQGcFmaJgB"
                    value={remoteVoiceId}
                  />
                </div>
              )}

              <div>
                <label className="label" htmlFor="remoteModelId">
                  Model {provider !== "openai" && "(optional)"}
                </label>
                <input
                  className="field"
                  id="remoteModelId"
                  onChange={(e) => setRemoteModelId(e.target.value)}
                  placeholder={provider === "openai" ? "tts-1" : provider === "elevenlabs" ? "eleven_multilingual_v2" : "tts-1"}
                  value={remoteModelId}
                />
              </div>

              <div>
                <label className="label" htmlFor="remoteVoiceName">
                  Voice name
                </label>
                <input
                  className="field"
                  id="remoteVoiceName"
                  name="ttsVoice"
                  onChange={(e) => setVoice(e.target.value)}
                  placeholder={provider === "openai" ? "alloy" : "voice name or ID"}
                  value={voice}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Chapters */}
      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Content</p>
            <h2 className="mt-2 text-2xl font-semibold">Chapters</h2>
            <p className="mt-2 text-sm text-white/60">
              Paste text directly or upload .txt / .md files. Use batch select to map multiple files at once.
            </p>
          </div>

          <div className="shrink-0 space-y-2">
            <label className="label text-xs" htmlFor="batchTextFiles">
              Batch select .txt / .md
            </label>
            <input
              accept=".txt,.md,text/plain,text/markdown"
              className="field text-xs"
              id="batchTextFiles"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setBatchTextFiles(files);
                e.target.value = "";
              }}
              type="file"
            />
            {batchTextFiles.length > 0 && (
              <p className="text-xs text-white/60">
                {batchMapping.matchedCount} of {batchTextFiles.length} file(s) matched — applying…
              </p>
            )}
            {batchMapping.unmatched.length > 0 && (
              <p className="text-xs text-amber-400/80">
                Unmatched: {batchMapping.unmatched.join(", ")}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {chaptersForRender.map((chapter, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list
            <div key={index} className="rounded-2xl border border-white/8 bg-black/10 p-5">
              {/* Hidden form fields for this chapter */}
              <input
                name={`chapterTextContent-${index}`}
                type="hidden"
                value={chapterTexts[index] ?? ""}
              />
              <input
                name={`chapterTextFileName-${index}`}
                type="hidden"
                value={chapterFileNames[index] ?? ""}
              />
              <input
                name={`chapterTextExisting-${index}`}
                type="hidden"
                value={project.chapters[index]?.textContent ?? ""}
              />
              <input
                name={`chapterTextFileNameExisting-${index}`}
                type="hidden"
                value={project.chapters[index]?.textFileName ?? ""}
              />

              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--sand)]/20 text-xs font-bold text-[var(--sand)]">
                  {index + 1}
                </span>
                <input
                  className="field flex-1 py-2 text-sm"
                  defaultValue={chapter.title}
                  name={`chapterTitle-${index}`}
                  placeholder={`Chapter ${index + 1} title`}
                />
                {chapter.audioPath && (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-400">
                    Generated
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="label text-xs" htmlFor={`chapterTextFile-${index}`}>
                    Text source
                  </label>
                  {chapterFileNames[index] && (
                    <span className="text-xs text-white/50">{chapterFileNames[index]}</span>
                  )}
                </div>
                <input
                  accept=".txt,.md,text/plain,text/markdown"
                  className="field text-xs"
                  id={`chapterTextFile-${index}`}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const content = await file.text();
                    setChapterTexts((prev) => ({ ...prev, [index]: content }));
                    setChapterFileNames((prev) => ({ ...prev, [index]: file.name }));
                  }}
                  type="file"
                />
                <textarea
                  className="field min-h-32 font-mono text-xs leading-relaxed"
                  onChange={(e) => {
                    const text = e.target.value;
                    setChapterTexts((prev) => ({ ...prev, [index]: text }));
                    setChapterFileNames((prev) => {
                      const next = { ...prev };
                      delete next[index];
                      return next;
                    });
                  }}
                  placeholder="Paste chapter text here, or upload a file above…"
                  value={chapterTexts[index] ?? ""}
                />
                <p className="text-right text-xs text-white/30">
                  {(chapterTexts[index]?.length ?? 0).toLocaleString()} chars
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Actions + generation progress */}
      <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-black/15 p-6">
        {isGenerating && (
          <GenerationProgress
            logs={generationLogs}
            logsExpanded={logsExpanded}
            onToggleLogs={() => setLogsExpanded((prev) => !prev)}
            percent={generationPercent}
          />
        )}

        {project.status === "GENERATED" &&
          project.generatedOutputPaths &&
          project.generatedOutputPaths.length > 0 &&
          !isGenerating && (
            <div className="space-y-2 rounded-xl border border-[var(--sand)]/20 bg-[var(--sand)]/5 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--sand)]/70">Generated files</p>
              <ul className="space-y-1">
                {project.generatedOutputPaths.map((path, i) => {
                  const filename = path.split("/").pop() ?? path;
                  const downloadHref = path.startsWith("/") ? path : `/${path}`;
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable list
                    <li key={i}>
                      <a
                        className="text-sm text-[var(--sand)] underline-offset-4 hover:underline"
                        download
                        href={downloadHref}
                      >
                        {filename}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={isGenerating} type="submit">
            Save draft
          </button>
          {project.id && (
            <button
              className="rounded-[0.875rem] border border-[var(--teal)]/30 bg-[var(--teal)]/10 px-6 py-3 text-sm font-medium text-[var(--teal)] transition-colors hover:bg-[var(--teal)]/20 disabled:opacity-50"
              disabled={isGenerating}
              onClick={handleGenerate}
              type="button"
            >
              {isGenerating ? "Generating…" : "Generate TTS"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
