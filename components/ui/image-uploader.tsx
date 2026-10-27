"use client";

import { CloseCircle, CloudUpload, DangerCircle } from "@/components/icons";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Input } from "./input";
import { Skeleton } from "./skeleton";

interface ImageUploadFieldProps {
  value?: File | string | null;
  onChange?: (value: File | string | null) => void;
  onBlur?: () => void;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  aspectRatio?: number;
  defaultImage?: string;
  isLoading?: boolean;
  maxSize?: number;
  onReject?: (message: string) => void;
  id?: string;
  "aria-describedby"?: string;
  capture?: "user" | "environment";
  /** Accessible name of what is uploaded, e.g. "passport photo". */
  label?: string;
  /** Exact MIME types allowed (checked on selection, so storage never rejects later). Default: any image. */
  acceptTypes?: string[];
}

export function ImageUploadField({
  value,
  onChange,
  onBlur,
  className,
  disabled = false,
  error = false,
  // Increase default aspect ratio to make the uploader shorter on desktop.
  // A larger ratio (width/height) results in a smaller height for a given width.
  aspectRatio = 2,
  defaultImage,
  isLoading = false,
  maxSize = 4 * 1024 * 1024,
  onReject,
  id,
  "aria-describedby": describedBy,
  capture,
  label = "screenshot",
  acceptTypes,
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Handle preview URL generation and cleanup
  useEffect(() => {
    if (typeof value === "string") {
      setPreviewUrl(value);
    } else if (value instanceof File) {
      const url = URL.createObjectURL(value);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(defaultImage || null);
    }
  }, [value, defaultImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (acceptTypes ? !acceptTypes.includes(file.type) : !file.type.startsWith("image/")) {
      e.target.value = "";
      const names = acceptTypes?.map((t) => t.split("/")[1].replace("jpeg", "JPG").replace(/^(png|webp)$/, (x) => (x === "png" ? "PNG" : "WebP")));
      return onReject?.(names ? `Use a ${names.slice(0, -1).join(", ")} or ${names.at(-1)} photo` : "Please choose an image");
    }
    if (file.size > maxSize) {
      e.target.value = "";
      return onReject?.(`Image must be under ${maxSize / 1024 / 1024} MB`);
    }
    if (file.size) {
      onChange?.(file);
      onBlur?.();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (isLoading) {
    return (
      <div className={className} style={{ aspectRatio }}>
        <Skeleton className="size-full rounded-lg border-2 border-dashed border-muted" />
      </div>
    );
  }

  return (
    <div className={cn("group relative", className)}>
      <Input
        type="file"
        accept={acceptTypes?.join(",") ?? "image/*"}
        capture={capture}
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
        disabled={disabled}
        aria-invalid={error}
      />

      <div
        className={cn(
          "relative overflow-hidden rounded-lg border-2 transition-all",
          "hover:border-ring/50 cursor-pointer bg-card",
          error
            ? "border-destructive hover:border-destructive"
            : "border-input",
          disabled && "pointer-events-none opacity-50 cursor-not-allowed",
          previewUrl ? "border-solid" : "border-dashed",
        )}
        style={{ aspectRatio }}
        id={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        aria-label={`${previewUrl ? "Change" : "Add"} ${label}`}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          // Ignore keys bubbling from the nested Remove button, or Enter there opens the picker.
          if (e.target !== e.currentTarget || disabled || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          fileInputRef.current?.click();
        }}
      >
        {previewUrl ? (
          <>
            {/* unoptimized: previews come from storage, Telegram or Google, hosts the image optimizer isn't configured for. */}
            <Image
              fill
              unoptimized
              src={previewUrl}
              // A Telegram/Google photo link dies when the user changes their picture: fall back to the empty uploader.
              onError={() => setPreviewUrl(null)}
              alt="Preview"
              className="object-cover transition-opacity group-hover:opacity-50"
              sizes="(max-width: 768px) 100vw, 50vw"
            />

            {!disabled && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                <CloudUpload className="w-8 h-8 text-white/80" />
              </div>
            )}

            {!disabled && (
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label={`Remove ${label}`}
                className="absolute top-2 right-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
                onClick={handleRemove}
              >
                <CloseCircle className="w-4 h-4 text-foreground/70" />
              </Button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
            <CloudUpload className="w-8 h-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Click to upload
              </p>
              <p className="text-xs text-muted-foreground">
                {maxSize
                  ? `Max size: ${maxSize / 1024 / 1024} MB`
                  : "Supported formats: JPG, PNG, GIF"}
              </p>
            </div>
          </div>
        )}

        {error && previewUrl && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 text-sm text-destructive bg-destructive/10 rounded-md">
            <DangerCircle className="w-4 h-4" />
            Invalid image
          </div>
        )}
      </div>
    </div>
  );
}
