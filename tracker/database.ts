// Define types
type WorkerStatus = 'online' | 'offline'; // Example of worker status types
type Worker = {
  route: string;
  status: WorkerStatus;
  lastSeen: number;
};

type FileInfo = {
  fileId: string;
  size: number;
};

type FileChunks = {
  [fileHash: string]: number[];
};

type NodeChunks = {
  [nodeId: string]: number[];
};

type ChunkNodes = {
  [chunkId: string]: string[];
};

// Define Redis client type (for example, using `redis` package)
import { RedisClientType } from 'redis';

let prefix = {
  onlineWorkers: "onlineWorkers",
  fileNames: "fileNames",
  fileChunks: "fileChunks",
  nodeChunks: "nodeChunks",
  chunkNodes: "chunkNodes",
};

// Add a new worker
export async function addWorker(
  client: RedisClientType, 
  id: string, 
  route: string, 
  status: WorkerStatus
): Promise<boolean> {
  const lastSeen = new Date().getTime();
  console.log("Adding worker", id, route, status, lastSeen);
  const value = await client.get(prefix.onlineWorkers);
  const onlineWorkers: Record<string, Worker> = value ? JSON.parse(value) : {};
  onlineWorkers[id] = { route, status, lastSeen };
  console.log(onlineWorkers);
  await client.set(prefix.onlineWorkers, JSON.stringify(onlineWorkers));
  return true;
}

// Update a worker with a new status
export async function updateWorker(
  client: RedisClientType, 
  id: string, 
  status: WorkerStatus
): Promise<boolean> {
  const lastSeen = new Date().getTime();
  console.log("Updating worker", id, status, lastSeen);
  const value = await client.get(prefix.onlineWorkers);
  const onlineWorkers: Record<string, Worker> = value ? JSON.parse(value) : {};
  if (onlineWorkers[id]) {
    onlineWorkers[id] = { ...onlineWorkers[id], status, lastSeen };
  }
  console.log(onlineWorkers);
  await client.set(prefix.onlineWorkers, JSON.stringify(onlineWorkers));
  return true;
}

// Get all workers
export async function getWorkers(
  client: RedisClientType
): Promise<Record<string, Worker> | null> {
  const value = await client.get(prefix.onlineWorkers);
  return value ? JSON.parse(value) : null;
}

// Add a file ID mapped to a file hash
export async function addFileId(
  client: RedisClientType, 
  fileId: string, 
  fileHash: string, 
  size: number
): Promise<boolean> {
  console.log("Adding file id", fileId, fileHash);
  const value = await client.get(prefix.fileNames);
  const fileHashes: Record<string, FileInfo> = value ? JSON.parse(value) : {};
  fileHashes[fileHash] = { fileId, size };
  await client.set(prefix.fileNames, JSON.stringify(fileHashes));
  return true;
}

// Get a file ID and size using the file hash
export async function getFileId(
  client: RedisClientType, 
  fileHash: string
): Promise<FileInfo | undefined> {
  const value = await client.get(prefix.fileNames);
  const fileNames: Record<string, FileInfo> = value ? JSON.parse(value) : {};
  return fileNames[fileHash];
}

// Add file chunks (file hash to chunk IDs)
export async function addFileChunks(
  client: RedisClientType, 
  fileHash: string, 
  chunkIds: number[]
): Promise<boolean> {
  console.log("Adding file chunks", fileHash, chunkIds);
  const value = await client.get(prefix.fileChunks);
  const fileChunks: FileChunks = value ? JSON.parse(value) : {};
  fileChunks[fileHash] = chunkIds;
  console.log(fileChunks);
  await client.set(prefix.fileChunks, JSON.stringify(fileChunks));
  return true;
}

// Get file chunks using the file hash
export async function getFileChunks(
  client: RedisClientType, 
  fileHash: string
): Promise<number[] | undefined> {
  const value = await client.get(prefix.fileChunks);
  const fileChunks: FileChunks = value ? JSON.parse(value) : {};
  return fileChunks[fileHash];
}

// Add a chunk to a worker node
export async function addWorkerChunk(
  client: RedisClientType, 
  nodeId: string, 
  chunkId: number
): Promise<boolean> {
  console.log("Adding node chunk", nodeId, chunkId);
  const value = await client.get(prefix.nodeChunks);
  const nodeChunks: NodeChunks = value ? JSON.parse(value) : {};
  nodeChunks[nodeId] = nodeChunks[nodeId] || [];
  nodeChunks[nodeId].push(chunkId);
  console.log(nodeChunks);
  await client.set(prefix.nodeChunks, JSON.stringify(nodeChunks));
  return true;
}

// Get all chunks of a node
export async function getWorkerChunks(
  client: RedisClientType, 
  nodeId: string
): Promise<number[] | undefined> {
  const value = await client.get(prefix.nodeChunks);
  const nodeChunks: NodeChunks = value ? JSON.parse(value) : {};
  return nodeChunks[nodeId];
}

// Add a node to a chunk
export async function addChunkNode(
  client: RedisClientType, 
  chunkId: number, 
  nodeId: string
): Promise<boolean> {
  console.log("Adding chunk node", chunkId, nodeId);
  const value = await client.get(prefix.chunkNodes);
  const chunkNodes: ChunkNodes = value ? JSON.parse(value) : {};
  chunkNodes[chunkId] = chunkNodes[chunkId] || [];
  chunkNodes[chunkId].push(nodeId);
  console.log(chunkNodes);
  await client.set(prefix.chunkNodes, JSON.stringify(chunkNodes));
  return true;
}

// Get all nodes of a chunk
export async function getChunkNodes(
  client: RedisClientType, 
  chunkId: number
): Promise<string[] | undefined> {
  const value = await client.get(prefix.chunkNodes);
  const chunkNodes: ChunkNodes = value ? JSON.parse(value) : {};
  return chunkNodes[chunkId];
}
