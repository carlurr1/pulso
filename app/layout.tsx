import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulso · Group COS para ETB Mayoristas",
  description: "Centro de operaciones del Help Desk Mayoristas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="pulso">{children}</body>
    </html>
  );
}
