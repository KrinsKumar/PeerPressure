// import redis from "redis";

// // list of available servers -> server_id : {route, status, last_seen}
// export const online_nodes = redis.createClient();
// online_nodes.on("error", function (error) {
//   console.error(error);
// });

// // list of files names to id -> file_name : file_id
// export const file_names = redis.createClient();
// file_names.on("error", function (error) {
//   console.error(error);
// });

// // list of file_id to an array of chunks -> file_id : [chunk_id]
// export const file_chunks = redis.createClient();
// file_chunks.on("error", function (error) {
//   console.error(error);
// });

// // list of all nodes and their chunks -> node_id : [chunk_id]
// export const node_chunks = redis.createClient();
// node_chunks.on("error", function (error) {
//   console.error(error);
// });

// // list of all chunks and their nodes -> chunk_id : [node_id]
// export const chunk_nodes = redis.createClient();
// chunk_nodes.on("error", function (error) {
//   console.error(error);
// });

let prefix = {
  onlineWorkers: "onlineWorkers",
  fileNames: "fileNames",
  fileChunks: "fileChunks",
  nodeChunks: "nodeChunks",
  chunkNodes: "chunkNodes",
};

// add a new worker
export async function addWorker(client, id, route, status, lastSeen) {
  console.log("Adding worker", id, route, status, lastSeen);
  let value = await client.get(prefix.onlineWorkers);
  let onlineWorkers = JSON.parse(value);
  onlineWorkers = onlineWorkers || {};
  onlineWorkers[id] = { route, status, lastSeen };
  console.log(onlineWorkers);
  client.set(prefix.onlineWorkers, JSON.stringify(onlineWorkers));
  return true;
}

// get all workers
export async function getWorkers(client) {
  let workers = await client.get(prefix.onlineWorkers);
  workers = JSON.parse(workers);
  return workers;
}

// get a map of a fileId -> fileHash
export async function addFileId(client, fileId, fileHash) {
  console.log("Adding file id", fileId, fileHash);
  let value = await client.get(prefix.fileNames);
  let fileNames = JSON.parse(value);
  fileNames = fileNames || {};
  fileNames[fileId] = { fileId, fileHash };
  console.log(fileNames);
  client.set(prefix.fileNames, JSON.stringify(fileNames));
  return true;
}

// get a hash of a file using the fileId
export async function getFileId(client, fileId) {
  let value = await client.get(prefix.fileNames);
  let fileNames = JSON.parse(value);
  return fileNames[fileId];
}

// add the new fileHash -> [chunkId] combo
export async function addFileChunks(client, fileHash, chunkIds) {
  console.log("Adding file chunks", fileHash, chunkIds);
  let value = await client.get(prefix.fileChunks);
  let fileChunks = JSON.parse(value);
  fileChunks = fileChunks || {};
  fileChunks[fileHash] = chunkIds;
  console.log(fileChunks);
  client.set(prefix.fileChunks, JSON.stringify(fileChunks));
  return true;
}

// get the chunks of a file using the fileHash
export async function getFileChunks(client, fileHash) {
  let value = await client.get(prefix.fileChunks);
  let fileChunks = JSON.parse(value);
  return fileChunks[fileHash];
}
