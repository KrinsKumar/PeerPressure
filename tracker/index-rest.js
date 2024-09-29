import express from "express";
import { createClient } from "redis";
import { addFileChunks, getFileChunks } from "./database.js";
import cors from "cors";
import readline from "readline"; // CLI integration
import axios from "axios";

const REDIS_HOST = process.env.REDIS_HOST || "localhost"
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379
const TRACKER_PORT = Number(process.env.TRACKER_PORT) || 3000

const app = express();
app.use(cors());
app.use(express.json());
const client = createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
});
client.on("error", (err) => console.error("Redis Client Error", err));

let workers = [];
let files = new Map();
let fileHashToChunkHash = new Map();
let nodeToChunkHash = new Map();
let chunkHashToNode = new Map();

await client.connect();

setInterval(async () => {
  console.log("Pinging all workers...");

  for (const worker of workers) {
    try {
      console.log(`Pinging worker ${worker.id} at ${worker.route}/heartbeat`);

      const response = await axios.get(`${worker.route}/heartbeat`, { timeout: 5000 }); // README: request timeout MUST be less than the interval

      if (response.status === 200) {
        worker.status = "active";  // Set status to active if the ping is successful
        worker.lastSeen = new Date();  // Update the last seen timestamp
        console.log(`Worker ${worker.id} is active.`);
      }
    } catch (error) {
      worker.status = "inactive";  // Set status to inactive if the ping fails
      console.error(`Worker ${worker.id} is not reachable. Error:`, error.message);
    }
  }
}, 15000); 

// get all workers
app.get("/worker", async (req, res) => {
  console.log("Getting all workers");
  res.json(workers);
});

// add a new worker
app.post("/worker", async (req, res) => {
  let id, route, status;
  try {
    ({ id, route, status } = req.body);
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
  const lastSeen = new Date().getTime();

  workers = workers.filter((worker) => worker.id !== id);
  workers.push({ id, route, status, lastSeen });
  console.log("Adding a worker", id, route, status, lastSeen);
  res.send({ id, route, status, lastSeen });
});

// update a worker
app.put("/worker/:id", async (req, res) => {
  let id = req.params.id;
  let status;
  try {
    ({ status } = req.body);
  } catch (e) {
    res.status(400).send("Please provide a status");
    return;
  }
  workers[id] = { ...workers[id], status };
  res.json({ id, status });
});

// add a file id
app.post("/files", async (req, res) => {
  let fileName, fileHash, size;
  try {
    ({ fileName, fileHash, size } = req.body);
  } catch (e) {
    res.status(400).send("Please provide a file id and hash");
    return;
  }
  console.log("Adding a file", fileName, fileHash, size);
  files[fileHash] = { fileName, size };
  res.json("success");
});

// gets the file info
app.get("/files/:id", async (req, res) => {
  let fileId = req.params.id;
  let file = files[fileId];
  if (file) {
    res.status(200).json(file);
  } else {
    res.status(404).json({ error: "File not found" });
  }
  return;
});

// get all the files
app.get("/files", async (req, res) => {
  res.json(files);
});

// add the chunks meta data
app.post("/files/:id/chunks", async (req, res) => {
  let fileHash = req.params.id;
  let chunks;
  console.log("Adding chunks", fileHash);
  try {
    chunks = req.body.chunk["fileId"];
    console.log(chunks);
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
  if (await addFileChunks(client, fileHash, chunks)) {
    res.json({ fileHash, chunks });
  } else {
    res.status(400).send("Could not add the chunks");
  }
});

// get the chunks meta data
app.get("/files/:id/chunks", async (req, res) => {
  let fileId = req.params.id;
  const files = await getFileChunks(client, fileId);
  res.json(files);
});

// Store the chunk hashes
app.post("/chunks/:id/hash", async (req, res) => {
  const { chunkHashes } = req.body;
  const fileHash = req.params.id;
  try {
    fileHashToChunkHash[fileHash] = chunkHashes;
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
  console.log("Adding a chunk hash", fileHash, chunkHashes);
  res.json({ fileHash, chunkHashes });
});

// Get the chunk hashes
app.get("/chunks/:id/hash", async (req, res) => {
  return res.json(fileHashToChunkHash[req.params.id]);
});

// Store the node to chunk hashes
app.post("/db/:id/chunks", async (req, res) => {
  const { chunkHashes } = req.body;
  const nodeId = req.params.id;
  if (!nodeToChunkHash[nodeId]) {
    nodeToChunkHash[nodeId] = [];
  }
  try {
    nodeToChunkHash[nodeId].push(...chunkHashes);
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
});

app.get("/db/:id/chunks", async (req, res) => {
  return res.json(nodeToChunkHash[req.params.id]);
});

// Store the chunk to node hashes
app.post("/db/:chunkId/nodes", async (req, res) => {
  const { nodeId } = req.body;
  const chunkId = req.params.chunkId;
  if (!chunkHashToNode[chunkId]) {
    chunkHashToNode[chunkId] = [];
  }
  try {
    chunkHashToNode[chunkId].push(nodeId);
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
});

app.get("/db/:chunkId/nodes", async (req, res) => {
  return res.json(chunkHashToNode[req.params.chunkId]);
});

// make the final 404 route
app.get("*", (req, res) => {
  res.send("404");
});

// listen to the port
app.listen(TRACKER_PORT, () => {
  console.log(`Server is running on port ${TRACKER_PORT}`);
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("Tracker CLI:");
console.log("Available commands:");
console.log("- 1: Fetch all workers");
console.log("- 2: Fetch all files");
console.log("- 3: Fetch chunks for a file");
console.log("- 4: Exit");


rl.on("line", async (input) => {
  const [command] = input.trim().split(" ");

  switch (command) {
    case "1":
      console.log("Fetching all workers...");
      try {
        const { data } = await axios.get("http://localhost:3000/worker");
        console.log("Workers:", data);
      } catch (error) {
        console.error("Error fetching workers:", error.message);
      }
      break;

    case "2":
      console.log("Fetching all files...");
      try {
        const { data } = await axios.get("http://localhost:3000/files");
        console.log("Files:", data);
      } catch (error) {
        console.error("Error fetching files:", error.message);
      }
      break;

    case "3":
      rl.question("Enter the file ID to fetch chunks: ", async (fileId) => {
        try {
          const { data } = await axios.get(`http://localhost:3000/files/${fileId}/chunks`);
          console.log(`Chunks for file ${fileId}:`, data);
        } catch (error) {
          console.error("Error fetching file chunks:", error.message);
        }
      });
      break;

    case "4":
      console.log("Exiting...");
      rl.close();
      break;

    default:
      console.log("Unknown command. Please enter a valid number.");
      console.log("Possible commands:");
      console.log("1: Fetch all workers");
      console.log("2: Fetch all files");
      console.log("3: Fetch chunks for a file");
      console.log("4: Exit");
  }
});
