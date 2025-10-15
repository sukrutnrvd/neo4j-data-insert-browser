import { z } from "zod";

export interface UploadRelationshipResponse {
  data: {
    success: boolean;
    processedFiles: number;
    totalRows: number;
    message: string;
  };
}

export interface UploadRelationshipErrorResponse {
  error: {
    message: string;
    details?: string[];
  };
}

export interface ParsedRelationshipData {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}
