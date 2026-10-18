import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.taglineAr,
    start_url: "/ar",
    display: "standalone",
    background_color: brand.colors.paper,
    theme_color: brand.colors.ink,
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
