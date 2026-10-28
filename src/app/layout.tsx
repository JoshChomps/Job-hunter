import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle, themeScript } from "@/components/theme-toggle";
import { auth, signOut } from "@/auth";

export const metadata: Metadata = {
  title: "Job Hunter",
  description: "Private job search home base for electrical engineering and AI roles",
};

const NAV = [
  { href: "/", label: "Inbox" },
  { href: "/starred", label: "Starred" },
  { href: "/board", label: "Pipeline" },
  { href: "/sources", label: "Sources" },
  { href: "/people", label: "People" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg text-text">
        <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight !text-text">
              Job&nbsp;Hunter
            </Link>

            {session?.user && (
              <nav className="flex items-center gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-2.5 py-1.5 text-sm !text-muted transition-colors hover:bg-surface-2 hover:!text-text"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}

            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle />
              {session?.user && (
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                >
                  <button
                    type="submit"
                    className="text-xs text-muted hover:text-text"
                  >
                    Sign out
                  </button>
                </form>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
