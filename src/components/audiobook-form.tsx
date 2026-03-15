"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { flushSync, useFormStatus } from "react-dom";
import { saveAudiobookAction } from "@/app/actions";

const MAX_SERVER_ACTION_PAYLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const PAYLOAD_SAFETY_BUFFER_BYTES = 50 * 1024 * 1024;
const MAX_SELECTED_UPLOAD_BYTES = MAX_SERVER_ACTION_PAYLOAD_BYTES - PAYLOAD_SAFETY_BUFFER_BYTES;
const MP3_ESTIMATE_RATIO = 0.25;
const AUDIOBOOK_FLASH_KEY = "bookify:audiobook-flash";

type AudiobookFormProps = {
  audiobook?: {
    id?: string;
    title: string;
    description: string;
    author: string;
    releaseDate: string;
    metadata: string;
    chapterCount: number;
    coverImagePath?: string | null;
    outputPreference: "MP4_YOUTUBE_FAST" | "M4B_FAST";
    status?: string;
    generatedOutputPath?: string | null;
    generatedTimestampPath?: string | null;
    chapters: Array<{
      title: string;
      audioPath?: string | null;
      audioOriginalName?: string | null;
    }>;
  };
};

const emptyAudiobook = {
  title: "",
  description: "",
  author: "",
  releaseDate: "",
  metadata: "",
  chapterCount: 3,
  outputPreference: "MP4_YOUTUBE_FAST" as const,
  chapters: [{ title: "Introduction" }, { title: "Chapter 1" }, { title: "Chapter 2" }],
};

type ExistingChapter = {
  title: string;
  audioPath?: string | null;
  audioOriginalName?: string | null;
};

type StagedUpload = {
  path: string;
  originalName: string;
};

type UploadProgressState = {
  phase: "uploading" | "submitting";
  current: number;
  total: number;
  message: string;
};

function getDisplayFileName(chapter?: ExistingChapter | null) {
  if (!chapter?.audioPath) {
    return null;
  }

  if (chapter.audioOriginalName) {
    return chapter.audioOriginalName;
  }

  const rawName = chapter.audioPath.split("/").pop() ?? chapter.audioPath;
  return decodeURIComponent(rawName);
}

type BatchMappingResult = {
  prologue?: string;
  epilogue?: string;
  chapters: Record<string, string>;
  unmatched: string[];
  matchedCount: number;
};

function splitExistingChapters(chapters: ExistingChapter[]) {
  const next = [...chapters];
  let prologue: ExistingChapter | null = null;
  let epilogue: ExistingChapter | null = null;

  if (next[0] && /prologue/i.test(next[0].title)) {
    prologue = next.shift() ?? null;
  }

  if (next[next.length - 1] && /epilogue/i.test(next[next.length - 1].title)) {
    epilogue = next.pop() ?? null;
  }

  return { prologue, epilogue, chapters: next };
}

function inferBatchMapping(files: File[], chapterCount: number, includePrologue: boolean, includeEpilogue: boolean): BatchMappingResult {
  const result: BatchMappingResult = {
    chapters: {},
    unmatched: [],
    matchedCount: 0,
  };

  for (const file of files) {
    const lower = file.name.toLowerCase();

    if (includePrologue && !result.prologue && /prologue/.test(lower)) {
      result.prologue = file.name;
      result.matchedCount += 1;
      continue;
    }

    if (includeEpilogue && !result.epilogue && /epilogue/.test(lower)) {
      result.epilogue = file.name;
      result.matchedCount += 1;
      continue;
    }

    const match = lower.match(/(?:chapter|ch)[\s._-]*(\d{1,3})/i);
    if (!match) {
      result.unmatched.push(file.name);
      continue;
    }

    const chapterNumber = Number.parseInt(match[1], 10);
    if (chapterNumber < 1 || chapterNumber > chapterCount) {
      result.unmatched.push(file.name);
      continue;
    }

    const key = String(chapterNumber);
    if (!result.chapters[key]) {
      result.chapters[key] = file.name;
      result.matchedCount += 1;
    } else {
      result.unmatched.push(file.name);
    }
  }

  return result;
}

