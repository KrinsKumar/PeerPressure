import express, { Request, Response } from "express";
import { createClient } from "redis";
import { addFileChunks, getFileChunks } from "./database";
import cors from "cors";
import readline from "readline"; // CLI integration
import axios from "axios";

interface Worker {
  id: string;
  route: string;
  status: string;
  lastSeen: number;
}

interface File {
  fileName: string;
  size: number;
}

const app = express();
app.use(cors());
app.use(express.json());

const client = createClient({
  url: "redis://localhost:6379",
});
client.on("error", (err) => console.error("Redis Client Error", err));

let workers: Worker[] = [];
let files: Map<string, File> = new Map();

await client.connect();

setInterval(async () => {
  console.log("Pinging all workers...");

  for (const worker of workers) {
    try {
      console.log(`Pinging worker ${worker.id} at ${worker.route}/heartbeat`);

      const response = await axios.get(`${worker.route}/heartbeat`, { timeout: 5000 });

      if (response.status === 200) {
        worker.status = "active";  // Set status to active if the ping is successful
        worker.lastSeen = Date.now();  // Update the last seen timestamp
        console.log(`Worker ${worker.id} is active.`);
      }
    } catch (error) {
      worker.status = "inactive";  // Set status to inactive if the ping fails
      console.error(`Worker ${worker.id} is not reachable. Error:`, error.message);
    }
  }
}, 7000);

// get all workers
app.get("/worker", async (req: Request, res: Response) => {
  console.log("Getting all workers");
  res.json(workers);
});

// add a new worker
app.post("/worker", async (req: Request, res: Response) => {
  let id: string, route: string, status: string;
  try {
    ({ id, route, status } = req.body);
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
  const lastSeen = Date.now();

  workers = workers.filter((worker) => worker.id !== id);
  workers.push({ id, route, status, lastSeen });
  console.log("Adding a worker", id, route, status, lastSeen);
  res.send({ id, route, status, lastSeen });
});

// update a worker
app.put("/worker/:id", async (req: Request, res: Response) => {
  let id = req.params.id;
  let status: string;
  try {
    ({ status } = req.body);
  } catch (e) {
    res.status(400).send("Please provide a status");
    return;
  }
  const worker = workers.find((w) => w.id === id);
  if (worker) {
    worker.status = status;
    res.json({ id, status });
  } else {
    res.status(404).send("Worker not found");
  }
});

// add a file id
app.post("/files", async (req: Request, res: Response) => {
  let fileName: string, fileHash: string, size: number;
  try {
    ({ fileName, fileHash, size } = req.body);
  } catch (e) {
    res.status(400).send("Please provide a file id and hash");
    return;
  }
  console.log("Adding a file", fileName, fileHash, size);
  files.set(fileHash, { fileName, size });
  res.json("success");
});

// gets the file info
app.get("/files/:id", async (req: Request, res: Response) => {
  let fileId = req.params.id;
  let file = files.get(fileId);
  res.json(file);
});

// get all the files
app.get("/files", async (req: Request, res: Response) => {
  res.json(Array.from(files.entries()).map(([key, value]) => ({ fileHash: key, ...value })));
});

// add the chunks meta data
app.post("/files/:id/chunks", async (req: Request, res: Response) => {
  let fileHash = req.params.id;
  let chunks: string[]; // Assuming chunks is an array of strings
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
app.get("/files/:id/chunks", async (req: Request, res: Response) => {
  let fileId = req.params.id;
  const chunks = await getFileChunks(client, fileId);
  res.json(chunks);
});

// make the final 404 route
app.get("*", (req: Request, res: Response) => {
  res.send("404");
});

// listen to the port
app.listen(3000, () => {
  console.log("Server is running on port 3000");
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
  }
});
