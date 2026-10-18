import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { roleLabels } from "@/lib/auth/permissions";
import { PageHeader, Card, Badge } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { createAdminUser, updateAdminUser, changeOwnPassword } from "@/features/admin/misc-actions";

export const metadata = { title: "المستخدمون" };

export default async function Users() {
  const me = await requireAdmin("users.manage");
  const db = await getDb();
  const users = await db.select().from(schema.adminUsers).orderBy(asc(schema.adminUsers.createdAt));
  const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  return (
    <>
      <PageHeader title="المستخدمون والصلاحيات" description="المالك: كل شيء. المدير: المنتجات والطلبات والاسترجاع والعروض. خدمة العملاء: عرض الطلبات وتحديثها فقط." />
      <div className="space-y-3">
        {users.map((u) => (
          <form key={u.id} action={updateAdminUser} className="flex flex-wrap items-center gap-3 rounded-2xl border border-paper-2 bg-white p-4 text-sm">
            <input type="hidden" name="id" value={u.id} />
            <span className="min-w-40 font-medium">{u.name}<span className="block text-xs font-normal text-metal-500" dir="ltr">{u.email}</span></span>
            <span className="text-xs text-metal-500">آخر دخول: {u.lastLoginAt ? date.format(u.lastLoginAt) : "—"}</span>
            {u.id === me.userId ? (
              <Badge tone="ink">{roleLabels[u.role]} — أنت</Badge>
            ) : (
              <>
                <select name="role" defaultValue={u.role} className="field min-h-9 w-auto py-1 text-sm">{Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="active" defaultChecked={u.active} /> مفعّل</label>
                <button className="btn btn-ghost btn-sm ms-auto">حفظ</button>
              </>
            )}
          </form>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="إضافة مستخدم">
          <ActionForm action={createAdminUser} className="grid gap-3">
            <input name="name" placeholder="الاسم" className="field" required />
            <input name="email" type="email" placeholder="البريد الإلكتروني" dir="ltr" className="field" required />
            <select name="role" defaultValue="support" className="field">{Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <SubmitButton>إنشاء الحساب</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="تغيير كلمة مروري">
          <ActionForm action={changeOwnPassword} className="grid gap-3">
            <input name="password" type="password" minLength={12} autoComplete="new-password" placeholder="كلمة مرور جديدة (12 حرفًا على الأقل)" dir="ltr" className="field" required />
            <SubmitButton variant="ink">تغيير</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
