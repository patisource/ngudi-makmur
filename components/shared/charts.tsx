// Grafik ringan tanpa dependensi (StyleGuide §2.4): seri utama --accent, pembanding --text 15% (batang abu gaya Core),
// gridline horizontal putus-putus --border, tanpa kotak. Satu sumbu (kg). Hover: <title> per kolom (tooltip bawaan),
// plus tabel data di <details> untuk aksesibilitas & pembaca tanpa warna.

export type DayPoint = { day: string; a: number; b?: number }; // gram

const W = 640;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 40 };
const dayFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const kgFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const label = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));
const kg = (g: number) => `${kgFmt.format(g / 1000)} kg`;

function niceMax(grams: number) {
  const v = Math.max(grams / 1000, 1);
  const p = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10;
  return step * p * 1000;
}

function Frame({ max, children, ariaLabel }: { max: number; children: React.ReactNode; ariaLabel: string }) {
  const ticks = [0, max / 2, max];
  const y = (g: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - g / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full overflow-visible">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "3 4"} />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-subtle)">
            {kgFmt.format(t / 1000)}
          </text>
        </g>
      ))}
      {children}
    </svg>
  );
}

function geometry(n: number, max: number) {
  const plotW = W - PAD.left - PAD.right;
  const slot = plotW / Math.max(n, 1);
  const bar = Math.min(24, Math.max(3, slot - 4));
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (g: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - Math.min(g, max) / max);
  const labelEvery = Math.ceil(n / 8);
  return { slot, bar, x, y, labelEvery, base: H - PAD.bottom };
}

/** Kolom ujung membulat 4px, pangkal datar (dataviz mark spec). */
function Column({ cx, top, base, w, fill }: { cx: number; top: number; base: number; w: number; fill: string }) {
  const h = Math.max(0, base - top);
  if (h <= 0) return null;
  const r = Math.min(4, w / 2, h);
  const l = cx - w / 2;
  return <path d={`M${l},${base} V${top + r} Q${l},${top} ${l + r},${top} H${l + w - r} Q${l + w},${top} ${l + w},${top + r} V${base} Z`} fill={fill} className="chart-col" />;
}

function XLabels({ data, g }: { data: DayPoint[]; g: ReturnType<typeof geometry> }) {
  return (
    <>
      {data.map((d, i) =>
        i % g.labelEvery === 0 ? (
          <text key={d.day} x={g.x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-subtle)">
            {label(d.day)}
          </text>
        ) : null,
      )}
    </>
  );
}

/** Satu seri kolom (aksen) + garis target opsional (mis. 50 kg/hari). */
export function ColumnChart({ data, target, title }: { data: DayPoint[]; target?: number; title: string }) {
  const max = niceMax(Math.max(...data.map((d) => d.a), target ?? 0));
  const g = geometry(data.length, max);
  return (
    <figure className="flex flex-col gap-2">
      <Frame max={max} ariaLabel={title}>
        {target != null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={g.y(target)} y2={g.y(target)} stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="6 4" />
            <text x={W - PAD.right} y={g.y(target) - 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">
              Target {kg(target)}/hari
            </text>
          </g>
        )}
        {data.map((d, i) => (
          <g key={d.day}>
            <title>{`${label(d.day)}: ${kg(d.a)}`}</title>
            <rect x={g.x(i) - g.slot / 2} y={PAD.top} width={g.slot} height={g.base - PAD.top} fill="transparent" />
            <Column cx={g.x(i)} top={g.y(d.a)} base={g.base} w={g.bar} fill="var(--accent)" />
          </g>
        ))}
        <XLabels data={data} g={g} />
      </Frame>
      <DataTable data={data} aLabel={title} />
    </figure>
  );
}

