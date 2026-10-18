import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon generated from the central brand config (digits + colours). */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 64, height: 64, background: brand.colors.ink, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", width: 42, height: 42, borderRadius: 999, border: `3px solid #b9bec6`, borderTopColor: "transparent", transform: "rotate(-30deg)" }} />
        <div style={{ position: "absolute", top: 13, right: 13, width: 8, height: 8, borderRadius: 999, background: brand.colors.field }} />
        <div style={{ color: "#fbfaf8", fontSize: brand.markDigits.length > 2 ? 15 : 20, fontWeight: 700, letterSpacing: -1 }}>{brand.markDigits}</div>
      </div>
    ),
    size,
  );
}
