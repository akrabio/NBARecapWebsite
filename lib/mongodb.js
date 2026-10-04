import { MongoClient } from "mongodb";

// Database and collection constants
export const DB_NAME = "app";
export const COLLECTIONS = {
  GAME_RECAPS: "game_recaps",
};

const DEFAULT_HOST = "cluster0.vrszcwe.mongodb.net";

// MONGODB_URI if set; otherwise built from MONGODB_USER / MONGODB_PASSWORD.
function connectionString() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

  const { MONGODB_USER: user, MONGODB_PASSWORD: password } = process.env;
  if (!user || !password) {
    throw new Error("Set MONGODB_URI, or MONGODB_USER and MONGODB_PASSWORD, in .env.local");
  }
  const host = process.env.MONGODB_HOST || DEFAULT_HOST;
  return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/?retryWrites=true&w=majority&appName=Cluster0`;
}

// Connects on first use (not at import), so builds don't need credentials.
// Kept on globalThis so dev hot reloads reuse one connection.
export function getMongoClient() {
  if (!globalThis._mongoClientPromise) {
    globalThis._mongoClientPromise = new MongoClient(connectionString()).connect().catch((error) => {
      globalThis._mongoClientPromise = null; // retry on the next request
      throw error;
    });
  }
  return globalThis._mongoClientPromise;
}
