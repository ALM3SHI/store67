import { formatSAR } from "@/lib/money";
import { cityLabel } from "@/lib/saudi-cities";

/* Plain, factual transactional emails. No marketing claims; every value comes
   from the order record. Customer-supplied strings are HTML-escaped. */

export type Lang = "ar" | "en";

export type OrderEmailData = {
  number: string;
  locale: Lang;
  customerName: string;
  createdAt: Date;
  paymentMethod: string;
  paymentStatus: string;
  items: { name: string; variant: string; quantity: number; lineTotalHalalas: number }[];
  subtotalHalalas: number;
  discountHalalas: number;
  shippingHalalas: number;
  codFeeHalalas: number;
  taxHalalas: number;
  totalHalalas: number;
  pricesIncludeTax: boolean;
  address: { city: string; district: string; street: string; nationalAddress?: string };
  orderLink: string;
  tracking?: { number: string; carrier: string | null; url: string | null } | null;
  store: { name: string; email: string; phone: string; whatsapp: string };
};

export type OrderEmailKind = "order_confirmed" | "order_shipped" | "order_delivered" | "order_cancelled";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const copy = {
  ar: {
    order_confirmed: { subject: "تأكيد طلبك {n}", title: "استلمنا طلبك", body: "شكرًا {name}. طلبك رقم {n} مؤكد وسنبدأ تجهيزه." },
    order_shipped: { subject: "طلبك {n} في الطريق", title: "شُحن طلبك", body: "{name}، سلّمنا طلبك رقم {n} لشركة الشحن." },
    order_delivered: { subject: "تم تسليم طلبك {n}", title: "وصل طلبك", body: "{name}، سُجّل طلبك رقم {n} كمُسلَّم. إن كانت لديك أي ملاحظة فراسلنا." },
    order_cancelled: { subject: "إلغاء الطلب {n}", title: "أُلغي طلبك", body: "{name}، أُلغي طلبك رقم {n}. إن كنت دفعت إلكترونيًا فسيُعاد المبلغ وفق سياسة الاسترجاع، ولأي استفسار راسلنا." },
    viewOrder: "عرض الطلب ومتابعته",
    items: "المنتجات",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    shipping: "الشحن",
    free: "مجاني",
    cod: "رسوم الدفع عند الاستلام",
    tax: "ضريبة القيمة المضافة",
    taxIncl: "شامل ضريبة القيمة المضافة",
    total: "الإجمالي",
    payment: "الدفع",
    payCod: "عند الاستلام",
    payOnline: "إلكتروني — مدفوع",
    address: "عنوان التوصيل",
    tracking: "رقم التتبع",
    trackLink: "تتبّع الشحنة",
    help: "تحتاج مساعدة؟",
    footer: "وصلتك هذه الرسالة لأنك طلبت من {store}. لا ترد على أرقام أو روابط تطلب بيانات بطاقتك — لن نطلبها منك أبدًا.",
  },
  en: {
    order_confirmed: { subject: "Order {n} confirmed", title: "We've got your order", body: "Thank you, {name}. Order {n} is confirmed and we'll start preparing it." },
    order_shipped: { subject: "Order {n} is on its way", title: "Your order has shipped", body: "{name}, order {n} has been handed to the carrier." },
    order_delivered: { subject: "Order {n} delivered", title: "Your order arrived", body: "{name}, order {n} is marked as delivered. If anything isn't right, just reply to us." },
    order_cancelled: { subject: "Order {n} cancelled", title: "Your order was cancelled", body: "{name}, order {n} has been cancelled. If you paid online, the amount is refunded under our returns policy. Contact us with any questions." },
    viewOrder: "View and track your order",
    items: "Items",
    subtotal: "Subtotal",
    discount: "Discount",
    shipping: "Shipping",
    free: "Free",
    cod: "Cash on delivery fee",
    tax: "VAT",
    taxIncl: "Includes VAT",
    total: "Total",
    payment: "Payment",
    payCod: "Cash on delivery",
    payOnline: "Online — paid",
    address: "Delivery address",
    tracking: "Tracking number",
    trackLink: "Track shipment",
    help: "Need help?",
    footer: "You received this because you ordered from {store}. We will never ask for your card details by message or phone.",
  },
} as const;

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

