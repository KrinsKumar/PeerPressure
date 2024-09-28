import express from "express";
import { createClient } from "redis";
import {
  addWorker,
  getWorkers,
  addFileId,
  getFileId,
  getFileChunks,
  addFileChunks,
} from "./database.js";

const app = express();
app.use(express.json());

const client = createClient({
  url: "redis://localhost:6379",
});
client.on("error", (err) => console.error("Redis Client Error", err));
await client.connect();

// get all workers
app.get("/worker", async (req, res) => {
  console.log("Getting all workers");
  let workers = await getWorkers(client);
  res.json(workers);
});

// add a new worker
app.post("/worker", async (req, res) => {
  let id, route, status, last_seen;
  try {
    ({ id, route, status, last_seen } = req.body);
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
  if (await addWorker(client, id, route, status, last_seen)) {
    res.json({ id, route, status, last_seen });
  } else {
    res.status(500).send("Redis did not save the new Worker");
  }
});

// get all the chunks of a file
app.post("/files", async (req, res) => {
  let fileId, fileHash;
  try {
    ({ fileId, fileHash } = req.body);
  } catch (e) {
    res.status(400).send("Please provide a file id and hash");
    return;
  }
  if (await addFileId(client, fileId, fileHash)) {
    res.json({ fileId, fileHash });
  } else {
    res.status(500).send("Redis did not save the new File");
  }
});

// gets the file hash
app.get("/files:id", async (req, res) => {
  let fileId = req.params.id;
  let fileHash = await getFileId(client, fileId);
  res.json({ fileId, fileHash });
});

// add all the chunks that a file has
app.post("/files/:id/chunks", async (req, res) => {
  let fileId = req.params.id;
  let chunks;
  try {
    chunks = req.body;
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
  await addFileChunks(client, fileId, chunks);
  res.json({ fileId, chunks });
});

// get all the chunks of a file
app.get("/files/:id/chunks", async (req, res) => {
  let fileId = req.params.id;
  let chunks = await getFileChunks(client, fileId);
  res.json({ fileId, chunks });
});

// make the final 404 route
app.get("*", (req, res) => {
  res.send("404");
});

// listen to the port
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
