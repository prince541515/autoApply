"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SkillInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function SkillInput({
  value,
  onChange,
  placeholder = "Type a skill and press Enter",
}: SkillInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue("");
  };

  const removeSkill = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill(inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeSkill(value.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-ring/50">
        {value.map((skill, index) => (
          <Badge key={index} variant="secondary" className="gap-1 pr-1">
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(index)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="h-auto min-w-[120px] flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
