import { describe, expect, it } from "vitest";
import { normalizeText, stemArabic, editDistance } from "@/lib/search/normalize";
import { buildIndex, search } from "@/lib/search/rank";

const index = buildIndex([
  { id: "mc", name: ["MagCharge 76", "شاحن لاسلكي مغناطيسي"], keywords: ["magsafe wireless charger"], body: ["يثبت خلف الجوال"] },
  { id: "cable", name: ["Braided Cable", "كيبل مضفّر"], keywords: ["usb-c"], body: [] },
  { id: "massager", name: ["Scalp Massager 76", "مدلّك الرأس 76"], keywords: ["مساج الراس مدلك الرأس scalp massager"], body: [] },
  { id: "wallet", name: ["Smart Wallet 76", "المحفظة الذكية 76"], keywords: ["محفظة ذكية محفظة بطاقات smart wallet"], body: [] },
]);

describe("new products", () => {
  it("finds the massager and the wallet in Arabic and English", () => {
    expect(search(index, "مساج الراس")[0]?.id).toBe("massager");
    expect(search(index, "تدليك")[0]?.id).toBe("massager");
    expect(search(index, "head massager")[0]?.id).toBe("massager");
    expect(search(index, "محفظه")[0]?.id).toBe("wallet");
    expect(search(index, "wallet")[0]?.id).toBe("wallet");
  });
});

describe("arabic normalisation", () => {
  it("unifies hamza, ta marbuta, alef maqsura and removes diacritics", () => {
    expect(normalizeText("أَإِآ ة ى")).toBe("ااا ه ي");
    expect(normalizeText("شَاحِنٌ")).toBe("شاحن");
    expect(normalizeText("١٥ واط")).toBe("15 واط");
  });
  it("strips the definite article", () => {
    expect(stemArabic("الشاحن")).toBe("شاحن");
    expect(stemArabic("بالمغناطيس")).toBe("مغناطيس");
  });
  it("computes edit distance with transpositions", () => {
    expect(editDistance("charger", "chagrer")).toBeLessThanOrEqual(2);
    expect(editDistance("abc", "xyz", 1)).toBeGreaterThan(1);
  });
});

describe("search ranking", () => {
  it("finds the product with Arabic variants", () => {
    expect(search(index, "الشاحن")[0]?.id).toBe("mc");
    expect(search(index, "مغناطيسية")[0]?.id).toBe("mc");
    expect(search(index, "شاحن لاسلكى")[0]?.id).toBe("mc");
  });
  it("matches across languages via synonyms", () => {
    expect(search(index, "شاحن ماغ سيف")[0]?.id).toBe("mc");
    expect(search(index, "charger")[0]?.id).toBe("mc");
  });
  it("tolerates small typos", () => {
    expect(search(index, "magchrge")[0]?.id).toBe("mc");
    expect(search(index, "wirelss")[0]?.id).toBe("mc");
  });
  it("prefix matching while typing", () => {
    expect(search(index, "mag")[0]?.id).toBe("mc");
    expect(search(index, "كيب")[0]?.id).toBe("cable");
  });
  it("returns nothing for unrelated queries", () => {
    expect(search(index, "ثلاجة")).toHaveLength(0);
    expect(search(index, "   ")).toHaveLength(0);
  });
});