export function renderOrderEmail(kind: OrderEmailKind, d: OrderEmailData): { subject: string; html: string; text: string } {
  const L = d.locale === "en" ? "en" : "ar";
  const c = copy[L];
  const k = c[kind];
  const vars = { n: d.number, name: d.customerName.split(" ")[0] ?? d.customerName, store: d.store.name };
  const subject = `${fill(k.subject, vars)} — ${d.store.name}`;
  const money = (h: number) => formatSAR(h, L);
  const dir = L === "ar" ? "rtl" : "ltr";
  const align = L === "ar" ? "right" : "left";
  const opp = L === "ar" ? "left" : "right";

  const rows: [string, string][] = [[c.subtotal, money(d.subtotalHalalas)]];
  if (d.discountHalalas > 0) rows.push([c.discount, `− ${money(d.discountHalalas)}`]);
  rows.push([c.shipping, d.shippingHalalas === 0 ? c.free : money(d.shippingHalalas)]);
  if (d.codFeeHalalas > 0) rows.push([c.cod, money(d.codFeeHalalas)]);
  if (d.taxHalalas > 0 && !d.pricesIncludeTax) rows.push([c.tax, money(d.taxHalalas)]);

  const addressLine = [d.address.street, d.address.district, cityLabel(d.address.city, L), d.address.nationalAddress].filter(Boolean).join(L === "ar" ? "، " : ", ");
  const payLine = d.paymentMethod === "cod" ? c.payCod : d.paymentStatus === "paid" ? c.payOnline : d.paymentStatus;
  const showDetails = kind === "order_confirmed";
  const contact = [d.store.email, d.store.phone].filter(Boolean).join(" · ");

  const itemRows = d.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;text-align:${align}">${esc(i.name)}${i.variant ? ` <span style="color:#7d8591">(${esc(i.variant)})</span>` : ""} × ${i.quantity}</td><td style="padding:6px 0;text-align:${opp};white-space:nowrap">${money(i.lineTotalHalalas)}</td></tr>`,
    )
    .join("");
  const totalsRows = rows
    .map(([a, b]) => `<tr><td style="padding:4px 0;color:#4b5563;text-align:${align}">${a}</td><td style="padding:4px 0;text-align:${opp};white-space:nowrap">${b}</td></tr>`)
    .join("");

  const trackingHtml =
    d.tracking && (kind === "order_shipped" || kind === "order_confirmed")
      ? `<p style="margin:16px 0 0"><strong>${c.tracking}:</strong> <span dir="ltr">${esc(d.tracking.number)}</span>${d.tracking.carrier ? ` — ${esc(d.tracking.carrier)}` : ""}</p>${
          d.tracking.url && /^https:\/\//.test(d.tracking.url) ? `<p style="margin:6px 0 0"><a href="${esc(d.tracking.url)}" style="color:#2d63f5">${c.trackLink}</a></p>` : ""
        }`
      : "";

  const html = `<!doctype html><html lang="${L}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f5f3ef;font-family:Tahoma,Arial,sans-serif;color:#0a0e14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden" dir="${dir}">
<tr><td style="background:#0a0e14;color:#ffffff;padding:18px 24px;font-weight:bold;letter-spacing:.04em;text-align:${align}">${esc(d.store.name)}</td></tr>
<tr><td style="padding:24px;text-align:${align};line-height:1.7">
<h1 style="margin:0 0 8px;font-size:20px">${k.title}</h1>
<p style="margin:0">${esc(fill(k.body, vars))}</p>
${trackingHtml}
<p style="margin:20px 0"><a href="${esc(d.orderLink)}" style="display:inline-block;background:#2d63f5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px">${c.viewOrder}</a></p>
${
  showDetails
    ? `<h2 style="font-size:15px;margin:20px 0 6px">${c.items}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #eee">${itemRows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #eee;margin-top:6px">${totalsRows}
