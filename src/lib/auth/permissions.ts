export type Role = "owner" | "manager" | "support";

export type Permission =
  | "dashboard.view"
  | "products.manage"
  | "orders.view"
  | "orders.update"
  | "orders.refund"
  | "customers.view"
  | "coupons.manage"
  | "settings.manage"
  | "documents.manage"
  | "pages.manage"
  | "reviews.manage"
  | "users.manage"
  | "audit.view";

const matrix: Record<Role, Permission[]> = {
  owner: [
    "dashboard.view",
    "products.manage",
    "orders.view",
    "orders.update",
    "orders.refund",
    "customers.view",
    "coupons.manage",
    "settings.manage",
    "documents.manage",
    "pages.manage",
    "reviews.manage",
    "users.manage",
    "audit.view",
  ],
  manager: ["dashboard.view", "products.manage", "orders.view", "orders.update", "orders.refund", "customers.view", "coupons.manage", "pages.manage", "reviews.manage"],
  support: ["dashboard.view", "orders.view", "orders.update", "customers.view"],
};

export function can(role: Role, perm: Permission): boolean {
  return matrix[role].includes(perm);
}

export const roleLabels: Record<Role, string> = { owner: "المالك", manager: "مدير", support: "خدمة العملاء" };
