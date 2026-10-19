import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { answerFromFaq, aiConfigured } from "@/services/assistant";

beforeAll(async () => {
  await seedDatabase(await getDb());
});

describe("FAQ assistant (no AI key configured)", () => {
  it("is not presented as AI without a key", () => expect(aiConfigured()).toBe(false));

  it("answers from real store data", async () => {
    expect(await answerFromFaq("كم تكلفة الشحن؟", "ar")).toContain("25");
    expect(await answerFromFaq("هل محوّل الطاقة مرفق؟", "ar")).toContain("لا");
    expect(await answerFromFaq("كم السعر", "ar")).toContain("149");
    expect(await answerFromFaq("Is a power adapter included?", "en")).toMatch(/^No/);
  });

  it("refuses to guess when the data doesn't cover the question", async () => {
    expect(await answerFromFaq("هل يدعم الشحن السريع 50 واط", "ar")).toBeNull();
    expect(await answerFromFaq("هل يدعم بلوتوث وتطبيق جوال", "ar")).toBeNull();
    // The massager FAQ honestly covers water use, so that question is answered from data
    expect(await answerFromFaq("هل هو مقاوم للماء", "ar")).toContain("الماء");
  });
});
