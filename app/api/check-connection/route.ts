import {
  CheckConnectionErrorResponse,
  CheckConnectionResponse,
  checkConnectionRequestSchema,
} from "./route.type";

import { NextResponse } from "next/server";
import neo4j from "neo4j-driver";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate request body with Zod
    const validationResult = checkConnectionRequestSchema.safeParse(body);

    if (!validationResult.success) {
      const errorResponse: CheckConnectionErrorResponse = {
        error: {
          message: "Validation failed",
          details: validationResult.error.issues.map((err) => err.message),
        },
      };

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const { connectionUrl, username, password } = validationResult.data;

    // Create Neo4j driver instance
    let driver = null;

    try {
      driver = neo4j.driver(
        connectionUrl,
        neo4j.auth.basic(username, password)
      );

      // Test the connection by verifying connectivity
      await driver.verifyConnectivity();

      // If we get here, connection is successful
      const response: CheckConnectionResponse = {
        data: {
          isConnected: true,
        },
      };

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      const errorResponse: CheckConnectionErrorResponse = {
        error: {
          message: "Connection failed",
          details: [
            error instanceof Error ? error.message : "Unknown error occurred",
          ],
        },
      };

      return NextResponse.json(errorResponse, { status: 401 });
    } finally {
      // Always close the driver
      if (driver) {
        await driver.close();
      }
    }
  } catch (error) {
    const errorResponse: CheckConnectionErrorResponse = {
      error: {
        message: "Internal server error",
        details: [
          error instanceof Error ? error.message : "Unknown error occurred",
        ],
      },
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
