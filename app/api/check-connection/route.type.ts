import { z } from "zod";

export const checkConnectionRequestSchema = z.object({
  connectionUrl: z
    .string()
    .min(1, "Connection URL is required")
    .regex(
      /^(neo4j|neo4j\+s|neo4j\+ssc|bolt|bolt\+s|bolt\+ssc):\/\/.+/,
      "Invalid Neo4j connection URL format"
    ),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type CheckConnectionRequest = z.infer<
  typeof checkConnectionRequestSchema
>;

export interface CheckConnectionResponse {
  data: {
    isConnected: boolean;
  };
}

export interface CheckConnectionErrorResponse {
  error: {
    message: string;
    details?: string[];
  };
}
