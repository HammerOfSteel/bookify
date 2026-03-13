import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { DeleteButton } from "@/components/delete-button";
import { deleteUserAction } from "@/app/actions";

export default async function AdminUsersPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: { audiobooks: true, ebooks: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Admin users</p>
          <h1 className="mt-3 font-serif text-5xl">Manage creators</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Create users, change roles, and update access from one place.</p>
        </div>
        <Link className="btn-primary" href="/admin/users/new">
          Create user
        </Link>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5">
        <div className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.7fr_auto] gap-4 border-b border-white/10 px-6 py-4 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Projects</span>
          <span>Created</span>
          <span />
        </div>
        {users.map((user) => (
          <div key={user.id} className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.7fr_auto] items-center gap-4 border-b border-white/8 px-6 py-5 text-sm last:border-b-0">
            <span className="font-semibold">
              <Link className="hover:text-[var(--sand)] transition" href={`/admin/users/${user.id}`}>{user.name}</Link>
            </span>
            <span className="text-white/70">{user.email}</span>
            <span className="text-[var(--sand)]">{user.role}</span>
            <span className="text-white/70">{user._count.audiobooks + user._count.ebooks}</span>
            <span className="text-white/50">{formatDate(user.createdAt)}</span>
            <DeleteButton id={user.id} label={user.name ?? user.email} action={deleteUserAction} />
          </div>
        ))}
      </div>
    </div>
  );
}
