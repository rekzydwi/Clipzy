// Force dynamic rendering — halaman job detail butuh auth & realtime
export const dynamic = "force-dynamic";

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
