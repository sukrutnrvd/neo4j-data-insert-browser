import { create } from "zustand";

interface Neo4jConnectionStore {
  connectionUrl: string;
  username: string;
  password: string;
  isConnected: boolean;
  setConnection: (url: string, username: string, password: string) => void;
  disconnect: () => void;
}

export const useNeo4jConnection = create<Neo4jConnectionStore>((set) => ({
  connectionUrl: "",
  username: "",
  password: "",
  isConnected: false,
  setConnection: (url: string, username: string, password: string) =>
    set({ connectionUrl: url, username, password, isConnected: true }),
  disconnect: () =>
    set({ connectionUrl: "", username: "", password: "", isConnected: false }),
}));
