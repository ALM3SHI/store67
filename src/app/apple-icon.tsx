import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Favicon generated from the central brand config (digits + colours). */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, background: brand.colors.ink, borderRadius: 40, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", width: 118, height: 118, borderRadius: 999, border: `7px solid #b9bec6`, borderTopColor: "transparent", transform: "rotate(-30deg)" }} />
        <div style={{ position: "absolute", top: 36, right: 36, width: 20, height: 20, borderRadius: 999, background: brand.colors.field }} />
        <div style={{ color: "#fbfaf8", fontSize: brand.markDigits.length > 2 ? 42 : 56, fontWeight: 700, letterSpacing: -1 }}>{brand.markDigits}</div>
      </div>
    ),
    size,
  );
}
