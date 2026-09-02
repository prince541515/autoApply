import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-xl bg-foreground text-background shadow-sm",
          markClassName,
        )}
      >
        <Zap className="size-4 fill-current" />
      </span>
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight">AutoApply</span>
      )}
    </span>
  );
}
