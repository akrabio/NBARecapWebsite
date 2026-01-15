import { MongoClient } from "mongodb";

if (!process.env.MONGODB_PASSWORD) {
  throw new Error("Please add your MongoDB password to .env.local");
}

if (!process.env.MONGODB_USER) {
  throw new Error("Please add your MongoDB user to .env.local");
}

const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@cluster0.vrszcwe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

let client;
let clientPromise;

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable to preserve the connection
  // across hot reloads
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, create a new client
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

// Database and collection constants
export const DB_NAME = "app";
export const COLLECTIONS = {
  GAME_RECAPS: "game_recaps",
};

export default clientPromise;
