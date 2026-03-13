"use client";

import { useActionState } from "react";
import { saveUserAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

type UserFormProps = {
  user?: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "USER";
  } | null;
};

export function UserForm({ user }: UserFormProps) {
  const [state, formAction] = useActionState(saveUserAction, null);

  return (
    <form action={formAction} className="space-y-6">
      <input name="userId" type="hidden" value={user?.id ?? ""} />
      {state?.error && (
        <div className="rounded-[1.25rem] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {state.error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Full name
          </label>
          <input className="field" defaultValue={user?.name ?? ""} id="name" name="name" placeholder="Ada Lovelace" required />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input className="field" defaultValue={user?.email ?? ""} id="email" name="email" placeholder="creator@bookify.local" required type="email" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="role">
            Role
          </label>
          <select className="field" defaultValue={user?.role ?? "USER"} id="role" name="role">
            <option className="bg-slate-900 text-white" value="USER">
              User
            </option>
            <option className="bg-slate-900 text-white" value="ADMIN">
              Admin
            </option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="password">
            {user ? "Set new password" : "Password"}
          </label>
          <input className="field" id="password" name="password" placeholder={user ? "Leave blank to keep current password" : "Create a password"} type="password" />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <SubmitButton idleLabel={user ? "Update user" : "Create user"} pendingLabel="Saving user..." />
        <p className="rounded-full border border-white/10 px-4 py-3 text-sm text-white/60">Admins can create more creators or rotate passwords here.</p>
      </div>
    </form>
  );
}
