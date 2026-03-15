import Link from "next/link";
import { Mic2, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { DeleteButton } from "@/components/delete-button";
import { deleteTtsProjectAction } from "@/app/actions";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  GENERATED: "Generated",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "text-white/40 border-white/10",
  READY: "text-[var(--teal)] border-[var(--teal)]/30",
  GENERATED: "text-[var(--sand)] border-[var(--sand)]/30",
};

const PROVIDER_LABELS: Record<string, string> = {
  kokoro_local: "Kokoro (local)",
  elevenlabs: "ElevenLabs",
  openai: "OpenAI TTS",
  generic_openai: "Generic OpenAI",
};

export default async function TtsProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const isAdmin = session.user.role === "ADMIN";

  const statusFilter =
    params.status && ["DRAFT", "READY", "GENERATED"].includes(params.status.toUpperCase())
      ? params.status.toUpperCase()
      : undefined;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const perPage = 12;
  const skip = (page - 1) * perPage;

  const ownershipFilter = isAdmin ? {} : { ownerId: session.user.id };
  const whereFilter = statusFilter
    ? { ...ownershipFilter, status: statusFilter as "DRAFT" | "READY" | "GENERATED" }
    : ownershipFilter;

  const [projects, total] = await Promise.all([
    prisma.ttsProject.findMany({
      where: whereFilter,
      include: {
        owner: { select: { name: true } },
        _count: { select: { chapters: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: perPage,
    }),
    prisma.ttsProject.count({ where: whereFilter }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Your workspace</p>
          <h1 className="mt-3 font-serif text-5xl">TTS Projects</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">
            {total} TTS project{total !== 1 ? "s" : ""} in your library.
          </p>
        </div>
        <Link className="btn-primary" href="/dashboard/tts/new">
          <Plus className="size-4" />
          New TTS project
        </Link>
      </section>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[undefined, "DRAFT", "READY", "GENERATED"].map((s) => {
          const label = s ? STATUS_LABELS[s] : "All";
          const isActive = statusFilter === s;
          const href = s ? `/dashboard/tts?status=${s}` : "/dashboard/tts";

          return (
            <Link
              key={label}
              href={href}
              className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.2em] transition ${
                isActive
                  ? "border-[var(--sand)]/50 bg-[var(--sand)]/10 text-[var(--sand)]"
                  : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-6 rounded-[2rem] border border-dashed border-white/10 py-20">
          <Mic2 className="size-12 text-white/20" />
          <div className="text-center">
            <p className="font-semibold text-white/60">No TTS projects yet</p>
            <p className="mt-2 text-sm text-white/40">
              Get started by creating your first text-to-speech project.
            </p>
          </div>
          <Link className="btn-primary" href="/dashboard/tts/new">
            Create first TTS project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative rounded-[1.75rem] border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/8"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{project.title}</p>
                  <p className="mt-1 text-sm text-white/60">{project.author}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${STATUS_COLORS[project.status]}`}
                >
                  {STATUS_LABELS[project.status]}
                </span>
              </div>

              {project.description && (
                <p className="mt-3 line-clamp-2 text-sm text-white/50">{project.description}</p>
              )}

              <div className="mt-3 text-xs text-white/40">
                {PROVIDER_LABELS[project.ttsProvider] ?? project.ttsProvider}
                {" · "}
                {project.ttsVoice}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-4 text-xs text-white/40">
                  <span>
                    {project._count.chapters} chapter
                    {project._count.chapters !== 1 ? "s" : ""}
                  </span>
                  {isAdmin && <span>{project.owner.name}</span>}
                </div>
                <p className="text-xs text-white/40">Updated {formatDate(project.updatedAt)}</p>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Link
                  href={`/dashboard/tts/${project.id}`}
                  className="flex-1 rounded-xl border border-white/10 py-2 text-center text-sm text-white/80 transition hover:border-white/20 hover:bg-white/5"
                >
                  Edit
                </Link>
                <DeleteButton
                  id={project.id}
                  label={project.title}
                  action={deleteTtsProjectAction}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/dashboard/tts?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-white/20 hover:text-white/80"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-white/40">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/dashboard/tts?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-white/20 hover:text-white/80"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
