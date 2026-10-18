"use client";
import { useEffect } from "react";
import { track } from "@/components/analytics/track";

export function ViewItem({ id, name, value }: { id: string; name: string; value: number }) {
  useEffect(() => {
    track("view_item", { value, currency: "SAR", items: [{ item_id: id, item_name: name }] });
  }, [id, name, value]);
  return null;
}
