import { NextRequest, NextResponse } from "next/server";
import {
  ParsedCSVData,
  UploadNodeErrorResponse,
  UploadNodeResponse,
} from "./route.type";

import Papa from "papaparse";
import neo4j from "neo4j-driver";

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    // Get Neo4j connection info from headers (sent by client)
    const connectionUrl = request.headers.get("x-neo4j-url");
    const username = request.headers.get("x-neo4j-username");
    const password = request.headers.get("x-neo4j-password");

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (progress: number, message: string) => {
          const data = JSON.stringify({ progress, message }) + "\n";
          controller.enqueue(encoder.encode(data));
        };

        try {
          if (!files || files.length === 0) {
            const errorResponse: UploadNodeErrorResponse = {
              error: {
                message: "No files provided",
              },
            };
            controller.enqueue(
              encoder.encode(JSON.stringify({ error: errorResponse }) + "\n")
            );
            controller.close();

            return;
          }

          // Validate Neo4j connection info
          if (!connectionUrl || !username || !password) {
            const errorResponse: UploadNodeErrorResponse = {
              error: {
                message: "Neo4j connection information missing",
                details: ["Please ensure you are connected to Neo4j"],
              },
            };
            controller.enqueue(
              encoder.encode(JSON.stringify({ error: errorResponse }) + "\n")
            );
            controller.close();

            return;
          }

          sendProgress(5, "Parsing CSV files...");

          const parsedFiles: ParsedCSVData[] = [];
          let totalRows = 0;

          // Parse each CSV file
          for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            const file = files[fileIndex];

            try {
              sendProgress(
                5 + (fileIndex / files.length) * 10,
                `Parsing ${file.name}...`
              );

              const fileContent = await file.text();

              // Parse CSV using papaparse
              const parseResult = Papa.parse<Record<string, string>>(
                fileContent,
                {
                  header: true,
                  skipEmptyLines: true,
                  dynamicTyping: false,
                  transformHeader: (header) => header.trim(),
                }
              );

              if (parseResult.errors.length > 0) {
                console.warn(
                  `Warnings while parsing ${file.name}:`,
                  parseResult.errors
                );
              }

              const headers = parseResult.meta.fields || [];

              // Validate: CSV must have headers
              if (headers.length === 0) {
                const errorResponse: UploadNodeErrorResponse = {
                  error: {
                    message: `File "${file.name}" has no headers`,
                    details: [
                      "The CSV file must have a header row with column names.",
                    ],
                  },
                };
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ error: errorResponse }) + "\n"
                  )
                );
                controller.close();

                return;
              }

              // Validate: CSV must have a LABEL column
              if (!headers.includes("LABEL")) {
                const errorResponse: UploadNodeErrorResponse = {
                  error: {
                    message: `File "${file.name}" is missing required "LABEL" column`,
                    details: [
                      'The CSV file must have a column named "LABEL" for the node type.',
                      `Found columns: ${headers.join(", ")}`,
                    ],
                  },
                };
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ error: errorResponse }) + "\n"
                  )
                );
                controller.close();

                return;
              }

              const parsedData: ParsedCSVData = {
                fileName: file.name,
                headers,
                rows: parseResult.data,
                rowCount: parseResult.data.length,
              };

              parsedFiles.push(parsedData);
              totalRows += parsedData.rowCount;

              console.log(`Parsed ${file.name}:`, {
                headers: parsedData.headers,
                rowCount: parsedData.rowCount,
                sampleRow: parsedData.rows[0],
              });
            } catch (fileError) {
              console.error(`Error parsing file ${file.name}:`, fileError);
              const errorResponse: UploadNodeErrorResponse = {
                error: {
                  message: `Failed to parse file: ${file.name}`,
                  details: [
                    fileError instanceof Error
                      ? fileError.message
                      : "Unknown error occurred",
                  ],
                },
              };
              controller.enqueue(
                encoder.encode(JSON.stringify({ error: errorResponse }) + "\n")
              );
              controller.close();

              return;
            }
          }

          sendProgress(
            15,
            `Parsed ${totalRows} rows from ${files.length} file(s)`
          );
          sendProgress(20, "Connecting to Neo4j...");

          // Connect to Neo4j and insert data
          let driver = null;

          try {
            driver = neo4j.driver(
              connectionUrl,
              neo4j.auth.basic(username, password)
            );

            const session = driver.session();
            let totalInserted = 0;
            let processedRows = 0;

            try {
              sendProgress(25, "Starting data insertion...");

              // Process each file
              for (const parsedFile of parsedFiles) {
                console.log(`Inserting data from ${parsedFile.fileName}...`);

                // Group rows by LABEL for better performance
                const rowsByLabel = new Map<string, Record<string, string>[]>();

                for (const row of parsedFile.rows) {
                  const label = row.LABEL;

                  if (!label) {
                    console.warn("Row without LABEL, skipping:", row);
                    continue;
                  }

                  if (!rowsByLabel.has(label)) {
                    rowsByLabel.set(label, []);
                  }

                  // Remove LABEL from properties
                  const { LABEL: _, ...properties } = row;
                  rowsByLabel.get(label)!.push(properties);
                }

                // Process each label's rows in batches
                const labelEntries = Array.from(rowsByLabel.entries());

                for (const [label, rows] of labelEntries) {
                  console.log(
                    `Processing ${rows.length} nodes with label: ${label}`
                  );

                  const batchSize = 1000;

                  for (let i = 0; i < rows.length; i += batchSize) {
                    const batch = rows.slice(i, i + batchSize);

                    // Use UNWIND for batch insert - MUCH faster!
                    await session.executeWrite(async (tx) => {
                      // Use CREATE instead of MERGE for better performance
                      // Each row creates a new node with all its properties
                      const query = `
                  UNWIND $batch AS row
                  CREATE (n:\`${label}\`)
                  SET n = row
                  RETURN count(n) as created
                `;

                      const result = await tx.run(query, { batch });
                      const created =
                        result.records[0]?.get("created").toNumber() || 0;
                      totalInserted += created;
                    });

                    console.log(
                      `Processed ${Math.min(i + batchSize, rows.length)} / ${
                        rows.length
                      } rows for label "${label}"`
                    );
                  }
                }

                console.log(
                  `Completed ${parsedFile.fileName}: ${parsedFile.rows.length} rows processed`
                );
              }

              sendProgress(95, "Finalizing...");

              const response: UploadNodeResponse = {
                data: {
                  success: true,
                  processedFiles: parsedFiles.length,
                  totalRows: totalInserted,
                  message: `Successfully inserted ${totalInserted} nodes from ${parsedFiles.length} file(s)`,
                },
              };

              sendProgress(100, "Upload complete!");
              controller.enqueue(
                encoder.encode(JSON.stringify({ data: response.data }) + "\n")
              );
              controller.close();
            } finally {
              await session.close();
            }
          } catch (neo4jError) {
            console.error("Neo4j error:", neo4jError);
            const errorResponse: UploadNodeErrorResponse = {
              error: {
                message: "Failed to insert data into Neo4j",
                details: [
                  neo4jError instanceof Error
                    ? neo4jError.message
                    : "Unknown Neo4j error",
                ],
              },
            };
            controller.enqueue(
              encoder.encode(JSON.stringify({ error: errorResponse }) + "\n")
            );
            controller.close();
          } finally {
            if (driver) {
              await driver.close();
            }
          }
        } catch (error) {
          console.error("Error processing upload:", error);
          const errorResponse: UploadNodeErrorResponse = {
            error: {
              message: "Internal server error",
              details: [
                error instanceof Error
                  ? error.message
                  : "Unknown error occurred",
              ],
            },
          };
          controller.enqueue(
            encoder.encode(JSON.stringify({ error: errorResponse }) + "\n")
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error creating stream:", error);
    const errorResponse: UploadNodeErrorResponse = {
      error: {
        message: "Failed to create upload stream",
        details: [
          error instanceof Error ? error.message : "Unknown error occurred",
        ],
      },
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
