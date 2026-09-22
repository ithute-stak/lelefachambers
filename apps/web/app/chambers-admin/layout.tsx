import AdminShell from "./AdminShell";

export default function ChambersAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
