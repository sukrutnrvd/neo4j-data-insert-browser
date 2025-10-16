"use client";

import { Card, CardBody, CardHeader } from "@heroui/card";
import { FileUpload, UploadedFile } from "@/components/file-upload";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from "@heroui/modal";
import { Tab, Tabs } from "@heroui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import type {
  UploadNodeErrorResponse,
  UploadNodeResponse,
} from "@/app/api/upload-node";
import type {
  UploadRelationshipErrorResponse,
  UploadRelationshipResponse,
} from "@/app/api/upload-relationship";
import { useCallback, useState } from "react";

import { Button } from "@heroui/button";
import Papa from "papaparse";
import { Progress } from "@heroui/progress";
import { useNeo4jConnection } from "@/store/neo4j-connection";

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface FilePreview {
  fileName: string;
  headers: string[];
  rows: string[][];
}

export default function Home() {
  const [nodeFiles, setNodeFiles] = useState<UploadedFile[]>([]);
  const [relationshipFiles, setRelationshipFiles] = useState<UploadedFile[]>(
    []
  );
  const [nodePreview, setNodePreview] = useState<FilePreview[]>([]);
  const [relationshipPreview, setRelationshipPreview] = useState<FilePreview[]>(
    []
  );
  const [selectedTab, setSelectedTab] = useState<string>("nodes");
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const { connectionUrl, username, password } = useNeo4jConnection();

  // Progress modal state
  const {
    isOpen: isProgressOpen,
    onOpen: onProgressOpen,
    onOpenChange: onProgressOpenChange,
  } = useDisclosure();
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadType, setUploadType] = useState<"nodes" | "relationships">(
    "nodes"
  );
  const [uploadError, setUploadError] = useState<string>("");

  const handleTabChange = (key: string | number) => {
    const newTab = key.toString();

    // Check if current tab has files
    const currentFiles =
      selectedTab === "nodes" ? nodeFiles : relationshipFiles;

    if (currentFiles.length > 0 && newTab !== selectedTab) {
      setPendingTab(newTab);
      onOpen();
    } else {
      setSelectedTab(newTab);
    }
  };

  const handleConfirmTabChange = () => {
    if (pendingTab) {
      // Clear current tab's files and preview
      if (selectedTab === "nodes") {
        setNodeFiles([]);
        setNodePreview([]);
      } else {
        setRelationshipFiles([]);
        setRelationshipPreview([]);
      }
      setSelectedTab(pendingTab);
      setPendingTab(null);
    }
  };

  const handleCancelTabChange = () => {
    setPendingTab(null);
  };

  const parseFileForPreview = useCallback(
    (files: UploadedFile[], setPreview: (previews: FilePreview[]) => void) => {
      const previews: FilePreview[] = [];
      let parsedCount = 0;

      files.forEach((uploadedFile) => {
        Papa.parse(uploadedFile.file, {
          header: true,
          preview: 5, // Only parse first 5 rows
          skipEmptyLines: true,
          complete: (results) => {
            const headers = results.meta.fields || [];
            const rows = results.data.map((row: any) =>
              headers.map((header) => row[header] || "")
            );

            previews.push({
              fileName: uploadedFile.file.name,
              headers,
              rows,
            });

            parsedCount++;
            if (parsedCount === files.length) {
              setPreview(previews);
            }
          },
        });
      });
    },
    []
  );

  const handleNodeFilesChange = useCallback(
    (files: UploadedFile[]) => {
      setNodeFiles(files);
      if (files.length > 0) {
        parseFileForPreview(files, setNodePreview);
      } else {
        setNodePreview([]);
      }
    },
    [parseFileForPreview]
  );

  const handleRelationshipFilesChange = useCallback(
    (files: UploadedFile[]) => {
      setRelationshipFiles(files);
      if (files.length > 0) {
        parseFileForPreview(files, setRelationshipPreview);
      } else {
        setRelationshipPreview([]);
      }
    },
    [parseFileForPreview]
  );

  const handleSubmitNodes = async () => {
    setUploadType("nodes");
    setUploadStatus("uploading");
    setProgress(0);
    setUploadError("");
    onProgressOpen();

    try {
      // Create FormData and append all files
      const formData = new FormData();
      nodeFiles.forEach((uploadedFile) => {
        formData.append("files", uploadedFile.file);
      });

      // Upload to API with Neo4j connection info in headers
      const response = await fetch("/api/upload-node", {
        method: "POST",
        headers: {
          "x-neo4j-url": connectionUrl,
          "x-neo4j-username": username,
          "x-neo4j-password": password,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            if (data.progress !== undefined) {
              setProgress(data.progress);
              console.log(`${data.progress}%: ${data.message}`);
            }

            if (data.error) {
              console.log("Raw error data:", data.error);
              // Backend sends { error: { error: { message, details } } }
              // We need to access the inner error object
              const errorResponse = data.error as UploadNodeErrorResponse;
              const errorData = errorResponse.error;
              console.log("Error data message:", errorData?.message);
              console.log("Error data details:", errorData?.details);

              const errorMessage = errorData?.details
                ? `${errorData.message}\n${errorData.details.join("\n")}`
                : errorData?.message || "Unknown error";

              console.error("Server error:", errorMessage);
              throw new Error(errorMessage);
            }

            if (data.data) {
              // Success response received
              setProgress(100);
              setUploadStatus("success");
            }
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              console.warn("Failed to parse line:", line);
            } else {
              throw parseError;
            }
          }
        }
      }

      // If we reached here without setting success/error status, something went wrong
      if (uploadStatus === "uploading") {
        throw new Error("Upload completed but no response received");
      }
    } catch (error) {
      console.error("Upload error:", error);
      console.log("Error type:", typeof error);
      console.log("Error is Error instance?", error instanceof Error);

      let errorMessage = "Upload failed";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object") {
        errorMessage = JSON.stringify(error);
      }

      console.log("Setting error message:", errorMessage);

      // Set error state and status together
      setUploadError(errorMessage);
      setProgress(0);

      // Small delay to ensure error state is set before showing modal
      setTimeout(() => {
        setUploadStatus("error");
      }, 50);
    }
  };

  const handleSubmitRelationships = async () => {
    setUploadType("relationships");
    setUploadStatus("uploading");
    setProgress(0);
    setUploadError("");
    onProgressOpen();

    try {
      // Create FormData and append all files
      const formData = new FormData();
      relationshipFiles.forEach((uploadedFile) => {
        formData.append("files", uploadedFile.file);
      });

      // Upload to API with Neo4j connection info in headers
      const response = await fetch("/api/upload-relationship", {
        method: "POST",
        headers: {
          "x-neo4j-url": connectionUrl,
          "x-neo4j-username": username,
          "x-neo4j-password": password,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            if (data.progress !== undefined) {
              setProgress(data.progress);
              console.log(`${data.progress}%: ${data.message}`);
            }

            if (data.error) {
              console.log("Raw error data:", data.error);
              // Backend sends { error: { error: { message, details } } }
              // We need to access the inner error object
              const errorResponse =
                data.error as UploadRelationshipErrorResponse;
              const errorData = errorResponse.error;
              console.log("Error data message:", errorData?.message);
              console.log("Error data details:", errorData?.details);

              const errorMessage = errorData?.details
                ? `${errorData.message}\n${errorData.details.join("\n")}`
                : errorData?.message || "Unknown error";

              console.error("Server error:", errorMessage);
              throw new Error(errorMessage);
            }

            if (data.data) {
              // Success response received
              setProgress(100);
              setUploadStatus("success");
            }
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              console.warn("Failed to parse line:", line);
            } else {
              throw parseError;
            }
          }
        }
      }

      // If we reached here without setting success/error status, something went wrong
      if (uploadStatus === "uploading") {
        throw new Error("Upload completed but no response received");
      }
    } catch (error) {
      console.error("Upload error:", error);
      console.log("Error type:", typeof error);
      console.log("Error is Error instance?", error instanceof Error);

      let errorMessage = "Upload failed";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object") {
        errorMessage = JSON.stringify(error);
      }

      console.log("Setting error message:", errorMessage);

      // Set error state and status together
      setUploadError(errorMessage);
      setProgress(0);

      // Small delay to ensure error state is set before showing modal
      setTimeout(() => {
        setUploadStatus("error");
      }, 50);
    }
  };

  const handleCloseProgressModal = () => {
    setUploadStatus("idle");
    setProgress(0);
    // Clear files and preview after successful upload
    if (uploadStatus === "success") {
      if (uploadType === "nodes") {
        setNodeFiles([]);
        setNodePreview([]);
      } else {
        setRelationshipFiles([]);
        setRelationshipPreview([]);
      }
    }
  };

  return (
    <section className="flex flex-col gap-6 py-8 md:py-10">
      <div className="max-w-5xl w-full mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Neo4j Bulk Data Import</h1>
          <p className="text-default-500">
            Upload your CSV files to import nodes and relationships into your
            Neo4j database
          </p>
        </div>

        <Tabs
          aria-label="Upload options"
          classNames={{
            tabList: "w-full",
            cursor: "w-full",
            tab: "max-w-fit px-6 h-12",
            tabContent: "group-data-[selected=true]:text-primary",
          }}
          color="primary"
          selectedKey={selectedTab}
          size="lg"
          variant="underlined"
          onSelectionChange={handleTabChange}
        >
          {/* Nodes Tab */}
          <Tab
            key="nodes"
            title={
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>Upload Nodes</span>
                {nodeFiles.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-primary-100 text-primary">
                    {nodeFiles.length}
                  </span>
                )}
              </div>
            }
          >
            <Card className="mt-6">
              <CardHeader className="flex flex-col items-start gap-2 pb-4">
                <h2 className="text-xl font-semibold">Node Data Upload</h2>
                <p className="text-small text-default-500">
                  Upload CSV files containing node data. Each row will create a
                  node in Neo4j.
                </p>
              </CardHeader>
              <CardBody>
                {/* CSV Format Requirements */}
                <div className="mb-6 p-4 bg-warning-50 border-l-4 border-warning rounded-r-lg">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-warning flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <p className="font-semibold text-warning-800 mb-2">
                        CSV Format Requirements
                      </p>
                      <ul className="text-sm text-warning-700 space-y-1 list-disc list-inside">
                        <li>
                          The CSV file <strong>must have a header row</strong>
                        </li>
                        <li>
                          One column <strong>must be named "LABEL"</strong> -
                          this will be used as the node label/type
                        </li>
                        <li>
                          All other columns will be used as node properties
                        </li>
                        <li>
                          We recommend using the <strong>id</strong> column as
                          the node identifier because if you plan to upload
                          relationships, you will need to use the id column to
                          identify the nodes.
                        </li>
                        <li>
                          For JSON values (arrays/objects), use double quotes
                          and escape inner quotes with{" "}
                          <code className="px-1 bg-warning-200 rounded">
                            ""
                          </code>
                        </li>
                      </ul>
                      <div className="mt-3 p-2 bg-warning-100 rounded text-xs font-mono text-warning-900 overflow-x-auto">
                        <div className="mb-1">Example with simple values:</div>
                        <div className="mb-2">LABEL,id,name,age</div>
                        <div className="mb-1">Example with JSON values:</div>
                        <div>id,LABEL,skills,metadata</div>
                        <div>
                          1,Person,&quot;[&quot;&quot;JavaScript&quot;&quot;,&quot;&quot;React&quot;&quot;]&quot;,&quot;&#123;&quot;&quot;city&quot;&quot;:&quot;&quot;Istanbul&quot;&quot;&#125;&quot;
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <FileUpload
                  accept={{
                    "text/csv": [".csv"],
                    "application/vnd.ms-excel": [".xls"],
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                      [".xlsx"],
                  }}
                  maxFiles={10}
                  maxSize={50 * 1024 * 1024} // 50MB
                  multiple={true}
                  showPreview={false}
                  onFilesChange={handleNodeFilesChange}
                />

                {/* File Preview */}
                {nodePreview.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <h3 className="text-lg font-semibold">
                      Data Preview (First 5 rows)
                    </h3>
                    {nodePreview.map((preview, idx) => (
                      <div
                        key={idx}
                        className="border border-default-200 rounded-lg overflow-hidden"
                      >
                        <div className="bg-default-100 px-4 py-2 font-semibold text-sm">
                          {preview.fileName}
                        </div>
                        <div className="overflow-x-auto">
                          <Table
                            aria-label={`Preview of ${preview.fileName}`}
                            className="min-w-full"
                            isCompact
                            removeWrapper
                          >
                            <TableHeader>
                              {preview.headers.map((header, headerIdx) => (
                                <TableColumn key={headerIdx}>
                                  {header}
                                </TableColumn>
                              ))}
                            </TableHeader>
                            <TableBody>
                              {preview.rows.map((row, rowIdx) => (
                                <TableRow key={rowIdx}>
                                  {row.map((cell, cellIdx) => (
                                    <TableCell
                                      key={cellIdx}
                                      className="text-xs max-w-xs truncate"
                                    >
                                      {cell}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {nodeFiles.length > 0 && (
                  <>
                    <div className="mt-6 p-4 bg-default-50 rounded-lg">
                      <div className="flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-primary mt-0.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium">Next Steps</p>
                          <p className="text-sm text-default-500 mt-1">
                            Click the submit button below to process and import
                            your node data into Neo4j.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                      <Button
                        color="primary"
                        size="lg"
                        startContent={
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        }
                        onPress={handleSubmitNodes}
                      >
                        Submit Node Data ({nodeFiles.length}{" "}
                        {nodeFiles.length === 1 ? "file" : "files"})
                      </Button>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          </Tab>

          {/* Relationships Tab */}
          <Tab
            key="relationships"
            title={
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>Upload Relationships</span>
                {relationshipFiles.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-primary-100 text-primary">
                    {relationshipFiles.length}
                  </span>
                )}
              </div>
            }
          >
            <Card className="mt-6">
              <CardHeader className="flex flex-col items-start gap-2 pb-4">
                <h2 className="text-xl font-semibold">
                  Relationship Data Upload
                </h2>
                <p className="text-small text-default-500">
                  Upload CSV files containing relationship data. Each row will
                  create a relationship between nodes.
                </p>
              </CardHeader>
              <CardBody>
                {/* CSV Format Requirements */}
                <div className="mb-6 p-4 bg-warning-50 border-l-4 border-warning rounded-r-lg">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-warning flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <p className="font-semibold text-warning-800 mb-2">
                        CSV Format Requirements
                      </p>
                      <ul className="text-sm text-warning-700 space-y-1 list-disc list-inside">
                        <li>
                          The CSV file <strong>must have a header row</strong>
                        </li>
                        <li>
                          <strong>Required columns:</strong> TYPE, FROM_LABEL,
                          FROM_ID, TO_LABEL, TO_ID
                        </li>
                        <li>
                          <strong>TYPE:</strong> Relationship type (e.g.,
                          WORKS_AT, KNOWS)
                        </li>
                        <li>
                          <strong>FROM_LABEL & FROM_ID:</strong> Source node
                          label and ID
                        </li>
                        <li>
                          <strong>TO_LABEL & TO_ID:</strong> Target node label
                          and ID
                        </li>
                        <li>
                          All other columns will be relationship properties
                        </li>
                        <li>
                          For JSON values (arrays/objects), use double quotes
                          and escape inner quotes with{" "}
                          <code className="px-1 bg-warning-200 rounded">
                            ""
                          </code>
                        </li>
                      </ul>
                      <div className="mt-3 p-2 bg-warning-100 rounded text-xs font-mono text-warning-900 overflow-x-auto">
                        <div className="mb-1">Example:</div>
                        <div className="mb-1">
                          TYPE,FROM_LABEL,FROM_ID,TO_LABEL,TO_ID,since
                        </div>
                        <div>WORKS_AT,Person,1,Company,10,2020</div>
                      </div>
                    </div>
                  </div>
                </div>
                <FileUpload
                  accept={{
                    "text/csv": [".csv"],
                    "application/vnd.ms-excel": [".xls"],
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                      [".xlsx"],
                  }}
                  maxFiles={10}
                  maxSize={50 * 1024 * 1024} // 50MB
                  multiple={true}
                  showPreview={false}
                  onFilesChange={handleRelationshipFilesChange}
                />

                {/* File Preview */}
                {relationshipPreview.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <h3 className="text-lg font-semibold">
                      Data Preview (First 5 rows)
                    </h3>
                    {relationshipPreview.map((preview, idx) => (
                      <div
                        key={idx}
                        className="border border-default-200 rounded-lg overflow-hidden"
                      >
                        <div className="bg-default-100 px-4 py-2 font-semibold text-sm">
                          {preview.fileName}
                        </div>
                        <div className="overflow-x-auto">
                          <Table
                            aria-label={`Preview of ${preview.fileName}`}
                            className="min-w-full"
                            isCompact
                            removeWrapper
                          >
                            <TableHeader>
                              {preview.headers.map((header, headerIdx) => (
                                <TableColumn key={headerIdx}>
                                  {header}
                                </TableColumn>
                              ))}
                            </TableHeader>
                            <TableBody>
                              {preview.rows.map((row, rowIdx) => (
                                <TableRow key={rowIdx}>
                                  {row.map((cell, cellIdx) => (
                                    <TableCell
                                      key={cellIdx}
                                      className="text-xs max-w-xs truncate"
                                    >
                                      {cell}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {relationshipFiles.length > 0 && (
                  <>
                    <div className="mt-6 p-4 bg-default-50 rounded-lg">
                      <div className="flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-primary mt-0.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium">Next Steps</p>
                          <p className="text-sm text-default-500 mt-1">
                            Click the submit button below to process and import
                            your relationship data into Neo4j.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                      <Button
                        color="primary"
                        size="lg"
                        startContent={
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        }
                        onPress={handleSubmitRelationships}
                      >
                        Submit Relationship Data ({relationshipFiles.length}{" "}
                        {relationshipFiles.length === 1 ? "file" : "files"})
                      </Button>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          </Tab>
        </Tabs>

        {/* Tab Change Confirmation Modal */}
        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-6 h-6 text-warning"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Switch Tab?</span>
                  </div>
                </ModalHeader>
                <ModalBody>
                  <p>
                    You have uploaded files in the current tab. Switching tabs
                    will clear these files. Are you sure you want to continue?
                  </p>
                </ModalBody>
                <ModalFooter>
                  <Button
                    color="default"
                    variant="light"
                    onPress={() => {
                      handleCancelTabChange();
                      onClose();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="warning"
                    onPress={() => {
                      handleConfirmTabChange();
                      onClose();
                    }}
                  >
                    Switch Tab
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* Upload Progress Modal */}
        <Modal
          hideCloseButton={uploadStatus === "uploading"}
          isDismissable={uploadStatus !== "uploading"}
          isOpen={isProgressOpen}
          onOpenChange={onProgressOpenChange}
          onClose={handleCloseProgressModal}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  {uploadStatus === "uploading" && (
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-6 h-6 text-primary animate-spin"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>
                        Uploading{" "}
                        {uploadType === "nodes" ? "Nodes" : "Relationships"}
                      </span>
                    </div>
                  )}
                  {uploadStatus === "success" && (
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-6 h-6 text-success"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Upload Complete!</span>
                    </div>
                  )}
                  {uploadStatus === "error" && (
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-6 h-6 text-danger"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Upload Failed</span>
                    </div>
                  )}
                </ModalHeader>
                <ModalBody>
                  {uploadStatus === "uploading" && (
                    <div className="space-y-4">
                      <p className="text-default-500">
                        Uploading{" "}
                        {uploadType === "nodes"
                          ? nodeFiles.length
                          : relationshipFiles.length}{" "}
                        {uploadType === "nodes"
                          ? nodeFiles.length === 1
                            ? "file"
                            : "files"
                          : relationshipFiles.length === 1
                            ? "file"
                            : "files"}{" "}
                        to Neo4j database...
                      </p>
                      <Progress
                        aria-label="Upload progress"
                        color="primary"
                        showValueLabel
                        size="lg"
                        value={progress}
                      />
                      <div className="text-sm text-default-400">
                        <p>Please wait while we process your data.</p>
                        <p className="mt-1">This may take a few moments.</p>
                      </div>
                    </div>
                  )}
                  {uploadStatus === "success" && (
                    <div className="space-y-4">
                      <Progress
                        aria-label="Upload complete"
                        color="success"
                        size="lg"
                        value={100}
                      />
                      <div className="p-4 bg-success-50 rounded-lg">
                        <p className="text-success-700">
                          Successfully uploaded{" "}
                          {uploadType === "nodes"
                            ? nodeFiles.length
                            : relationshipFiles.length}{" "}
                          {uploadType === "nodes"
                            ? nodeFiles.length === 1
                              ? "file"
                              : "files"
                            : relationshipFiles.length === 1
                              ? "file"
                              : "files"}{" "}
                          to your Neo4j database.
                        </p>
                      </div>
                    </div>
                  )}
                  {uploadStatus === "error" && (
                    <div className="space-y-4">
                      <div className="p-4 bg-danger-50 rounded-lg">
                        <p className="text-danger-700 font-medium mb-2">
                          Failed to upload files
                        </p>
                        <div className="text-danger-600 text-sm whitespace-pre-line">
                          {uploadError || "An unexpected error occurred"}
                        </div>
                      </div>
                    </div>
                  )}
                </ModalBody>
                {(uploadStatus === "success" || uploadStatus === "error") && (
                  <ModalFooter>
                    <Button
                      color={uploadStatus === "success" ? "primary" : "danger"}
                      onPress={onClose}
                    >
                      {uploadStatus === "success" ? "Done" : "Close"}
                    </Button>
                  </ModalFooter>
                )}
              </>
            )}
          </ModalContent>
        </Modal>
      </div>
    </section>
  );
}
