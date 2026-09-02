import { Mail, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

const actions = [
  {
    href: "mailto:princeprasad1104@gmail.com",
    label: "Email",
    icon: Mail,
  },
  {
    href: "tel:+919875407603",
    label: "Call",
    icon: Phone,
  },
  {
    href: "https://wa.me/919875407603",
    label: "WhatsApp",
    icon: MessageCircle,
    external: true,
  },
] as const;

export function AdminContactNote({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-center">
        <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
          Need a code?
        </p>
        <p className="mt-1 text-sm text-zinc-300">Contact admin</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              {...(item.label === "WhatsApp"
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
              className="group flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3 text-xs font-medium text-zinc-200 transition-colors hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white">
                <Icon className="size-3.5" />
              </span>
              {item.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
