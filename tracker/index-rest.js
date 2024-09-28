import express from "express";
import { createClient } from "redis";
import { addFileChunks, getFileChunks } from "./database.js";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const client = createClient({
  url: "redis://localhost:6379",
});
client.on("error", (err) => console.error("Redis Client Error", err));

let workers = [];
let files = new Map();
let fileHashToChunkHash = new Map();

await client.connect();

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
  res.json(file);
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

    // for (let chunk of chunks.keys) {
    //   // chunk: [worker1, worker2, worker3]
    //   for (let worker of chunk) {
    //     let workerChunks = workers[worker];
    //     if (!workerChunks) {
    //       workerChunks = [];
    //       workers[worker] = workerChunks;
    //     }
    //     workerChunks.push(chunk);
    //     workers[worker] = workerChunks;
    //   }
    // }
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

// // add all the chunks that a file has
// app.post("/files/:id/chunks", async (req, res) => {
//   let fileId = req.params.id;
//   let chunks;
//   try {
//     chunks = req.body;
//   } catch (e) {
//     res.status(400).send("Please provide all the fields");
//     return;
//   }
//   await addFileChunks(client, fileId, chunks);
//   res.json({ fileId, chunks });
// });

// // get all the chunks of a file
// app.get("/files/:id/chunks", async (req, res) => {
//   let fileId = req.params.id;
//   let chunks = await getFileChunks(client, fileId);
//   res.json({ fileId, chunks });
// });

// // add all the node chunks to a node
// app.post("/worker/:id/chunks", async (req, res) => {
//   let workerId = req.params.id;
//   let chunks;
//   try {
//     chunks = req.body;
//   } catch (e) {
//     res.status(400).send("Please provide all the fields");
//     return;
//   }
//   await addWorkerChunk(client, workerId, chunks);
//   res.json({ workerId, chunks });
// });

// // get all the chunks of a node
// app.get("/worker/:id/chunks", async (req, res) => {
//   let nodeId = req.params.id;
//   let chunks = await getWorkerChunks(client, nodeId);
//   res.json({ nodeId, chunks });
// });

// // get all nodes in a chunk
// app.get("/chunk/:id", async (req, res) => {
//   let chunkId = req.params.id;
//   let nodes = await getChunkNodes(client, chunkId);
//   res.json({ chunkId, nodes });
// });

// // add a node to a chunk
// app.post("/chunk/:id", async (req, res) => {
//   let chunkId = req.params.id;
//   let nodeId;
//   try {
//     nodeId = req.body.nodeId;
//   } catch (e) {
//     res.status(400).send("Please provide all the fields");
//     return;
//   }
//   await addChunkNode(client, chunkId, nodeId);
//   res.json({ chunkId, nodeId });
// });

// make the final 404 route
app.get("*", (req, res) => {
  res.send("404");
});

// listen to the port
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
