// Unduh semua berkas bucket privat "proofs" ke folder tujuan (bagian backup harian, T9.8).
// Pemakaian: node scripts/backup-storage.mjs <path .env.local> <folder tujuan>
// Kunci rahasia hanya dibaca dari .env.local dan tidak pernah dicetak.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const [, , envPath, outDir] = process.argv;
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key || !outDir) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, dan folder tujuan wajib ada");
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = "proofs";

async function walk(prefix) {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`Gagal membaca daftar berkas: ${error.message}`);
    for (const item of data) {
      const p = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await walk(p))); // folder
      else files.push(p);
    }
    if (data.length < 1000) break;
  }
  return files;
}

const files = await walk("");
let n = 0;
for (const f of files) {
  const { data, error } = await supabase.storage.from(BUCKET).download(f);
  if (error) throw new Error(`Gagal mengunduh ${f}`);
  const dest = path.join(outDir, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
  n++;
}
console.log(`Bukti tersalin: ${n} berkas`);
