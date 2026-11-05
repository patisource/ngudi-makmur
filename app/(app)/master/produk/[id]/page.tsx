import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, Table, Td, Th } from "@/components/ui/table";
import { ArchiveButton, ConversionForm, ConversionPriceForm, ProductForm } from "@/features/master/components/forms";
import { getProduct } from "@/features/master/queries";
import { requireAction } from "@/lib/auth/session";
import { dbKgToGrams, formatKg, gramsToKgString } from "@/lib/qty";

export const metadata: Metadata = { title: "Ubah produk · Sistem Pengelolaan Jagung Desa Baturejo" };

// Produk + tab konversi kemasan (T2.3). Isi kg kemasan terkunci setelah dibuat; ganti = arsipkan lalu buat baru.
export default async function EditProductPage({ params }: PageProps<"/master/produk/[id]">) {
  await requireAction("master.kelola");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { product, conversions, packagings } = await getProduct(id);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{product.name}</h2>
            <span className="font-mono text-xs text-text-muted">{product.code}</span>
            <Badge tone="info">{product.category}</Badge>
            {product.archived_at && <Badge>Diarsip</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <ArchiveButton table="products" id={product.id} archived={Boolean(product.archived_at)} />
            <Link href="/master/produk" className="text-sm text-text-muted hover:text-text">
              Kembali
            </Link>
          </div>
        </div>
        <ProductForm productId={product.id} defaults={{ name: product.name, defaultPricePerKg: product.default_price_per_kg, minStockKg: gramsToKgString(dbKgToGrams(product.min_stock_kg)).replace(".", ",") }} />
        <p className="text-xs text-text-subtle">Satuan inventori selalu kg. Produk dengan stok lebih dari 0 tidak dapat diarsipkan.</p>
      </Card>

      <Card>
        <h2 className="font-semibold">Konversi kemasan penjualan</h2>
        <p className="text-sm text-text-muted">Kemasan hanya untuk penjualan. Contoh: 2 pak @0,5 kg mengurangi stok 1 kg. Isi kemasan harus lebih dari 0 kg.</p>
        {conversions.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Kemasan</Th>
                <Th num>Isi</Th>
                <Th num>Harga per kemasan (Rp)</Th>
                <Th num>Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((c) => (
                <tr key={c.id} className={c.archived_at ? "opacity-60" : undefined}>
                  <Td>
                    {c.packagings?.name}
                    {c.archived_at && <span className="ml-2 text-xs text-text-subtle">diarsip</span>}
                  </Td>
                  <Td num>{formatKg(dbKgToGrams(c.content_kg))}</Td>
                  <Td num>{c.archived_at ? "—" : <ConversionPriceForm conversionId={c.id} price={c.default_price} />}</Td>
                  <Td num>
                    <ArchiveButton table="product_packagings" id={c.id} archived={Boolean(c.archived_at)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Belum ada konversi">Produk ini dijual curah per kg sampai konversi kemasan ditambahkan.</EmptyState>
        )}
        <ConversionForm productId={product.id} packagings={packagings} />
      </Card>
    </div>
  );
}
