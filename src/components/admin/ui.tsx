"use client";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionState = { ok: boolean; message: string; errors?: Record<string, string> } | null;

export function SubmitButton({ children, className, variant = "primary", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ink" | "ghost" | "danger" }) {
  const { pending } = useFormStatus();
  const v = { primary: "btn-primary", ink: "btn-ink", ghost: "btn-ghost", danger: "bg-danger text-white hover:opacity-90" }[variant];
  return (
    <button type="submit" disabled={pending || rest.disabled} className={cn("btn btn-sm", v, className)} {...rest}>
      {pending ? <LoaderCircle size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("rounded-xl px-3 py-2 text-sm", state.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger")} data-testid="form-message">
      {state.message}
    </p>
  );
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const e = state?.errors?.[name];
  return e ? <p className="mt-1 text-xs text-danger">{e}</p> : null;
}
