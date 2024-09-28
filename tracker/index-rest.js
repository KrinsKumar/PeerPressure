import express from "express";
import { createClient } from "redis";
import { addFileChunks } from "./database.js";

const app = express();
app.use(express.json());

const client = createClient({
  url: "redis://localhost:6379",
});
client.on("error", (err) => console.error("Redis Client Error", err));
await client.connect();

this.workers = new Map();
this.files = new Map();

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
  workers[id] = { route, status, lastSeen };
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
  files[fileHash] = { fileName, size };
  res.json({ fileName, fileHash, size });
});

// gets the file info
app.get("/files:id", async (req, res) => {
  let fileId = req.params.id;
  let file = files[fileId];
  res.json(file);
});

// add the chunks meta data
app.post("/files/:id/chunks", async (req, res) => {
  let fileId = req.params.id;
  let chunks;
  try {
    chunks = req.body;
  } catch (e) {
    res.status(400).send("Please provide all the fields");
    return;
  }
  if (await addFileChunks(client, fileId, chunks)) {
    res.json({ fileId, chunks });
  } else {
    res.status(400).send("Could not add the chunks");
  }
});

// get the chunks meta data
app.get("/files/:id/chunks", async (req, res) => {
  let fileId = req.params.id;
  let chunks = files[fileId].chunks;
  res.json({ fileId, chunks });
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
