"use client";

import type {
  CheckConnectionErrorResponse,
  CheckConnectionResponse,
} from "@/app/api/check-connection";
import type {
  ConnectionFormData,
  Neo4jConnectionModalProps,
} from "./neo4j-connection-modal.types";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";

import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { useForm } from "react-hook-form";
import { useNeo4jConnection } from "@/store/neo4j-connection";
import { useState } from "react";

export const Neo4jConnectionModal: React.FC<Neo4jConnectionModalProps> = ({
  serverUrl = "",
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const { isConnected, setConnection } = useNeo4jConnection();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectionFormData>({
    defaultValues: {
      username: "neo4j",
      connectionUrl: serverUrl,
      password: "",
    },
  });

  const onSubmit = async (data: ConnectionFormData) => {
    setIsConnecting(true);
    setError("");

    try {
      const response = await fetch("/api/check-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const responseData = (await response.json()) as
        | CheckConnectionResponse
        | CheckConnectionErrorResponse;

      if (!response.ok) {
        const errorData = responseData as CheckConnectionErrorResponse;
        throw new Error(
          errorData.error.details?.[0] || errorData.error.message
        );
      }

      const successData = responseData as CheckConnectionResponse;

      if (successData.data.isConnected) {
        setConnection(data.connectionUrl, data.username, data.password);
      } else {
        throw new Error("Connection failed");
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Connection failed. Please check your credentials and try again."
      );
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Modal
      backdrop="opaque"
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      isOpen={!isConnected}
      hideCloseButton
    >
      <ModalContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader className="flex flex-col gap-1">
            Neo4j Connection
          </ModalHeader>
          <ModalBody>
            <p className="text-small text-default-500 mb-4">
              Please connect to your Neo4j database to continue.
            </p>

            <Input
              {...register("connectionUrl", {
                required: "Connection URL is required",
                pattern: {
                  value:
                    /^(neo4j|neo4j\+s|neo4j\+ssc|bolt|bolt\+s|bolt\+ssc):\/\/.+/,
                  message:
                    "Please enter a valid Neo4j connection URL (e.g., neo4j://localhost:7687)",
                },
              })}
              autoFocus
              errorMessage={errors.connectionUrl?.message}
              isInvalid={!!errors.connectionUrl}
              label="Connection URL"
              placeholder="neo4j://localhost:7687"
              variant="bordered"
            />

            <Input
              {...register("username", {
                required: "Username is required",
                minLength: {
                  value: 1,
                  message: "Username cannot be empty",
                },
              })}
              errorMessage={errors.username?.message}
              isInvalid={!!errors.username}
              label="Username"
              placeholder="neo4j"
              variant="bordered"
            />

            <Input
              {...register("password", {
                required: "Password is required",
                minLength: {
                  value: 1,
                  message: "Password cannot be empty",
                },
              })}
              errorMessage={errors.password?.message}
              isInvalid={!!errors.password}
              label="Password"
              placeholder="Enter your password"
              type="password"
              variant="bordered"
            />

            {error && <div className="text-danger text-small">{error}</div>}
          </ModalBody>
          <ModalFooter>
            <Button color="primary" isLoading={isConnecting} type="submit">
              Connect
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
