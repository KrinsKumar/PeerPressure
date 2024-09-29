import express from "express";
import { createClient } from "redis";
import { addFileChunks, findChunksForNodeAndRedistribute, getFileChunks } from "./database.js";
import cors from "cors";
import readline from "readline"; // CLI integration
import axios from "axios";
import chalk from 'chalk';
import inquirer from 'inquirer';
import cliProgress from 'cli-progress';
import Table from 'cli-table3';

const REDIS_HOST = "localhost"
const REDIS_PORT = 6379
const TRACKER_PORT =  3000

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

  for (const worker of workers) {
    try {

      const response = await axios.get(`${worker.route}/heartbeat`, { timeout: 5000 }); // README: request timeout MUST be less than the interval

      if (response.status === 200) {
        worker.status = "active";  // Set status to active if the ping is successful
        worker.lastSeen = new Date();  // Update the last seen timestamp
      }
    } catch (error) {
      worker.status = "inactive";  // Set status to inactive if the ping fails
      // actually remove the worker from the list
      workers = workers.filter((w) => w.id !== worker.id);

      console.error(`Worker ${worker.id} is not reachable. Error:`, error.message);
      // STEPS: Gathers the Chunk IDs from the worker and redistributes them to other active workers;
      await findChunksForNodeAndRedistribute(client, worker.route, workers);

      // Now We have to iterate through the file and redistribute the chunks {fileId: [chunkIds], fileId: [chunkIds]}
      // STEPS ARE:
      // 1. Iterate through the file
      // 2. Iterate through the chunks
      // 3. Find an active worker that hasn't that chunk
      // 4. Ask it to pull the chunk
    }
  }
}, 7000); 

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


// Function to display tables
function displayTable(data, title) {
  const table = new Table({
    head: Object.keys(data[0]).map(key => chalk.cyan(key)),
    colWidths: Object.keys(data[0]).map(() => 15),
  });

  data.forEach(item => table.push(Object.values(item)));

  console.log(chalk.yellow(`\n📋 ${title}:`));
  console.log(table.toString());
}

// Function to get statistics
async function getStatistics() {
  const workerCount = workers.length;
  const activeWorkers = workers.filter(w => w.status === 'active').length;
  const fileCount = Object.keys(files).length;
  const totalChunks = Object.values(fileHashToChunkHash).reduce((acc, chunks) => acc + chunks.length, 0);

  return {
    workerCount,
    activeWorkers,
    fileCount,
    totalChunks,
  };
}

// Redesigned CLI with enhanced interaction
async function startCLI() {
  console.clear();
  console.log(chalk.green.bold(`🚀 Welcome to the Tracker CLI! 🚀`));
  console.log(chalk.yellow('Let’s manage your workers and files with style!'));

  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: `🏗️ Fetch all workers`, value: 'workers' },
          { name: `📂 Fetch all files`, value: 'files' },
          { name: `🧩 Fetch chunks for a file`, value: 'chunks' },
          { name: `➗ View statistics`, value: 'stats' },
          { name: `🚪 Exit`, value: 'exit' },
        ],
      },
    ]);

    if (action === 'exit') {
      console.log(chalk.yellow('👋 Goodbye! See you next time.'));
      process.exit(0);
    }

    const progressBar = new cliProgress.SingleBar({
      format: `⏳ {bar} {percentage}% | {value}/{total} Chunks`,
    }, cliProgress.Presets.shades_classic);

    try {
      switch (action) {
        case 'workers':
          progressBar.start(100, 0);
          const { data: workers } = await axios.get("http://localhost:3000/worker");
          progressBar.update(100);
          progressBar.stop();
          displayTable(workers, 'Workers');
          break;

        case 'files':
          progressBar.start(100, 0);
          const { data: files } = await axios.get("http://localhost:3000/files");
          progressBar.update(100);
          progressBar.stop();
          displayTable(Object.entries(files).map(([hash, file]) => ({ hash, ...file })), 'Files');
          break;

        case 'chunks':
          const { fileId } = await inquirer.prompt([
            {
              type: 'input',
              name: 'fileId',
              message: '🔍 Enter the file ID to fetch chunks:',
            },
          ]);
          progressBar.start(100, 0);
          const { data: chunks } = await axios.get(`http://localhost:3000/files/${fileId}/chunks`);
          progressBar.update(100);
          progressBar.stop();
          displayTable(chunks.map((chunk, index) => ({ index, chunk })), `Chunks for file ${fileId}`);
          break;

        case 'stats':
          progressBar.start(100, 0);
          const stats = await getStatistics();
          progressBar.update(100);
          progressBar.stop();
          console.log(chalk.yellow('\n📊 Tracker Statistics:'));
          Object.entries(stats).forEach(([key, value]) => {
            console.log(`${chalk.cyan(`${key}:`)} ${chalk.white(value)}`);
          });
          break;
      }
    } catch (error) {
      progressBar.stop();
      console.error(chalk.red(`❌ Error: ${error.message}`));
    }

    console.log('\n');
  }
}

// Start the CLI when the server is ready
app.listen(TRACKER_PORT, () => {
  console.log(chalk.green(`Server is running on port ${TRACKER_PORT}`));
  startCLI();
});