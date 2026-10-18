"use client";
import { useActionState } from "react";
import { FormMessage, type ActionState } from "./ui";

/** Wraps a server action with inline success/error feedback. */
export function ActionForm({
  action,
  children,
  className,
  testId,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "space-y-3"} data-testid={testId}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}
