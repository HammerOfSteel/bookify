import { notFound } from "next/navigation";
import { UserForm } from "@/components/user-form";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type UserPageProps = {
  params: Promise<{ id: string }>;
};

export default async function UserPage({ params }: UserPageProps) {
  await requireAdmin();

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Edit user</p>
        <h1 className="mt-3 font-serif text-5xl">{user.name}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Adjust role, email, or password for this creator account.</p>
      </div>
      <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
        <UserForm
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          }}
        />
      </div>
    </div>
  );
}
