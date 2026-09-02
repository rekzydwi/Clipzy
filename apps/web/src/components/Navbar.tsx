"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Navbar() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b border-[var(--glass-border)] bg-[rgba(8,11,17,0.75)] backdrop-blur-xl sticky top-0 z-40 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-accent-1 via-accent-2 to-accent-3 p-[1px] shadow-lg shadow-accent-2/20 group-hover:shadow-accent-1/40 transition-all duration-300">
              <div className="w-full h-full bg-[#080b11] rounded-[11px] flex items-center justify-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0 transition-transform group-hover:scale-110"
                >
                  <path
                    d="M7 8L11 12L7 16M13 16H17"
                    stroke="url(#nav-logo-stroke)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="nav-logo-stroke" x1="7" y1="8" x2="17" y2="16">
                      <stop stopColor="#06B6D4" />
                      <stop offset="1" stopColor="#A855F7" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold gradient-text tracking-tight">Clipzy</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-accent-1/10 text-accent-1 border border-accent-1/20 uppercase tracking-wider">AI</span>
            </div>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm font-medium px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="btn-icon text-muted-foreground hover:text-danger hover:border-danger/40"
              title="Keluar / Logout"
              id="logout-btn"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