function planBatches(totalBytes: number, maxBytes: number) {
  if (totalBytes <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(totalBytes / maxBytes));
}

function toMb(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

function ProgressBar({ progress }: { progress: UploadProgressState | null }) {
  const { pending } = useFormStatus();

  if (!progress && !pending) {
    return null;
  }

  const percentage = progress
    ? Math.max(5, Math.min(100, Math.round((progress.current / Math.max(progress.total, 1)) * 100)))
    : 100;

  const message = progress ? progress.message : "Submitting draft save...";

  return (
    <div className="space-y-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-[var(--sand)] transition-all duration-300" style={{ width: `${percentage}%` }} />
      </div>
      <p className="text-xs text-white/70">{message}</p>
    </div>
  );
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
            <span className="text-xs text-white/70">Generating audiobook…</span>
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

export function AudiobookForm({ audiobook = emptyAudiobook }: AudiobookFormProps) {
  const existing = splitExistingChapters(audiobook.chapters);
  const formRef = useRef<HTMLFormElement>(null);
  const saveSubmitRef = useRef<HTMLButtonElement>(null);
  const [state, formAction] = useActionState(saveAudiobookAction, null);
  const [chapterCount, setChapterCount] = useState(Math.max(existing.chapters.length || audiobook.chapterCount || 1, 1));
  const [selectedAudioSizes, setSelectedAudioSizes] = useState<Record<string, number>>({});
  const [coverImageSize, setCoverImageSize] = useState(0);
  const [includePrologue, setIncludePrologue] = useState(Boolean(existing.prologue));
  const [includeEpilogue, setIncludeEpilogue] = useState(Boolean(existing.epilogue));
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [stagedUploads, setStagedUploads] = useState<Record<string, StagedUpload>>({});
  const [progress, setProgress] = useState<UploadProgressState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPercent, setGenerationPercent] = useState(0);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const batchMapping = useMemo(
    () => inferBatchMapping(batchFiles, chapterCount, includePrologue, includeEpilogue),
    [batchFiles, chapterCount, includePrologue, includeEpilogue],
  );

  const selectedAudioBytes = Object.values(selectedAudioSizes).reduce((total, size) => total + size, 0);
  const batchUploadBytes = batchFiles.reduce((total, file) => total + file.size, 0);
  const selectedUploadBytes = selectedAudioBytes + batchUploadBytes + coverImageSize;
  const estimatedConvertedBytes = Math.round((selectedAudioBytes + batchUploadBytes) * MP3_ESTIMATE_RATIO);
  const selectedUploadMb = toMb(selectedUploadBytes);
  const estimatedConvertedMb = toMb(estimatedConvertedBytes);
  const maxSelectedUploadMb = toMb(MAX_SELECTED_UPLOAD_BYTES);
  const payloadTooLarge = selectedUploadBytes > MAX_SELECTED_UPLOAD_BYTES;
  const recommendedBatches = planBatches(selectedUploadBytes, MAX_SELECTED_UPLOAD_BYTES);
  const mappedBatchSummary = JSON.stringify({
    prologue: batchMapping.prologue,
    epilogue: batchMapping.epilogue,
    chapters: batchMapping.chapters,
  });

  useEffect(() => {
    const message = window.sessionStorage.getItem(AUDIOBOOK_FLASH_KEY);

    if (!message) {
      return;
    }

    setFlashMessage(message);
    window.sessionStorage.removeItem(AUDIOBOOK_FLASH_KEY);
  }, []);

  function updateAudioSelection(slot: string, fileList: FileList | null) {
    setSelectedAudioSizes((current) => {
      const next = { ...current };
      const first = fileList?.[0];

      if (!first) {
        delete next[slot];
      } else {
        next[slot] = first.size;
      }

      return next;
    });
  }

  async function uploadAudioFile(file: File, current: number, total: number) {
    setProgress({
      phase: "uploading",
      current,
      total,
      message: `Converting and staging audio ${current}/${total} (${toMb(file.size)} MB source)...`,
    });

    const payload = new FormData();
    payload.append("file", file, file.name);

    const response = await fetch("/api/audiobooks/upload-audio", {
      method: "POST",
      body: payload,
    });

    const body = (await response.json()) as { error?: string; path?: string; originalName?: string };
    if (!response.ok || !body.path || !body.originalName) {
      throw new Error(body.error || "Failed to upload audio file.");
    }

    return {
      path: body.path,
      originalName: body.originalName,
    } satisfies StagedUpload;
  }

  async function handlePrepareAndSubmit() {
    if (!formRef.current) {
      return;
    }

    try {
      setClientError(null);

      const source = new FormData(formRef.current);
      const batchByName = new Map(
        source
          .getAll("batchAudioFiles")
          .filter((entry): entry is File => entry instanceof File && entry.size > 0)
          .map((file) => [file.name, file]),
      );

      const queued: Array<{ slot: string; file: File }> = [];

      if (includePrologue) {
        const direct = source.get("prologueAudio");
        const mapped = batchMapping.prologue ? batchByName.get(batchMapping.prologue) ?? null : null;
        const selected = direct instanceof File && direct.size > 0 ? direct : mapped;
        if (selected) {
          queued.push({ slot: "prologue", file: selected });
        }
      }

      for (let index = 0; index < chapterCount; index += 1) {
        const direct = source.get(`chapterAudio-${index}`);
        const mapped = batchMapping.chapters[String(index + 1)] ? batchByName.get(batchMapping.chapters[String(index + 1)]) ?? null : null;
        const selected = direct instanceof File && direct.size > 0 ? direct : mapped;
        if (selected) {
          queued.push({ slot: `chapter-${index}`, file: selected });
        }
      }

      if (includeEpilogue) {
        const direct = source.get("epilogueAudio");
        const mapped = batchMapping.epilogue ? batchByName.get(batchMapping.epilogue) ?? null : null;
        const selected = direct instanceof File && direct.size > 0 ? direct : mapped;
        if (selected) {
          queued.push({ slot: "epilogue", file: selected });
        }
      }

      const nextStaged: Record<string, StagedUpload> = {};
      for (let index = 0; index < queued.length; index += 1) {
        const staged = await uploadAudioFile(queued[index].file, index + 1, queued.length);
        nextStaged[queued[index].slot] = staged;
      }

      flushSync(() => {
        setStagedUploads((current) => ({ ...current, ...nextStaged }));
      });

      setProgress({
        phase: "submitting",
        current: Math.max(queued.length, 1),
        total: Math.max(queued.length, 1),
        message: "All files staged. Saving draft...",
      });

      const fileInputs = formRef.current.querySelectorAll("input[type='file']");
      fileInputs.forEach((input) => {
        const control = input as HTMLInputElement;
        if (control.name === "coverImage") {
          return;
        }

        control.value = "";
      });

      setBatchFiles([]);
      setSelectedAudioSizes({});

      await new Promise((resolve) => window.setTimeout(resolve, 0));

      const stagedCount = Object.keys(nextStaged).length;
      window.sessionStorage.setItem(
        AUDIOBOOK_FLASH_KEY,
        `Staged audio committed to the draft. Saved ${stagedCount} uploaded file${stagedCount === 1 ? "" : "s"}.`,
      );

      if (saveSubmitRef.current) {
        formRef.current.requestSubmit(saveSubmitRef.current);
      }
    } catch (error) {
      setProgress(null);
      setClientError(error instanceof Error ? error.message : "Failed to stage audio files.");
    }
  }

  async function handleGenerate() {
    if (!audiobook.id) return;

    setIsGenerating(true);
    setGenerationPercent(0);
    setGenerationLogs([]);
    setLogsExpanded(false);
    setClientError(null);

    try {
      const response = await fetch(`/api/audiobooks/${audiobook.id}/generate`, { method: "POST" });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({ error: "Generation failed to start." })) as { error?: string };
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
            const event = JSON.parse(line) as { type: string; percent?: number; message?: string; redirectUrl?: string };

            if (event.type === "progress") {
              setGenerationPercent(event.percent ?? 0);
              if (event.message) {
                setGenerationLogs((prev) => [...prev, event.message!]);
              }
            } else if (event.type === "done") {
              setGenerationPercent(100);
              window.location.href = event.redirectUrl ?? `/dashboard/audiobooks/${audiobook.id}`;
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

  return (
    <form action={formAction} className="space-y-10" ref={formRef}>
      <input name="audiobookId" type="hidden" value={audiobook.id ?? ""} />
      <input name="chapterCount" type="hidden" value={chapterCount} />
      <input name="batchAudioMapping" type="hidden" value={mappedBatchSummary} />
      <input name="audioConversionFormat" type="hidden" value="mp3" />
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

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Audiobook details</p>
            <h2 className="mt-3 font-serif text-4xl">Shape the listening experience</h2>
          </div>

          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input className="field" defaultValue={audiobook.title} id="title" name="title" placeholder="The Quiet Atlas" required />
          </div>

          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea className="field min-h-36" defaultValue={audiobook.description} id="description" name="description" placeholder="What makes this audiobook special?" required />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="author">
                Author
              </label>
              <input className="field" defaultValue={audiobook.author} id="author" name="author" placeholder="Author name" required />
            </div>
            <div>
              <label className="label" htmlFor="releaseDate">
                Release date
              </label>
              <input className="field" defaultValue={audiobook.releaseDate} id="releaseDate" name="releaseDate" type="date" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="metadata">
              Metadata JSON
            </label>
            <textarea className="field min-h-32 font-mono text-sm" defaultValue={audiobook.metadata} id="metadata" name="metadata" placeholder='{"genre":"Fantasy","language":"English"}' />
          </div>
        </div>

        <div className="space-y-6 rounded-[1.75rem] border border-white/10 bg-black/15 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Production</p>
            <h3 className="mt-3 text-xl font-semibold">Assets and output</h3>
          </div>

          <div>
            <label className="label" htmlFor="chapterCountControl">
              Number of chapters
            </label>
            <input
              className="field"
              id="chapterCountControl"
              max={30}
              min={1}
              onChange={(event) => setChapterCount(Number.parseInt(event.target.value, 10) || 1)}
              type="number"
              value={chapterCount}
            />
          </div>

          <div>
            <label className="label" htmlFor="outputPreference">
              Generate as
            </label>
            <select className="field" defaultValue={audiobook.outputPreference} id="outputPreference" name="outputPreference">
              <option className="bg-slate-900 text-white" value="MP4_YOUTUBE_FAST">
                MP4 (YouTube fast)
              </option>
              <option className="bg-slate-900 text-white" value="M4B_FAST">
                M4B (audiobook native)
              </option>
            </select>
            <p className="mt-2 text-xs text-white/60">YouTube fast keeps a static cover image and writes chapter timestamps as a downloadable text file.</p>
          </div>

          <div>
            <label className="label" htmlFor="coverImage">
              Cover art
            </label>
            <input
              accept="image/*"
              className="field"
              id="coverImage"
              name="coverImage"
              onChange={(event) => setCoverImageSize(event.target.files?.[0]?.size ?? 0)}
              type="file"
            />
            {audiobook.coverImagePath ? (
              <a className="mt-3 inline-block text-sm text-[var(--sand)] underline" href={audiobook.coverImagePath} target="_blank">
                Current cover image
              </a>
            ) : null}
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
            Audio conversion format: <span className="font-semibold text-[var(--sand)]">MP3</span>
            <p className="mt-1 text-xs text-white/60">All selected audio files are converted to MP3 during staged file-by-file upload before save/generate submit.</p>
          </div>

          {audiobook.generatedOutputPath ? (
            <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-50">
              <p className="font-semibold">Generated output ready</p>
              <a className="mt-2 inline-block text-[var(--sand)] underline" href={audiobook.generatedOutputPath} target="_blank">
                Download latest output
              </a>
              {audiobook.generatedTimestampPath ? (
                <a className="mt-2 block text-[var(--sand)] underline" href={audiobook.generatedTimestampPath} target="_blank">
                  Download timestamps
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Chapter builder</p>
            <h3 className="mt-3 font-serif text-3xl">Upload narration chapter by chapter</h3>
          </div>
          <p className="max-w-md text-sm leading-7 text-white/60">You can save this page as a draft at any point. Upload new audio files only for the chapters you want to replace.</p>
        </div>

        <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
          <p className="text-sm font-semibold text-white/80">Optional segments</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input checked={includePrologue} name="includePrologue" onChange={(event) => setIncludePrologue(event.target.checked)} type="checkbox" />
              Include prologue
            </label>
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input checked={includeEpilogue} name="includeEpilogue" onChange={(event) => setIncludeEpilogue(event.target.checked)} type="checkbox" />
              Include epilogue
            </label>
          </div>

          {includePrologue ? (
            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
              <div>
                <label className="label" htmlFor="prologueTitle">
                  Prologue title
                </label>
                <input className="field" defaultValue={existing.prologue?.title ?? "Prologue"} id="prologueTitle" name="prologueTitle" />
                <input name="prologueAudioExisting" type="hidden" value={existing.prologue?.audioPath ?? ""} />
                <input name="prologueAudioOriginalNameExisting" type="hidden" value={existing.prologue?.audioOriginalName ?? ""} />
                <input name="prologueAudioStaged" type="hidden" value={stagedUploads.prologue?.path ?? ""} />
                <input name="prologueAudioOriginalNameStaged" type="hidden" value={stagedUploads.prologue?.originalName ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="prologueAudio">
                  Prologue audio
                </label>
                <input accept="audio/*" className="field" id="prologueAudio" name="prologueAudio" onChange={(event) => updateAudioSelection("prologue", event.target.files)} type="file" />
                {existing.prologue?.audioPath ? (
                  <>
                    <a className="mt-3 inline-block text-sm text-[var(--sand)] underline" href={existing.prologue.audioPath} target="_blank">
                      Current uploaded audio
                    </a>
                    <p className="mt-1 text-xs text-white/60">{getDisplayFileName(existing.prologue)}</p>
                  </>
                ) : null}
                {batchMapping.prologue ? <p className="mt-2 text-xs text-[var(--sand)]">Batch-mapped: {batchMapping.prologue}</p> : null}
              </div>
            </div>
          ) : null}

          {includeEpilogue ? (
            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
              <div>
                <label className="label" htmlFor="epilogueTitle">
                  Epilogue title
                </label>
                <input className="field" defaultValue={existing.epilogue?.title ?? "Epilogue"} id="epilogueTitle" name="epilogueTitle" />
                <input name="epilogueAudioExisting" type="hidden" value={existing.epilogue?.audioPath ?? ""} />
                <input name="epilogueAudioOriginalNameExisting" type="hidden" value={existing.epilogue?.audioOriginalName ?? ""} />
                <input name="epilogueAudioStaged" type="hidden" value={stagedUploads.epilogue?.path ?? ""} />
                <input name="epilogueAudioOriginalNameStaged" type="hidden" value={stagedUploads.epilogue?.originalName ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="epilogueAudio">
                  Epilogue audio
                </label>
                <input accept="audio/*" className="field" id="epilogueAudio" name="epilogueAudio" onChange={(event) => updateAudioSelection("epilogue", event.target.files)} type="file" />
                {existing.epilogue?.audioPath ? (
                  <>
                    <a className="mt-3 inline-block text-sm text-[var(--sand)] underline" href={existing.epilogue.audioPath} target="_blank">
                      Current uploaded audio
                    </a>
                    <p className="mt-1 text-xs text-white/60">{getDisplayFileName(existing.epilogue)}</p>
                  </>
                ) : null}
                {batchMapping.epilogue ? <p className="mt-2 text-xs text-[var(--sand)]">Batch-mapped: {batchMapping.epilogue}</p> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
          <label className="label" htmlFor="batchAudioFiles">
            Batch upload (filename mapping)
          </label>
          <input
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
            className="field"
            id="batchAudioFiles"
            multiple
            name="batchAudioFiles"
            onChange={(event) => setBatchFiles(Array.from(event.target.files ?? []))}
            type="file"
          />
          <p className="mt-2 text-xs text-white/60">Files named like <code>chapter_1</code>, <code>prologue</code>, <code>epilogue</code> are auto-mapped to slots.</p>
          <p className="mt-2 text-xs text-white/60">Mapped: {batchMapping.matchedCount} | Unmatched: {batchMapping.unmatched.length}</p>
          {batchMapping.unmatched.length > 0 ? (
            <p className="mt-1 text-xs text-amber-300">Unmatched files: {batchMapping.unmatched.slice(0, 6).join(", ")}{batchMapping.unmatched.length > 6 ? "..." : ""}</p>
          ) : null}
        </div>

        <div className="mt-8 grid gap-5">
          {Array.from({ length: chapterCount }).map((_, index) => {
            const chapter = existing.chapters[index];
            const batchMappedName = batchMapping.chapters[String(index + 1)];

            return (
              <div key={index} className="rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
                <input name={`chapterAudioExisting-${index}`} type="hidden" value={chapter?.audioPath ?? ""} />
                <input name={`chapterAudioOriginalNameExisting-${index}`} type="hidden" value={chapter?.audioOriginalName ?? ""} />
                <input name={`chapterAudioStaged-${index}`} type="hidden" value={stagedUploads[`chapter-${index}`]?.path ?? ""} />
                <input name={`chapterAudioOriginalNameStaged-${index}`} type="hidden" value={stagedUploads[`chapter-${index}`]?.originalName ?? ""} />
                <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
                  <div>
                    <label className="label" htmlFor={`chapterTitle-${index}`}>
                      Chapter {index + 1} title
                    </label>
                    <input
                      className="field"
                      defaultValue={chapter?.title ?? `Chapter ${index + 1}`}
                      id={`chapterTitle-${index}`}
                      name={`chapterTitle-${index}`}
                      placeholder={`Chapter ${index + 1}`}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`chapterAudio-${index}`}>
                      Audio file
                    </label>
                    <input
                      accept="audio/*"
                      className="field"
                      id={`chapterAudio-${index}`}
                      name={`chapterAudio-${index}`}
                      onChange={(event) => updateAudioSelection(`chapter-${index}`, event.target.files)}
                      type="file"
                    />
                    {chapter?.audioPath ? (
                      <>
                        <a className="mt-3 inline-block text-sm text-[var(--sand)] underline" href={chapter.audioPath} target="_blank">
                          Current uploaded audio
                        </a>
                        <p className="mt-1 text-xs text-white/60">{getDisplayFileName(chapter)}</p>
                      </>
                    ) : null}
                    {batchMappedName ? <p className="mt-2 text-xs text-[var(--sand)]">Batch-mapped: {batchMappedName}</p> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          className="btn-primary"
          disabled={Boolean(progress)}
          onClick={async (event) => {
            event.preventDefault();
            await handlePrepareAndSubmit();
          }}
          type="button"
        >
          Save draft
        </button>
        <button
          className="btn-secondary"
          disabled={Boolean(progress) || isGenerating || !audiobook.id}
          onClick={(event) => {
            event.preventDefault();
            handleGenerate();
          }}
          type="button"
        >
          {isGenerating ? `Generating… ${generationPercent}%` : "Generate"}
        </button>
        <span className="rounded-full border border-white/10 px-4 py-3 text-sm text-white/60">Status: {audiobook.status ?? "DRAFT"}</span>
      </div>

      {!audiobook.id ? <p className="text-sm text-white/60">Save draft first to enable generate.</p> : null}

      <button className="hidden" name="intent" ref={saveSubmitRef} type="submit" value="save" />

      {isGenerating ? (
        <GenerationProgress
          logs={generationLogs}
          logsExpanded={logsExpanded}
          onToggleLogs={() => setLogsExpanded((v) => !v)}
          percent={generationPercent}
        />
      ) : (
        <ProgressBar progress={progress} />
      )}

      <p className={`text-sm ${payloadTooLarge ? "text-red-300" : "text-white/60"}`}>
        Selected source payload: {selectedUploadMb} MB. Estimated MP3 output: {estimatedConvertedMb} MB. Save draft stages uploads first; generate uses already-saved draft data only.
      </p>

      {payloadTooLarge ? (
        <p className="text-sm text-amber-300">
          This source selection is too large for a single request. Staging uploads run file-by-file, and the estimated safe plan is {recommendedBatches} batches worth of source files.
        </p>
      ) : null}
    </form>
  );
}
