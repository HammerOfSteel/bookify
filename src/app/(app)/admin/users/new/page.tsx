import { UserForm } from "@/components/user-form";
import { requireAdmin } from "@/lib/auth";

export default async function NewUserPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">New user</p>
        <h1 className="mt-3 font-serif text-5xl">Create a creator account</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Add a new admin or standard user who can start building books immediately.</p>
      </div>
      <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
        <UserForm />
      </div>
    </div>
  );
}
