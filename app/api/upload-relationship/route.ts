import { NextRequest, NextResponse } from "next/server";
import {
  ParsedRelationshipData,
  UploadRelationshipErrorResponse,
  UploadRelationshipResponse,
} from "./route.type";

import Papa from "papaparse";
import neo4j from "neo4j-driver";

const REQUIRED_COLUMNS = ["TYPE", "FROM_LABEL", "FROM_ID", "TO_LABEL", "TO_ID"];

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
            const errorResponse: UploadRelationshipErrorResponse = {
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
            const errorResponse: UploadRelationshipErrorResponse = {
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

          const parsedFiles: ParsedRelationshipData[] = [];
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
                const errorResponse: UploadRelationshipErrorResponse = {
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

              // Validate: CSV must have all required columns
              const missingColumns = REQUIRED_COLUMNS.filter(
                (col) => !headers.includes(col)
              );

              if (missingColumns.length > 0) {
                const errorResponse: UploadRelationshipErrorResponse = {
                  error: {
                    message: `File "${file.name}" is missing required columns`,
                    details: [
                      `Required columns: ${REQUIRED_COLUMNS.join(", ")}`,
                      `Missing columns: ${missingColumns.join(", ")}`,
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

              const parsedData: ParsedRelationshipData = {
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
              const errorResponse: UploadRelationshipErrorResponse = {
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
            let totalCreated = 0;
            let processedRows = 0;

            try {
              sendProgress(25, "Checking/creating indexes...");

              // Create indexes on id property for better performance
              // This will speed up MATCH queries significantly
              try {
                await session.run(`
                  CREATE INDEX IF NOT EXISTS FOR (n) ON (n.id)
                `);
                console.log("Index created/verified for id property");
              } catch (indexError) {
                console.warn("Index creation warning:", indexError);
                // Continue even if index creation fails
              }

              sendProgress(30, "Starting relationship creation...");

              // Process each file
              for (const parsedFile of parsedFiles) {
                console.log(
                  `Creating relationships from ${parsedFile.fileName}...`
                );

                // Group rows by TYPE for better performance
                const rowsByType = new Map<string, Record<string, string>[]>();

                for (const row of parsedFile.rows) {
                  const type = row.TYPE;

                  if (!type) {
                    console.warn("Row without TYPE, skipping:", row);
                    continue;
                  }

                  if (!rowsByType.has(type)) {
                    rowsByType.set(type, []);
                  }

                  rowsByType.get(type)!.push(row);
                }

                // Process each type's rows in batches
                const typeEntries = Array.from(rowsByType.entries());

                for (const [type, rows] of typeEntries) {
                  console.log(
                    `Processing ${rows.length} relationships with type: ${type}`
                  );

                  const batchSize = 5000; // Increased from 1000 for better performance

                  for (let i = 0; i < rows.length; i += batchSize) {
                    const batch = rows.slice(i, i + batchSize);

                    // Use UNWIND for batch relationship creation - MUCH faster!
                    await session.executeWrite(async (tx) => {
                      // Get property keys (excluding the required ones)
                      const sampleRow = batch[0];
                      const propertyKeys = Object.keys(sampleRow).filter(
                        (key) => !REQUIRED_COLUMNS.includes(key)
                      );

                      // Build properties object for relationship
                      const propsObj =
                        propertyKeys.length > 0
                          ? `{${propertyKeys
                              .map((key) => `${key}: row.${key}`)
                              .join(", ")}}`
                          : "{}";

                      // Optimized query: Use CREATE instead of MERGE for speed
                      // If you need MERGE (to avoid duplicates), consider adding a constraint
                      const query = `
                        UNWIND $batch AS row
                        MATCH (from {id: row.FROM_ID})
                        MATCH (to {id: row.TO_ID})
                        CREATE (from)-[r:\`${type}\` ${propsObj}]->(to)
                        RETURN count(r) as created
                      `;

                      const result = await tx.run(query, { batch });
                      const created =
                        result.records[0]?.get("created").toNumber() || 0;
                      totalCreated += created;
                      processedRows += batch.length;

                      // Calculate progress (30% to 95%)
                      const progress = 30 + (processedRows / totalRows) * 65;
                      sendProgress(
                        Math.round(progress),
                        `Created ${processedRows}/${totalRows} relationships...`
                      );
                    });

                    console.log(
                      `Processed ${Math.min(i + batchSize, rows.length)} / ${
                        rows.length
                      } rows for type "${type}"`
                    );
                  }
                }

                console.log(
                  `Completed ${parsedFile.fileName}: ${parsedFile.rows.length} rows processed`
                );
              }

              sendProgress(95, "Finalizing...");

              const response: UploadRelationshipResponse = {
                data: {
                  success: true,
                  processedFiles: parsedFiles.length,
                  totalRows: totalCreated,
                  message: `Successfully created ${totalCreated} relationships from ${parsedFiles.length} file(s)`,
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
            const errorResponse: UploadRelationshipErrorResponse = {
              error: {
                message: "Failed to create relationships in Neo4j",
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
          const errorResponse: UploadRelationshipErrorResponse = {
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
    const errorResponse: UploadRelationshipErrorResponse = {
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
