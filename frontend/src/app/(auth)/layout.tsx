import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SceneBackground } from "@/components/scene-background";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-card lg:flex lg:flex-col lg:justify-between lg:p-10">
        <SceneBackground count={64} />
        <div className="pointer-events-none absolute inset-0 bg-glow" />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
        <Link href="/" className="relative">
          <BrandLogo />
        </Link>
        <div className="relative max-w-md space-y-4">
          <p className="text-3xl font-semibold tracking-tight text-balance">
            Job search that runs like a product.
          </p>
          <p className="text-sm leading-relaxed text-zinc-200">
            Activate with an invite code, connect portals, and apply across
            software, commerce, finance, and BPO — with Auto-Apply only when an
            admin allows it.
          </p>
        </div>
      </div>
      <div className="relative flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),transparent_55%)]" />
        <Link href="/" className="relative mb-8 lg:hidden">
          <BrandLogo />
        </Link>
        <div className="relative w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
