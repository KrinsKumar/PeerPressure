import express from 'express';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

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
  private redisClient: ReturnType<typeof createClient>;

  constructor(port: number) {
    this.port = port;
    this.app = express();
    this.redisClient = createClient();
    this.setupMiddleware();
    this.setupRoutes();
    this.connectRedis();
  }

  private async connectRedis() {
    await this.redisClient.connect();
    console.log('Connected to Redis');
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
      console.log(`Tracker started on port ${this.port}`);
    });
  }

  private async registerWorker(req: express.Request, res: express.Response) {
    const { address, port } = req.body;
    const workerId = uuidv4();
    await this.redisClient.hSet(`worker:${workerId}`, { address, port });
    res.json({ workerId });
  }

  private async storeChunkInfo(req: express.Request, res: express.Response) {
    const { fileId, chunkId, workerId } = req.body;
    await this.redisClient.sAdd(`file:${fileId}:chunk:${chunkId}`, workerId);
    res.sendStatus(200);
  }

  private async getChunkLocations(req: express.Request, res: express.Response) {
    const { fileId, chunkId } = req.query;
    const workerIds = await this.redisClient.sMembers(`file:${fileId}:chunk:${chunkId}`);
    const locations = await Promise.all(
      workerIds.map(async (workerId) => this.redisClient.hGetAll(`worker:${workerId}`))
    );
    res.json(locations);
  }

  private async getActiveWorkers(req: express.Request, res: express.Response) {
    const workerKeys = await this.redisClient.keys('worker:*');
    const workers = await Promise.all(
      workerKeys.map(async (key) => this.redisClient.hGetAll(key))
    );
    res.json(workers);
  }

  private async getFileChunks(req: express.Request, res: express.Response) {
    const { fileId } = req.params;
    const chunkKeys = await this.redisClient.keys(`file:${fileId}:chunk:*`);
    const chunks = chunkKeys.map((key) => parseInt(key.split(':').pop() || ''));
    res.json(chunks);
  }

  private async retrieveChunk(req: express.Request, res: express.Response) {
    const { fileId, chunkId } = req.query;
    const workerIds = await this.redisClient.sMembers(`file:${fileId}:chunk:${chunkId}`);
    const locations = await Promise.all(
      workerIds.map(async (workerId) => this.redisClient.hGetAll(`worker:${workerId}`))
    );
    res.json(locations);
  }

  private async storeFile(req: express.Request, res: express.Response) {
    const { fileId, fileName, fileSize } = req.body;
    await this.redisClient.hSet(`file:${fileId}`, { fileName, fileSize });
    res.sendStatus(200);
  }

  private async listFiles(req: express.Request, res: express.Response) {
    const fileKeys = await this.redisClient.keys('file:*');
    const files = await Promise.all(
      fileKeys.map(async (key) => {
        const fileId = key.split(':')[1];
        const fileInfo = await this.redisClient.hGetAll(key);
        return { fileId, ...fileInfo };
      })
    );
    res.json(files);
  }
}

// Create and start the tracker
const port = 3000;
const tracker = new Tracker(port);
tracker.start();