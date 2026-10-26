"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { Camera, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadAttachment } from "@/domains/admin/attachments";

export type UploadedFile = { id: string; name: string; previewUrl: string | null };

/** Downscales phone photos (often 4–8 MB) to ~1600px JPEG before upload. */
async function shrinkImage(file: File, maxSide = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82));
}

/** Camera/file picker that uploads immediately and reports attachment ids. */
export function PhotoInput({
  locationId,
  value,
  onChange,
  label = "Add photo",
  accept = "image/*,application/pdf",
}: {
  locationId: string;
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  label?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const added: UploadedFile[] = [];
    for (const file of Array.from(list)) {
      const blob = await shrinkImage(file);
      const isImage = blob.type.startsWith("image/");
      const fd = new FormData();
      fd.set("file", new File([blob], isImage ? file.name.replace(/\.\w+$/, ".jpg") : file.name, { type: blob.type || file.type }));
      fd.set("locationId", locationId);
      const res = await uploadAttachment(fd);
      if (res.ok && res.id) added.push({ id: res.id, name: file.name, previewUrl: isImage ? URL.createObjectURL(blob) : null });
      else toast.error(res.message ?? "Upload failed");
    }
    onChange([...value, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((f) => (
          <div key={f.id} className="relative size-20 overflow-hidden rounded-md border">
            {f.previewUrl ? (
              <img src={f.previewUrl} alt={f.name} className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center p-1 text-center text-[10px]">
                <FileText className="size-6" />
              </div>
            )}
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white"
              onClick={() => onChange(value.filter((v) => v.id !== f.id))}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept={accept} capture="environment" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
      <Button type="button" variant="outline" disabled={busy || !locationId} onClick={() => inputRef.current?.click()} className="h-11">
        <Camera className="size-4" /> {busy ? "Uploading…" : label}
      </Button>
    </div>
  );
}

/** Thumbnails/links for saved attachments. */
export function AttachmentList({ files }: { files: { id: string; fileName: string; mimeType: string }[] }) {
  if (!files.length) return <p className="text-sm text-muted-foreground">No attachments.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-md border">
          {f.mimeType.startsWith("image/") ? (
            <img src={`/api/files/${f.id}`} alt={f.fileName} className="size-full object-cover" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center text-[10px]">
              <FileText className="size-6" /> {f.fileName}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