<tr><td style="padding:8px 0;font-weight:bold;text-align:${align}">${c.total}${d.pricesIncludeTax && d.taxHalalas > 0 ? ` <span style="font-weight:normal;color:#7d8591;font-size:12px">(${c.taxIncl})</span>` : ""}</td><td style="padding:8px 0;font-weight:bold;text-align:${opp};white-space:nowrap">${money(d.totalHalalas)}</td></tr></table>
<p style="margin:16px 0 0;font-size:14px"><strong>${c.payment}:</strong> ${esc(payLine)}</p>
<p style="margin:6px 0 0;font-size:14px"><strong>${c.address}:</strong> ${esc(addressLine)}</p>`
    : ""
}
${contact || d.store.whatsapp ? `<p style="margin:20px 0 0;font-size:13px;color:#4b5563"><strong>${c.help}</strong> <span dir="ltr">${esc(contact)}</span>${d.store.whatsapp ? ` · <a href="https://wa.me/${esc(d.store.whatsapp)}" style="color:#2d63f5">WhatsApp</a>` : ""}</p>` : ""}
</td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;color:#7d8591;font-size:12px;text-align:${align}">${esc(fill(c.footer, vars))}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    k.title,
    fill(k.body, vars),
    d.tracking && kind !== "order_delivered" && kind !== "order_cancelled" ? `${c.tracking}: ${d.tracking.number}${d.tracking.carrier ? ` (${d.tracking.carrier})` : ""}` : "",
    showDetails ? d.items.map((i) => `- ${i.name}${i.variant ? ` (${i.variant})` : ""} × ${i.quantity}: ${money(i.lineTotalHalalas)}`).join("\n") : "",
    showDetails ? `${c.total}: ${money(d.totalHalalas)}` : "",
    `${c.viewOrder}: ${d.orderLink}`,
    contact ? `${c.help} ${contact}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}

/** Short Telegram / email alert for the store team (Arabic). */
export function renderAdminNewOrder(d: {
  number: string;
  totalHalalas: number;
  paymentMethod: string;
  city: string;
  customerName: string;
  items: { name: string; quantity: number }[];
  adminLink: string;
  storeName: string;
}) {
  const pay = d.paymentMethod === "cod" ? "دفع عند الاستلام" : "مدفوع إلكترونيًا";
  const text = [
    `🛒 طلب جديد ${d.number}`,
    `المبلغ: ${formatSAR(d.totalHalalas, "ar")} — ${pay}`,
    `العميل: ${d.customerName} — ${cityLabel(d.city, "ar")}`,
    `المنتجات: ${d.items.map((i) => `${i.name} × ${i.quantity}`).join("، ")}`,
    d.adminLink,
  ].join("\n");
  const subject = `طلب جديد ${d.number} — ${formatSAR(d.totalHalalas, "ar")}`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">${esc(text).replace(/\n/g, "<br>")}</div>`;
  return { subject: `${subject} — ${d.storeName}`, text, html };
}

