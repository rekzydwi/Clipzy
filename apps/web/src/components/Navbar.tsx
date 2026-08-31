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
    <nav className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <svg
              width="32"
              height="32"
              viewBox="0 0 36 36"
              fill="none"
              className="shrink-0 transition-transform group-hover:scale-105"
            >
              <rect
                width="36"
                height="36"
                rx="10"
                fill="url(#nav-logo-gradient)"
              />
              <path
                d="M12 14L16 18L12 22M19 22H24"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient
                  id="nav-logo-gradient"
                  x1="0"
                  y1="0"
                  x2="36"
                  y2="36"
                >
                  <stop stopColor="#8B5CF6" />
                  <stop offset="1" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-lg font-bold gradient-text">Clipzy</span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="btn-secondary text-sm py-2 px-4">
              Dashboard
            </Link>
            <button onClick={handleLogout} className="btn-icon" title="Logout" id="logout-btn">
              <svg
                width="18"
                height="18"
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
