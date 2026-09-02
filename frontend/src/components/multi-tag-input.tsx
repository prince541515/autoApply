"use client";

import { useEffect, useState, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Flame, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MultiTagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  hotSuggestions?: string[];
  hotLabel?: string;
  className?: string;
}

export function MultiTagInput({
  value,
  onChange,
  placeholder = "Type and press Enter…",
  suggestions,
  hotSuggestions,
  hotLabel = "Hot titles in the market",
  className,
}: MultiTagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const hotSet = new Set(hotSuggestions ?? []);

  const updateMenuPos = () => {
    const el = boxRef.current ?? inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  useEffect(() => {
    if (!showSuggestions) return;
    updateMenuPos();
    const onScroll = () => updateMenuPos();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [showSuggestions]);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
    setActiveIndex(0);
    setShowSuggestions(true);
    requestAnimationFrame(updateMenuPos);
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const filtered = (suggestions ?? []).filter(
    (s) =>
      s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s),
  );

  const visible = input.trim()
    ? filtered.slice(0, 12)
    : (hotSuggestions ?? filtered).filter((s) => !value.includes(s)).slice(0, 10);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && visible.length > 0) {
      e.preventDefault();
      setShowSuggestions(true);
      setActiveIndex((i) => (i + 1) % visible.length);
      return;
    }
    if (e.key === "ArrowUp" && visible.length > 0) {
      e.preventDefault();
      setShowSuggestions(true);
      setActiveIndex((i) => (i - 1 + visible.length) % visible.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (showSuggestions && visible[activeIndex]) {
        addTag(visible[activeIndex]);
      } else if (input.trim()) {
        addTag(input);
      }
      return;
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
      return;
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const menu =
    showSuggestions && visible.length > 0 ? (
      <div
        style={{
          position: "fixed",
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
        }}
        className="z-200 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
      >
        {!input.trim() && hotSuggestions && hotSuggestions.length > 0 && (
          <p className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Flame className="size-3 text-orange-500" />
            {hotLabel}
          </p>
        )}
        {visible.map((s, index) => {
          const isHot = hotSet.has(s);
          return (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => addTag(s)}
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm",
                index === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span>{s}</span>
              {isHot && (
                <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-medium text-orange-500">
                  <Flame className="size-2.5" />
                  Hot
                </span>
              )}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pl-2.5 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div
        ref={boxRef}
        className="relative"
        onFocusCapture={() => {
          setActiveIndex(0);
          setShowSuggestions(true);
          requestAnimationFrame(updateMenuPos);
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setTimeout(() => setShowSuggestions(false), 150);
          }
        }}
      >
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setActiveIndex(0);
            setShowSuggestions(true);
            updateMenuPos();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
      </div>
      {typeof document !== "undefined" && menu
        ? createPortal(menu, document.body)
        : null}
    </div>
  );
}
