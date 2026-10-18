import { z } from "zod";
import { normalizeSaudiMobile } from "@/lib/phone";

/** Shared between the checkout form (client) and the order API (server). */
export const cartLineSchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(99),
});

export const cartSchema = z.array(cartLineSchema).min(1).max(30);

export const paymentMethodSchema = z.enum(["moyasar", "cod", "test"]);
export type PaymentMethodId = z.infer<typeof paymentMethodSchema>;

export const nationalAddressRegex = /^[A-Za-z]{4}\d{4}$/;

export const checkoutSchema = z.object({
  idempotencyKey: z.string().min(16).max(80),
  locale: z.enum(["ar", "en"]).default("ar"),
  items: cartSchema,
  couponCode: z.string().trim().toUpperCase().max(40).optional().or(z.literal("")),
  paymentMethod: paymentMethodSchema,
  customer: z.object({
    name: z.string().trim().min(2, "name").max(80, "name"),
    phone: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const n = normalizeSaudiMobile(v);
        if (!n) {
          ctx.addIssue({ code: "custom", message: "phone" });
          return z.NEVER;
        }
        return n;
      }),
    email: z.union([z.literal(""), z.email("email").max(120)]).optional(),
  }),
  address: z.object({
    city: z.string().trim().min(2, "city").max(60),
    district: z.string().trim().min(2, "district").max(80),
    street: z.string().trim().min(3, "street").max(160),
    nationalAddress: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || nationalAddressRegex.test(v), "nationalAddress")
      .optional(),
    postalCode: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{5}$/.test(v), "postalCode")
      .optional(),
    notes: z.string().trim().max(300).optional(),
  }),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutData = z.output<typeof checkoutSchema>;

export const quoteRequestSchema = z.object({
  items: z.array(cartLineSchema).max(30),
  couponCode: z.string().trim().toUpperCase().max(40).optional(),
  city: z.string().trim().max(60).optional(),
  paymentMethod: paymentMethodSchema.optional(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
