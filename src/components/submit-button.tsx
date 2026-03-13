"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
};

export function SubmitButton({ idleLabel, pendingLabel, className, name, value, disabled = false }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className ?? "btn-primary"} disabled={pending || disabled} name={name} type="submit" value={value}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
