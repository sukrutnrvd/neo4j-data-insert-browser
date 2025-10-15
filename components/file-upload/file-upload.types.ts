export interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
}

export interface FileUploadProps {
  /**
   * Accepted file types (MIME types or file extensions)
   * Example: { 'image/*': ['.png', '.jpg'], 'application/pdf': ['.pdf'] }
   */
  accept?: Record<string, string[]>;

  /**
   * Maximum file size in bytes
   * Default: 10MB
   */
  maxSize?: number;

  /**
   * Allow multiple file uploads
   * Default: true
   */
  multiple?: boolean;

  /**
   * Maximum number of files
   * Default: undefined (unlimited)
   */
  maxFiles?: number;

  /**
   * Callback when files are uploaded
   */
  onFilesChange?: (files: UploadedFile[]) => void;

  /**
   * Initial files
   */
  initialFiles?: UploadedFile[];

  /**
   * Custom class name for the container
   */
  className?: string;

  /**
   * Show file preview
   * Default: true
   */
  showPreview?: boolean;
}

export type FileType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "archive"
  | "unknown";
