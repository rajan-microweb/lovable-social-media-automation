import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PlatformConnectDialogProps {
  open: boolean;
  platform: string | null;
  onClose: () => void;
  onSubmit: (fields: Record<string, string>) => void;
}

const platformFields: Record<string, { label: string; name: string; type?: string }[]> = {
  linkedin: [
    { label: "Access Token", name: "accessToken" },
  ],
  facebook: [
    { label: "App ID", name: "appId" },
    { label: "App Secret", name: "appSecret" },
    { label: "Access Token", name: "accessToken" },
  ],
  instagram: [
    { label: "App ID", name: "appId" },
    { label: "App Secret", name: "appSecret" },
    { label: "Access Token", name: "accessToken" },
  ],
  threads: [
    { label: "App ID", name: "appId" },
    { label: "App Secret", name: "appSecret" },
    { label: "Access Token", name: "accessToken" },
  ],
  twitter: [
    { label: "App ID", name: "appId" },
    { label: "App Secret", name: "appSecret" },
    { label: "Access Token", name: "accessToken" },
  ],
};

export function PlatformConnectDialog({ open, platform, onClose, onSubmit }: PlatformConnectDialogProps) {
  const fields = platform ? platformFields[platform.toLowerCase()] : [];
  const [form, setForm] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {platform}</DialogTitle>
          <DialogDescription>
            Enter the required credentials to connect your {platform} account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields && fields.length > 0 ? (
            fields.map((field) => (
              <div key={field.name}>
                <label className="block mb-1 font-medium" htmlFor={field.name}>
                  {field.label}
                </label>
                <Input
                  id={field.name}
                  name={field.name}
                  type={field.type || "text"}
                  value={form[field.name] || ""}
                  onChange={handleChange}
                  required
                />
              </div>
            ))
          ) : (
            <div>No fields required for this platform.</div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Connect</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
