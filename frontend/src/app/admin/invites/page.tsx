"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Plus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import api from "@/lib/api";
import type { InviteCode } from "@/types";

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get<InviteCode[]>("/admin/invites");
      setInvites(res.data);
    } catch {
      toast.error({ title: "Failed to load invite codes" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    try {
      setCreating(true);
      const res = await api.post<InviteCode>("/admin/invites");
      setInvites((prev) => [res.data, ...prev]);
      await navigator.clipboard.writeText(res.data.code);
      toast.success({
        title: "Invite code created",
        description: `${res.data.code} copied to clipboard`,
      });
    } catch {
      toast.error({ title: "Failed to generate code" });
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success({ title: "Copied", description: code });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invite codes</h1>
          <p className="text-muted-foreground">
            One-time codes candidates enter after signup to activate their account.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Plus className="mr-2 size-4" />
          )}
          Generate code
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : invites.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Ticket className="size-10 opacity-40" />
              <p>No invite codes yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead className="hidden md:table-cell">Used at</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-mono tracking-widest">
                      {invite.code}
                    </TableCell>
                    <TableCell>
                      <Badge variant={invite.used ? "secondary" : "default"}>
                        {invite.used ? "Used" : "Unused"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {invite.created_at
                        ? new Date(invite.created_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {invite.used_at
                        ? new Date(invite.used_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {!invite.used && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => copyCode(invite.code)}
                        >
                          <Copy className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
