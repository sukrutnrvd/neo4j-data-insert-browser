"use client";

import { useNeo4jConnection } from "@/store/neo4j-connection";

interface ProtectedContentProps {
  children: React.ReactNode;
}

export const ProtectedContent = ({ children }: ProtectedContentProps) => {
  const { isConnected } = useNeo4jConnection();

  if (!isConnected) {
    return null;
  }

  return <>{children}</>;
};
