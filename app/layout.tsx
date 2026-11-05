import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// Tipografi mengikuti StyleGuide §3: Inter untuk teks, JetBrains Mono untuk nomor dokumen.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sistem Pengelolaan Jagung Desa Baturejo",
  description: "Sistem Pengelolaan Jagung Desa Baturejo — sistem informasi Kelompok Tani Ngudi Makmur, Desa Baturejo, Sukolilo, Pati",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