/** Pembanding (batang abu) + seri utama (garis aksen 2px, titik 8px bercincin). Satu sumbu kg. */
export function BarLineChart({ data, aLabel, bLabel, title }: { data: DayPoint[]; aLabel: string; bLabel: string; title: string }) {
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.a, d.b ?? 0))));
  const g = geometry(data.length, max);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${g.x(i)},${g.y(d.b ?? 0)}`).join(" ");
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-text/15" />
          {aLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded bg-accent" />
          {bLabel}
        </span>
      </figcaption>
      <Frame max={max} ariaLabel={title}>
        {data.map((d, i) => (
          <Column key={d.day} cx={g.x(i)} top={g.y(d.a)} base={g.base} w={g.bar} fill="color-mix(in srgb, var(--text) 15%, transparent)" />
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={d.day}>
            <title>{`${label(d.day)} — ${aLabel}: ${kg(d.a)}; ${bLabel}: ${kg(d.b ?? 0)}`}</title>
            <rect x={g.x(i) - g.slot / 2} y={PAD.top} width={g.slot} height={g.base - PAD.top} fill="transparent" />
            {data.length <= 31 && <circle cx={g.x(i)} cy={g.y(d.b ?? 0)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
          </g>
        ))}
        <XLabels data={data} g={g} />
      </Frame>
      <DataTable data={data} aLabel={aLabel} bLabel={bLabel} />
    </figure>
  );
}

function DataTable({ data, aLabel, bLabel }: { data: DayPoint[]; aLabel: string; bLabel?: string }) {
  return (
    <details className="text-xs text-text-muted">
      <summary className="cursor-pointer select-none">Lihat tabel data</summary>
      <table className="mt-2 w-full tabular-nums">
        <thead>
          <tr className="text-left">
            <th className="py-1 font-medium">Tanggal</th>
            <th className="py-1 text-right font-medium">{aLabel}</th>
            {bLabel && <th className="py-1 text-right font-medium">{bLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day} className="border-t border-border">
              <td className="py-1">{label(d.day)}</td>
              <td className="py-1 text-right">{kg(d.a)}</td>
              {bLabel && <td className="py-1 text-right">{kg(d.b ?? 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// ---------------------------------------------------------------- batang berkelompok (desain 01/07)
export type BucketPoint = { key: string; label: string; a: number; b: number }; // gram

const GH = 230;
/** Dua seri batang berdampingan per kelompok (mis. per minggu): pembanding abu + seri utama aksen. Satu sumbu kg. */
export function GroupedBarChart({ data, aLabel, bLabel, title }: { data: BucketPoint[]; aLabel: string; bLabel: string; title: string }) {
  // 3 langkah sumbu dengan angka bulat (1/2/2,5/5 × 10^n kg).
  const step = niceMax(Math.max(1, ...data.map((d) => Math.max(d.a, d.b))) / 3);
  const max = step * 3;
  const plotW = W - PAD.left - PAD.right;
  const slot = plotW / Math.max(data.length, 1);
  const bar = Math.min(28, Math.max(4, (slot - 16) / 2));
  const gap = Math.min(6, bar / 3);
  const base = GH - PAD.bottom;
  const y = (g: number) => PAD.top + (base - PAD.top) * (1 - Math.min(g, max) / max);
  const ticks = [0, step, 2 * step, max];
  const labelEvery = Math.ceil(data.length / 10);
  return (
    <figure className="flex flex-col gap-2">
      <div className="-mx-1 overflow-x-auto px-1">
      <svg viewBox={`0 0 ${W} ${GH}`} role="img" aria-label={title} className="h-auto w-full min-w-[520px] overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-subtle)">
              {kgFmt.format(Math.round(t / 1000))}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g key={d.key}>
              <title>{`${d.label} — ${aLabel}: ${kg(d.a)}; ${bLabel}: ${kg(d.b)}`}</title>
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={base - PAD.top} fill="transparent" />
              <Column cx={cx - gap / 2 - bar / 2} top={y(d.a)} base={base} w={bar} fill="color-mix(in srgb, var(--text) 15%, transparent)" />
              <Column cx={cx + gap / 2 + bar / 2} top={y(d.b)} base={base} w={bar} fill="var(--accent)" />
              {i % labelEvery === 0 && (
                <text x={cx} y={GH - 4} textAnchor="middle" fontSize="10" fill="var(--text-subtle)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      </div>
      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer select-none">Lihat tabel data</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Periode</th>
              <th className="py-1 text-right font-medium">{aLabel}</th>
              <th className="py-1 text-right font-medium">{bLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-t border-border">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right">{kg(d.a)}</td>
                <td className="py-1 text-right">{kg(d.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Legenda kecil (kanan atas kartu grafik): kotak warna + label. */
export function ChartLegend({ items }: { items: Array<{ label: string; tone: "muted" | "accent" }> }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={i.tone === "accent" ? "size-2.5 rounded-sm bg-accent" : "size-2.5 rounded-sm bg-text/15"} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Batang mini harian (kartu omzet): tanpa sumbu, batang terakhir beraksen; nilai per batang lewat <title>. */
export function MiniBars({ values, labels, title, format }: { values: number[]; labels: string[]; title: string; format: (v: number) => string }) {
  const n = Math.max(values.length, 1);
  const mw = 260;
  const mh = 44;
  const slot = mw / n;
  const w = Math.max(2, Math.min(8, slot - 3));
  const max = Math.max(1, ...values);
  return (
    <svg viewBox={`0 0 ${mw} ${mh}`} role="img" aria-label={title} className="h-11 w-full" preserveAspectRatio="none">
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * (mh - 2)) : 1;
        return (
          <g key={i}>
            <title>{`${labels[i]}: ${format(v)}`}</title>
            <rect x={slot * i + (slot - w) / 2} y={mh - h} width={w} height={h} rx={Math.min(2, w / 2)} fill={i === n - 1 ? "var(--accent)" : "color-mix(in srgb, var(--text) 18%, transparent)"} className="chart-col" />
          </g>
        );
      })}
    </svg>
  );
}
