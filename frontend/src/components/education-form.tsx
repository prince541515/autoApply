"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EducationEntry } from "@/types";

interface EducationFormProps {
  value: EducationEntry[];
  onChange: (value: EducationEntry[]) => void;
}

const emptyEntry: EducationEntry = {
  institution: "",
  degree: "",
  field: "",
  year: "",
};

export function EducationForm({ value, onChange }: EducationFormProps) {
  const addEntry = () => {
    onChange([...value, { ...emptyEntry }]);
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateEntry = (
    index: number,
    field: keyof EducationEntry,
    fieldValue: string
  ) => {
    const updated = value.map((entry, i) =>
      i === index ? { ...entry, [field]: fieldValue } : entry
    );
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {value.map((entry, index) => (
        <Card key={index} className="border-border/60 bg-card/40">
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-start justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Entry {index + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeEntry(index)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Institution</Label>
                <Input
                  value={entry.institution}
                  onChange={(e) =>
                    updateEntry(index, "institution", e.target.value)
                  }
                  placeholder="University or school"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Degree</Label>
                <Input
                  value={entry.degree}
                  onChange={(e) => updateEntry(index, "degree", e.target.value)}
                  placeholder="e.g. B.Tech, M.Sc"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Field of Study</Label>
                <Input
                  value={entry.field}
                  onChange={(e) => updateEntry(index, "field", e.target.value)}
                  placeholder="e.g. Computer Science"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Year</Label>
                <Input
                  value={entry.year}
                  onChange={(e) => updateEntry(index, "year", e.target.value)}
                  placeholder="e.g. 2026"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addEntry}
        className="w-full"
      >
        <Plus className="mr-2 size-4" />
        Add Education
      </Button>
    </div>
  );
}