export function renderPasswordReset(d: { name: string; link: string; minutes: number; storeName: string }) {
  const subject = `استعادة كلمة مرور لوحة التحكم — ${d.storeName}`;
  const text = `مرحبًا ${d.name}،\n\nطُلبت استعادة كلمة مرور حسابك في لوحة تحكم ${d.storeName}. افتح الرابط التالي خلال ${d.minutes} دقيقة لتعيين كلمة مرور جديدة:\n\n${d.link}\n\nإن لم تطلب ذلك فتجاهل هذه الرسالة؛ كلمة مرورك الحالية لم تتغير.`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;max-width:520px">
<p>مرحبًا ${esc(d.name)}،</p>
<p>طُلبت استعادة كلمة مرور حسابك في لوحة تحكم ${esc(d.storeName)}. الرابط صالح لمدة ${d.minutes} دقيقة ولمرة واحدة.</p>
<p><a href="${esc(d.link)}" style="display:inline-block;background:#0a0e14;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px">تعيين كلمة مرور جديدة</a></p>
<p style="color:#7d8591;font-size:13px">إن لم تطلب ذلك فتجاهل هذه الرسالة؛ كلمة مرورك الحالية لم تتغير.</p></div>`;
  return { subject, text, html };
}

export function renderErrorAlert(d: { source: string; message: string; path: string | null; count: number; adminLink: string; storeName: string }) {
  const text = [`⚠️ خطأ في ${d.storeName}`, `المصدر: ${d.source}`, d.path ? `المسار: ${d.path}` : "", `الرسالة: ${d.message.slice(0, 500)}`, `عدد المرات: ${d.count}`, d.adminLink]
    .filter(Boolean)
    .join("\n");
  return { subject: `تنبيه خطأ (${d.source}) — ${d.storeName}`, text, html: `<pre dir="auto" style="font-family:monospace;white-space:pre-wrap">${esc(text)}</pre>` };
}


export function renderBackInStock(d: { locale: Lang; productName: string; variant: string; link: string; storeName: string }) {
  const ar = d.locale === "ar";
  const name = d.variant ? `${d.productName} (${d.variant})` : d.productName;
  const subject = ar ? `${name} متوفر الآن — ${d.storeName}` : `${name} is back in stock — ${d.storeName}`;
  const body = ar
    ? `طلبت أن نخبرك عند توفر ${name}. أصبح متوفرًا الآن، والكمية قد تكون محدودة.`
    : `You asked us to tell you when ${name} is available. It's back now — quantities may be limited.`;
  const cta = ar ? "عرض المنتج" : "View product";
  const foot = ar ? "هذه رسالة واحدة فقط؛ حذفنا بريدك من قائمة التنبيه بعد إرسالها." : "This is a one-time message; we deleted your email from the alert list after sending it.";
  const dir = ar ? "rtl" : "ltr";
  const html = `<div dir="${dir}" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;max-width:520px;color:#0a0e14">
<p style="font-weight:bold;font-size:18px;margin:0 0 8px">${esc(d.storeName)}</p>
<p>${esc(body)}</p>
<p><a href="${esc(d.link)}" style="display:inline-block;background:#2d63f5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px">${cta}</a></p>
<p style="color:#7d8591;font-size:12px">${foot}</p></div>`;
  return { subject, html, text: `${body}\n\n${cta}: ${d.link}\n\n${foot}` };
}

/** Short SMS (kept near one Arabic segment where possible). */
export function renderOrderSms(kind: "order_confirmed" | "order_shipped", d: { locale: Lang; number: string; storeName: string; link: string; tracking?: string | null }) {
  if (d.locale === "en") {
    return kind === "order_confirmed"
      ? `${d.storeName}: order ${d.number} confirmed. Track it: ${d.link}`
      : `${d.storeName}: order ${d.number} has shipped${d.tracking ? `, tracking ${d.tracking}` : ""}. ${d.link}`;
  }
  return kind === "order_confirmed"
    ? `${d.storeName}: تم تأكيد طلبك ${d.number}. تابعه هنا: ${d.link}`
    : `${d.storeName}: شُحن طلبك ${d.number}${d.tracking ? ` برقم تتبع ${d.tracking}` : ""}. ${d.link}`;
}

export function renderOrdersLink(d: { locale: Lang; link: string; minutes: number; storeName: string }) {
  const ar = d.locale === "ar";
  const subject = ar ? `رابط الدخول لطلباتك — ${d.storeName}` : `Your sign-in link — ${d.storeName}`;
  const body = ar ? `افتح الرابط خلال ${d.minutes} دقيقة لعرض كل طلباتك.` : `Open this link within ${d.minutes} minutes to see all your orders.`;
  const cta = ar ? "عرض طلباتي" : "View my orders";
  const foot = ar ? "إن لم تطلب هذا الرابط فتجاهل الرسالة." : "If you didn't ask for this link, you can ignore this email.";
  const html = `<div dir="${ar ? "rtl" : "ltr"}" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;max-width:520px;color:#0a0e14">
<p style="font-weight:bold;font-size:18px;margin:0 0 8px">${esc(d.storeName)}</p><p>${esc(body)}</p>
<p><a href="${esc(d.link)}" style="display:inline-block;background:#2d63f5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px">${cta}</a></p>
<p style="color:#7d8591;font-size:12px">${foot}</p></div>`;
  return { subject, html, text: `${body}\n\n${d.link}\n\n${foot}` };
}
