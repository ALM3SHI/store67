"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CircleCheck, TriangleAlert, Info, X } from "lucide-react";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string; action?: { label: string; onClick: () => void } };
type Ctx = { push: (t: Omit<Toast, "id">) => void };
const ToastCtx = createContext<Ctx>({ push: () => {} });

export function ToastProvider({ children, closeLabel }: { children: React.ReactNode; closeLabel: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), t.kind === "error" ? 7000 : 3800);
    },
    [dismiss],
  );
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite" role="status">
        {toasts.map((t) => {
          const Icon = t.kind === "success" ? CircleCheck : t.kind === "error" ? TriangleAlert : Info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full max-w-md animate-fade-up items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-porcelain shadow-[0_18px_40px_-18px_rgba(10,14,20,.6)]"
            >
              <Icon size={18} className={t.kind === "success" ? "text-field" : t.kind === "error" ? "text-[#ff9b85]" : "text-metal-300"} aria-hidden />
              <span className="flex-1">{t.message}</span>
              {t.action ? (
                <button className="font-medium text-field underline-offset-4 hover:underline" onClick={t.action.onClick}>
                  {t.action.label}
                </button>
              ) : null}
              <button onClick={() => dismiss(t.id)} aria-label={closeLabel} className="rounded-full p-1 opacity-60 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
