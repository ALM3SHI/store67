"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-ink btn-sm">
      <Printer size={15} /> طباعة
    </button>
  );
}
