import Link from "next/link";
import { BookOpenText, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { DeleteButton } from "@/components/delete-button";
import { deleteEbookAction } from "@/app/actions";

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

export default async function EbooksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const isAdmin = session.user.role === "ADMIN";

  const statusFilter = params.status && ["DRAFT", "READY", "GENERATED"].includes(params.status.toUpperCase())
    ? params.status.toUpperCase()
    : undefined;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const perPage = 12;
  const skip = (page - 1) * perPage;

  const ownershipFilter = isAdmin ? {} : { ownerId: session.user.id };
  const whereFilter = statusFilter
    ? { ...ownershipFilter, status: statusFilter as "DRAFT" | "READY" | "GENERATED" }
    : ownershipFilter;

  const [ebooks, total] = await Promise.all([
    prisma.ebook.findMany({
      where: whereFilter,
      include: { owner: { select: { name: true } }, _count: { select: { chapters: true } } },
      orderBy: { updatedAt: "desc" },
      skip,
      take: perPage,
    }),
    prisma.ebook.count({ where: whereFilter }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Your workspace</p>
          <h1 className="mt-3 font-serif text-5xl">Ebooks</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">
            {total} ebook{total !== 1 ? "s" : ""} in your library.
          </p>
        </div>
        <Link className="btn-primary" href="/dashboard/ebooks/new">
          <Plus className="size-4" />
          New ebook
        </Link>
      </section>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[undefined, "DRAFT", "READY", "GENERATED"].map((s) => {
          const label = s ? STATUS_LABELS[s] : "All";
          const isActive = statusFilter === s;
          const href = s ? `/dashboard/ebooks?status=${s}` : "/dashboard/ebooks";

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

      {ebooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-6 rounded-[2rem] border border-dashed border-white/10 py-20">
          <BookOpenText className="size-12 text-white/20" />
          <div className="text-center">
            <p className="font-semibold text-white/60">No ebooks yet</p>
            <p className="mt-2 text-sm text-white/40">Start your first manuscript project.</p>
          </div>
          <Link className="btn-primary" href="/dashboard/ebooks/new">
            Create first ebook
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ebooks.map((ebook) => (
            <div
              key={ebook.id}
              className="group relative rounded-[1.75rem] border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/8"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{ebook.title}</p>
                  <p className="mt-1 text-sm text-white/60">{ebook.author}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${STATUS_COLORS[ebook.status]}`}
                >
                  {STATUS_LABELS[ebook.status]}
                </span>
              </div>

              {ebook.description && (
                <p className="mt-3 line-clamp-2 text-sm text-white/50">{ebook.description}</p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-4 text-xs text-white/40">
                  <span>{ebook._count.chapters} chapter{ebook._count.chapters !== 1 ? "s" : ""}</span>
                  {isAdmin && <span>{ebook.owner.name}</span>}
                </div>
                <p className="text-xs text-white/40">Updated {formatDate(ebook.updatedAt)}</p>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Link
                  href={`/dashboard/ebooks/${ebook.id}`}
                  className="flex-1 rounded-xl border border-white/10 py-2 text-center text-sm text-white/80 transition hover:border-white/20 hover:bg-white/5"
                >
                  Edit
                </Link>
                <DeleteButton
                  id={ebook.id}
                  label={ebook.title}
                  action={deleteEbookAction}
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
              href={`/dashboard/ebooks?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
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
              href={`/dashboard/ebooks?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
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
