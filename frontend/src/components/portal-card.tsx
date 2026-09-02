"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PortalCardProps {
  name: string;
  icon: LucideIcon;
  isConnected: boolean;
  lastSynced: string | null;
  description?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onReauth?: () => void;
}

export function PortalCard({
  name,
  icon: Icon,
  isConnected,
  lastSynced,
  description,
  onConnect,
  onDisconnect,
  onReauth,
}: PortalCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-colors",
        isConnected && "border-emerald-500/30",
      )}
    >
      <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
        <div
          className={cn(
            "rounded-xl p-3",
            isConnected ? "bg-emerald-500/10" : "bg-muted",
          )}
        >
          <Icon
            className={cn(
              "size-8",
              isConnected ? "text-emerald-500" : "text-muted-foreground",
            )}
          />
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold">{name}</h3>
          {description && (
            <p className="px-2 text-xs text-muted-foreground">{description}</p>
          )}
          <Badge
            variant={isConnected ? "default" : "secondary"}
            className={cn(
              isConnected &&
                "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20",
            )}
          >
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        {lastSynced && (
          <p className="text-xs text-muted-foreground">
            Last synced:{" "}
            {new Date(lastSynced).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}

        <div className="flex w-full gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onReauth ?? onConnect}
              >
                Re-auth
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={onDisconnect}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" className="w-full" onClick={onConnect}>
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
