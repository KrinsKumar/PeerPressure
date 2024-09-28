import { Server, Socket } from 'socket.io';

interface WorkerInfo {
  address: string;
  port: number;
}

interface FileInfo {
  fileName: string;
  fileSize: number;
}

class Tracker {
  private port: number;
  private server: Server;
  private nodes: Map<string, WorkerInfo>;
  private fileChunks: Map<string, Map<number, Set<string>>>;
  private readonly files: Map<string, FileInfo>;

  constructor(port: number) {
    this.port = port;
    this.server = new Server(port);
    this.nodes = new Map(); // Keep tracks of the active nodes:  socketId, { address, port }
    this.fileChunks = new Map(); // Keep tracks of the chunks: fileId, { chunkId, [workerId] }
    this.files = new Map(); // Keep tracks of the files: fileId, { fileName, fileSize }
    this.setupEventListeners();
    console.log(`Tracker started on port ${port}`);
  }

  private setupEventListeners() {
    this.server.on('connection', (socket: Socket) => {
      console.log('New worker connected to tracker');

      socket.on('register_worker', (data: { address: string; port: number }) => {
        this.registerWorker(socket.id, data.address, data.port);
      });

      socket.on('disconnect', () => {
        this.removeWorker(socket.id);
      });

      socket.on('store_chunk_info', (data: { fileId: string; chunkId: number }) => {
        this.storeChunkInfo(data.fileId, data.chunkId, socket.id);
      });

      socket.on('get_chunk_locations', (data: { fileId: string; chunkId: number }, callback: (locations: WorkerInfo[]) => void) => {
        const locations = this.getChunkLocations(data.fileId, data.chunkId);
        callback(locations);
      });

      socket.on('get_active_workers', (callback: (workers: WorkerInfo[]) => void) => {
        callback(Array.from(this.nodes.values()));
      });

      socket.on('get_file_chunks', (fileId: string, callback: (chunks: number[]) => void) => {
        const chunks = this.getFileChunks(fileId);
        callback(chunks);
      });

      socket.on('retrieve_chunk', (data: { fileId: string; chunkId: number }, callback: (locations: WorkerInfo[]) => void) => {
        this.retrieveChunk(data.fileId, data.chunkId, callback);
      });

      socket.on('store_file', (data: { fileId: string; fileName: string; fileSize: number }) => {
        this.storeFile(data.fileId, data.fileName, data.fileSize);
      });

      socket.on('list_files', (callback: (files: { fileId: string; fileName: string; fileSize: number }[]) => void) => {
        console.log('Listing files: ', this.files);
        const filesArray = Array.from(this.files.entries()).map(([fileId, fileInfo]) => ({
          fileId,
          fileName: fileInfo.fileName,
          fileSize: fileInfo.fileSize,
        }));
        callback(filesArray); // Send the array back
      });
    });
  }

  private registerWorker(socketId: string, address: string, port: number) {
    this.nodes.set(socketId, { address, port });
    console.log(`Registered worker: ${address}:${port}`);
  }

  private removeWorker(socketId: string) {
    this.nodes.delete(socketId);
    console.log(`Worker disconnected: ${socketId}`);
  }

  private storeChunkInfo(fileId: string, chunkId: number, workerId: string) {
    if (!this.fileChunks.has(fileId)) {
      this.fileChunks.set(fileId, new Map());
    }
    if (!this.fileChunks.get(fileId)?.has(chunkId)) {
      this.fileChunks.get(fileId)?.set(chunkId, new Set());
    }
    this.fileChunks.get(fileId)?.get(chunkId)?.add(workerId);
  }

  private getChunkLocations(fileId: string, chunkId: number): WorkerInfo[] {
    if (this.fileChunks.has(fileId) && this.fileChunks.get(fileId)?.has(chunkId)) {
      return Array.from(this.fileChunks.get(fileId)?.get(chunkId) ?? [])
          .map(workerId => this.nodes.get(workerId)!)
          .filter(Boolean);
    }
    return [];
  }

  private getFileChunks(fileId: string): number[] {
    if (this.fileChunks.has(fileId)) {
      return Array.from(this.fileChunks.get(fileId)?.keys() ?? []);
    }
    return [];
  }

  private retrieveChunk(fileId: string, chunkId: number, callback: (locations: WorkerInfo[]) => void) {
    const chunkLocations = this.getChunkLocations(fileId, chunkId);
    callback(chunkLocations);
  }

  private storeFile(fileId: string, fileName: string, fileSize: number) {
    console.log(`Storing file: ${fileName} with ID: ${fileId}`);
    this.files.set(fileId, { fileName, fileSize });
  }
}

// Create and start the tracker
const port = 3000;
const tracker = new Tracker(port);
