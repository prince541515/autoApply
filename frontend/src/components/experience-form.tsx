"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ExperienceEntry } from "@/types";

interface ExperienceFormProps {
  value: ExperienceEntry[];
  onChange: (value: ExperienceEntry[]) => void;
}

const emptyEntry: ExperienceEntry = {
  company: "",
  title: "",
  start_date: "",
  end_date: "",
  description: "",
};

export function ExperienceForm({ value, onChange }: ExperienceFormProps) {
  const addEntry = () => {
    onChange([...value, { ...emptyEntry }]);
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateEntry = (
    index: number,
    field: keyof ExperienceEntry,
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
                <Label className="text-xs">Company</Label>
                <Input
                  value={entry.company}
                  onChange={(e) =>
                    updateEntry(index, "company", e.target.value)
                  }
                  placeholder="Company name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input
                  value={entry.title}
                  onChange={(e) => updateEntry(index, "title", e.target.value)}
                  placeholder="Job title"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={entry.start_date}
                  onChange={(e) =>
                    updateEntry(index, "start_date", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={entry.end_date}
                  onChange={(e) =>
                    updateEntry(index, "end_date", e.target.value)
                  }
                  placeholder="Leave empty if current"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={entry.description}
                onChange={(e) =>
                  updateEntry(index, "description", e.target.value)
                }
                placeholder="Key responsibilities and achievements"
                rows={3}
              />
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
        Add Experience
      </Button>
    </div>
  );
}
