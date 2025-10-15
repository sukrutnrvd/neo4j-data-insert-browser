"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileType, FileUploadProps, UploadedFile } from "./file-upload.types";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import clsx from "clsx";
import { useDropzone } from "react-dropzone";

const getFileType = (file: File): FileType => {
  const { type } = file;

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("text/")) return "text";
  if (
    type === "application/zip" ||
    type === "application/x-rar-compressed" ||
    type === "application/x-7z-compressed"
  )
    return "archive";

  return "unknown";
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const FileIcon = ({ type }: { type: FileType }) => {
  const iconClass = "w-12 h-12";

  switch (type) {
    case "image":
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "video":
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case "audio":
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    case "pdf":
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    case "archive":
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    default:
      return (
        <svg
          className={iconClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
  }
};

export const FileUpload = ({
  accept,
  maxSize = 10 * 1024 * 1024, // 10MB default
  multiple = true,
  maxFiles,
  onFilesChange,
  initialFiles = [],
  className,
  showPreview = true,
}: FileUploadProps) => {
  const [files, setFiles] = useState<UploadedFile[]>(initialFiles);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles: UploadedFile[] = acceptedFiles.map((file) => {
        const uploadedFile: UploadedFile = {
          id: `${Date.now()}-${Math.random()}`,
          file,
        };

        // Create preview for images
        if (file.type.startsWith("image/")) {
          uploadedFile.preview = URL.createObjectURL(file);
        }

        return uploadedFile;
      });

      setFiles((prev) => {
        const updated = multiple ? [...prev, ...newFiles] : newFiles;

        return maxFiles ? updated.slice(0, maxFiles) : updated;
      });
    },
    [multiple, maxFiles]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept,
      maxSize,
      multiple,
      maxFiles,
    });

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);

      // Revoke preview URL to avoid memory leaks
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }

      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  // Notify parent component of file changes
  useEffect(() => {
    if (onFilesChange) {
      onFilesChange(files);
    }
  }, [files, onFilesChange]);

  return (
    <div className={clsx("w-full", className)}>
      {/* Dropzone Area */}
      <div
        {...getRootProps()}
        className={clsx(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200",
          "hover:border-primary hover:bg-default-50",
          isDragActive && "border-primary bg-primary-50 scale-[1.02]",
          isDragReject && "border-danger bg-danger-50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <svg
            className="w-16 h-16 text-default-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>

          {isDragActive ? (
            <p className="text-lg font-medium text-primary">
              Drop the files here...
            </p>
          ) : (
            <>
              <p className="text-lg font-medium">
                Drag & drop files here, or click to select
              </p>
              <p className="text-sm text-default-400">
                {maxSize && `Max file size: ${formatFileSize(maxSize)}`}
                {maxFiles && ` • Max files: ${maxFiles}`}
              </p>
            </>
          )}
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-lg font-semibold">
            Uploaded Files ({files.length})
          </h3>
          <AnimatePresence mode="popLayout">
            {files.map((uploadedFile) => {
              const fileType = getFileType(uploadedFile.file);

              return (
                <motion.div
                  key={uploadedFile.id}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, x: -100 }}
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  layout
                  transition={{ duration: 0.3 }}
                >
                  <Card className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Preview or Icon */}
                      {showPreview && uploadedFile.preview ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            alt={uploadedFile.file.name}
                            className="w-full h-full object-cover"
                            src={uploadedFile.preview}
                          />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 text-primary">
                          <FileIcon type={fileType} />
                        </div>
                      )}

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {uploadedFile.file.name}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-default-500">
                          <span>{formatFileSize(uploadedFile.file.size)}</span>
                          <span>•</span>
                          <span className="capitalize">{fileType}</span>
                        </div>
                      </div>

                      {/* Remove Button */}
                      <Button
                        color="danger"
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={() => removeFile(uploadedFile.id)}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
