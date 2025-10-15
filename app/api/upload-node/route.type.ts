import { z } from "zod";

export interface UploadNodeResponse {
  data: {
    success: boolean;
    processedFiles: number;
    totalRows: number;
    message: string;
  };
}

export interface UploadNodeErrorResponse {
  error: {
    message: string;
    details?: string[];
  };
}

export interface ParsedCSVData {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}
