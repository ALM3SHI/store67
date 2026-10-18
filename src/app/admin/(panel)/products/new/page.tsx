import { requireAdmin } from "@/lib/auth/session";
import { listCategories } from "@/services/catalog";
import { PageHeader } from "@/components/admin/static";
import { ProductEditor } from "@/components/admin/product-editor";

export const metadata = { title: "منتج جديد" };

export default async function NewProduct() {
  await requireAdmin("products.manage");
  const categories = await listCategories();
  return (
    <>
      <PageHeader title="منتج جديد" description="يُحفظ المنتج كمسودة حتى تختار «منشور»." />
      <ProductEditor
        categories={categories}
        initial={{
          slug: "",
          status: "draft",
          nameAr: "",
          nameEn: "",
          variants: [{ sku: "", nameAr: "", nameEn: "", price: "", compareAt: "", stock: 0, trackInventory: true, lowStockThreshold: 5, weightGrams: null, lengthMm: null, widthMm: null, heightMm: null, active: true }],
          media: [],
          highlights: [],
          specs: [],
          inBox: [],
          compatibility: [],
          howToUse: [],
          faqs: [],
        }}
      />
    </>
  );
}
