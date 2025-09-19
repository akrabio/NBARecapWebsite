// app/api/records/[date]/route.js
import { MongoClient } from "mongodb";

const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@cluster0.vrszcwe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const dbName = "app";
const collectionName = "game_recaps";

let client;
let clientPromise;

if (!process.env.MONGODB_PASSWORD) {
  throw new Error("Please add your MongoDB password to .env.local");
}

if (!process.env.MONGODB_USER) {
  throw new Error("Please add your MongoDB user to .env.local");
}


if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable to preserve the connection
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

export async function GET(request, { params }) {
  try {
    const { date } = await params;

    if (!date) {
      return Response.json(
        { error: "Date parameter is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const records = await collection.find({ date }).toArray();

    return Response.json({ records });
  } catch (error) {
    console.error("Database error:", error);
    return Response.json({ error: "Failed to fetch records" }, { status: 500 });
  }
}
