// Standalone layout for the public, no-login vendor status page
// (docs/01 §1-1, docs/03 intro). Deliberately excludes the authenticated
// app shell/Nav from app/(app)/layout.tsx — a flower shop owner opens this
// cold from a Kakao message link with no app account.
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>;
}
