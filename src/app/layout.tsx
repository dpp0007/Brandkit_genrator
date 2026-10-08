import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { currentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
export const metadata: Metadata = { title: "brandmeld — turn any website into a brand system", description: "BrandMeld explores the live web and reconstructs the visual and verbal DNA behind a company." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen flex flex-col">
        <Nav email={user?.email ?? null} />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
