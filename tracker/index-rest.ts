import express, { Request, Response } from 'express';
import { addWorker, updateWorker } from "./database";

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
  private app: express.Application;
  private nodes: Map<string, WorkerInfo>;
  private fileChunks: Map<string, Map<number, Set<string>>>;
  private files: Map<string, FileInfo>;

  constructor(port: number) {
    this.port = port;
    this.app = express();
    this.nodes = new Map();
    this.fileChunks = new Map();
    this.files = new Map();
    this.setupMiddleware();
    this.setupRoutes();
    console.log(`Tracker started on port ${port}`);
  }

  private setupMiddleware() {
    this.app.use(express.json());
  }

  private setupRoutes() {
    this.app.post('/register_worker', this.registerWorker.bind(this));
    this.app.post('/store_chunk_info', this.storeChunkInfo.bind(this));
    this.app.get('/get_chunk_locations', this.getChunkLocations.bind(this));
    this.app.get('/get_active_workers', this.getActiveWorkers.bind(this));
    this.app.get('/get_file_chunks/:fileId', this.getFileChunks.bind(this));
    this.app.get('/retrieve_chunk', this.retrieveChunk.bind(this));
    this.app.post('/store_file', this.storeFile.bind(this));
    this.app.get('/list_files', this.listFiles.bind(this));
  }

  public start() {
    this.app.listen(this.port, () => {
      console.log(`Tracker REST API listening on port ${this.port}`);
    });
  }

  private registerWorker(req: Request, res: Response) {
    const { id, route, status } = req.body;
    addWorker(id, route, status);
    const [address, port] = route.split(':');
    this.nodes.set(id, { address, port: parseInt(port) });
    console.log(`Registered worker: ${route}`);
    res.sendStatus(200);
  }

  private storeChunkInfo(req: Request, res: Response) {
    const { fileId, chunkId, workerId } = req.body;
    if (!this.fileChunks.has(fileId)) {
      this.fileChunks.set(fileId, new Map());
    }
    if (!this.fileChunks.get(fileId)!.has(chunkId)) {
      this.fileChunks.get(fileId)!.set(chunkId, new Set());
    }
    this.fileChunks.get(fileId)!.get(chunkId)!.add(workerId);
    res.sendStatus(200);
  }

  private getChunkLocations(req: Request, res: Response) {
    const { fileId, chunkId } = req.query;
    if (typeof fileId !== 'string' || typeof chunkId !== 'string') {
      res.status(400).send('Invalid fileId or chunkId');
      return;
    }
    const locations = this.getChunkLocationsInternal(fileId, parseInt(chunkId));
    res.json(locations);
  }

  private getChunkLocationsInternal(fileId: string, chunkId: number): WorkerInfo[] {
    if (this.fileChunks.has(fileId) && this.fileChunks.get(fileId)!.has(chunkId)) {
      return Array.from(this.fileChunks.get(fileId)!.get(chunkId)!)
        .map(workerId => this.nodes.get(workerId))
        .filter((worker): worker is WorkerInfo => worker !== undefined);
    }
    return [];
  }

  private getActiveWorkers(req: Request, res: Response) {
    res.json(Array.from(this.nodes.values()));
  }

  private getFileChunks(req: Request, res: Response) {
    const { fileId } = req.params;
    if (this.fileChunks.has(fileId)) {
      res.json(Array.from(this.fileChunks.get(fileId)!.keys()));
    } else {
      res.json([]);
    }
  }

  private retrieveChunk(req: Request, res: Response) {
    const { fileId, chunkId } = req.query;
    if (typeof fileId !== 'string' || typeof chunkId !== 'string') {
      res.status(400).send('Invalid fileId or chunkId');
      return;
    }
    const chunkLocations = this.getChunkLocationsInternal(fileId, parseInt(chunkId));
    res.json(chunkLocations);
  }

  private storeFile(req: Request, res: Response) {
    const { fileId, fileName, fileSize } = req.body;
    console.log(`Storing file: ${fileName} with ID: ${fileId}`);
    this.files.set(fileId, { fileName, fileSize });
    res.sendStatus(200);
  }

  private listFiles(req: Request, res: Response) {
    console.log("Listing files: ", this.files);
    res.json(Array.from(this.files.entries()).map(([fileId, fileInfo]) => ({
      id: fileId,
      ...fileInfo
    })));
  }
}

const port = 3000;
const tracker = new Tracker(port);
tracker.start();