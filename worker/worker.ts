import { Server } from "socket.io";
import ioClient, { Socket as ClientSocket } from "socket.io-client";
import * as fs from "fs";
import * as crypto from "crypto";
import * as readline from "readline";
import * as path from "path";
import { get } from "http";

const TRACKER_URL = process.env.TRACKER_IP || "http://localhost:3000";

interface ChunkData {
  fileId: string;
  chunkId: number;
  chunk: Buffer;
}

interface WorkerInfo {
  address: string;
  port: number;
  route: string;
}

class Worker {
  private server: Server;
  private trackerSocket: ClientSocket;
  private chunks: Map<string, Map<number, Buffer>>;
  private workerSockets: Map<string, ClientSocket>;
  private address: string;
  private port: number;
  private route: string;

  constructor(port: number, trackerAddress: string) {
    this.port = port;
    this.server = new Server(port);
    this.trackerSocket = ioClient(trackerAddress);
    this.chunks = new Map();
    this.setupEventListeners();
    this.workerSockets = new Map();
    this.address = "localhost"; // Assuming the address is localhost
    console.log(`Worker started on port ${port}`);
    this.route = `http://${this.address}:${this.port}`;

    fetch(`${TRACKER_URL}/worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: this.port,
        address: this.address,
        port: this.port,
        route: this.route,
      }),
    });
  }

  private setupEventListeners() {
    this.server.on("connection", (socket) => {
      console.log(`New connection on port ${this.port}`);

      socket.on(
        "store_chunk",
        (
          data: ChunkData,
          callback: (response: { success: boolean }) => void
        ) => {
          this.storeChunk(data.fileId, data.chunkId, data.chunk);
          this.trackerSocket.emit("store_chunk_info", {
            fileId: data.fileId,
            chunkId: data.chunkId,
          });
          callback({ success: true });
        }
      );

      socket.on(
        "retrieve_chunk",
        (
          data: { fileId: string; chunkId: number },
          callback: (chunk: Buffer | null) => void
        ) => {
          const chunk = this.retrieveChunk(data.fileId, data.chunkId);
          callback(chunk);
        }
      );
    });

    this.trackerSocket.on("connect", () => {
      this.trackerSocket.emit("register_worker", {
        address: this.address,
        port: this.port,
      });
    });
  }

  private storeChunk(fileId: string, chunkId: number, chunk: Buffer) {
    if (!this.chunks.has(fileId)) {
      this.chunks.set(fileId, new Map());
    }
    this.chunks.get(fileId)!.set(chunkId, chunk);
    console.log(
      `Stored chunk ${chunkId} of file ${fileId} to node ${this.trackerSocket}:${this.port}`
    );
  }

  private retrieveChunk(fileId: string, chunkId: number): Buffer | null {
    console.log(this.chunks.has(fileId), this.chunks.get(fileId));
    console.log(this.chunks.get(fileId)!.has(Number(chunkId)));
    if (
      this.chunks.has(fileId) &&
      this.chunks.get(fileId)!.has(Number(chunkId))
    ) {
      return this.chunks.get(fileId)!.get(Number(chunkId))!;
    }
    return null;
  }

  async uploadFile(filePath: string): Promise<string> {
    const fileContent = fs.readFileSync(filePath);
    const fileId = crypto
      .createHash("sha256")
      .update(fileContent)
      .digest("hex");
    const chunks = this.splitIntoChunks(fileContent);

    const activeWorkers: WorkerInfo[] = await this.getActiveWorkers();
    const replicationFactor = Math.ceil(activeWorkers.length / 2);

    const workerSockets: { [key: string]: ClientSocket } = {};
    console.log("active workers: ", activeWorkers);
    for (const worker of activeWorkers) {
      console.log(worker.route, this.route);
      if (worker.route !== this.route) {
        const workerSocket = ioClient(`${worker.route}`);
        workerSockets[`${worker.route}`] = workerSocket;
      }
    }
    const filteredWorkers = activeWorkers.filter(
      (worker) => worker.route !== this.route
    );

    let chunkHashes: string[] = [];
    const chunkDistribution: { [chunkId: number]: string[] } = {};

    for (let i = 0; i < chunks.length; i++) {
      const targetWorkers = this.selectRandomWorkers(
        filteredWorkers,
        replicationFactor
      );
      chunkHashes = [
        ...chunkHashes,
        crypto.createHash("sha256").update(chunks[i]).digest("hex"),
      ];
      chunkDistribution[i] = [];

      for (const worker of targetWorkers) {
        chunkDistribution[i].push(...chunkDistribution[i], worker.route);
        const workerKey = worker.route;
        const workerSocket = workerSockets[workerKey];
        await new Promise<void>((resolve) => {
          workerSocket.emit(
            "store_chunk",
            {
              fileId,
              chunkId: i,
              chunk: chunks[i],
            },
            (response: { success: boolean }) => {
              if (response.success) {
                resolve();
              }
            }
          );
        });
      }
    }

    console.log("Chunk distribution:", chunkDistribution);
    // Send chunk distribution data to tracker
    fetch(`${TRACKER_URL}/files/${fileId}/chunks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunk: { fileId: chunkDistribution },
      }),
    })
      .then((response) => response.json())
      .catch((error) =>
        console.error("Error sending chunk distribution to tracker:", error)
      );

    console.log("Chunk hashes:", chunkHashes);
    fetch(`${TRACKER_URL}/chunks/${fileId}/hash`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunkHashes,
      }),
    })
      .then((response) => response.json())
      .catch((error) =>
        console.error("Error sending chunk hash to tracker:", error)
      );

    for (const workerKey in workerSockets) {
      workerSockets[workerKey].close();
      console.log(`Connection to worker ${workerKey} closed.`);
    }

    this.trackerSocket.emit("store_file", {
      fileId,
      fileName: path.basename(filePath),
      fileSize: fileContent.length,
    });

    // Send file metadata to tracker
    fetch(`${TRACKER_URL}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileHash: fileId,
        fileName: path.basename(filePath),
        size: fileContent.length,
      }),
    })
      .then((response) => response.json())
      .catch((error) =>
        console.error("Error sending file metadata to tracker:", error)
      );

    console.log(`File uploaded with ID: ${fileId}`);
    return fileId;
  }

  private async getActiveWorkers(): Promise<WorkerInfo[]> {
    return new Promise((resolve) => {
      fetch(`${TRACKER_URL}/worker`)
        .then((response) => response.json())
        .then((data) => resolve(data));
    });
  }

  private selectRandomWorkers(
    workers: WorkerInfo[],
    count: number
  ): WorkerInfo[] {
    const shuffled = workers.slice().sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  async downloadFile(fileId: string, outputPath: string) {
    const chunks: (Buffer | null)[] = [];
    const fileChunks: any = await this.getFileChunks(fileId);
    const chunkHashes = await this.getChunkHashes(fileId);

    console.log("retrieving file with ID: ", fileId);

    for (const chunkId of Object.keys(fileChunks)) {
      const locations = fileChunks[chunkId];
      if (locations.length === 0) {
        console.error(`Chunk ${chunkId} of file ${fileId} not found`);
        return;
      }
      console.log("trying to retrieve chunk from: ");
      const chunk = await new Promise<Buffer>((resolve) => {
        const nodeSocket = ioClient(`${locations[0]}`);
        nodeSocket.emit(
          "retrieve_chunk",
          { fileId, chunkId },
          (chunk: Buffer) => {
            resolve(chunk);
          }
        );
      });
      console.log("chunk retrieved: ", chunk);
      chunks[Number(chunkId)] = chunk;
    }

    const validChunks = chunks.filter(Boolean) as Buffer[];

    if (validChunks.length === 0) {
      console.error("No valid chunks retrieved for the file.");
      return;
    }

    const fileContent = Buffer.concat(validChunks);
    this.verifyFileIntegrity(fileContent, fileId);
    fs.writeFileSync(outputPath, fileContent);
    console.log(`File downloaded to ${outputPath}`);
  }

  private splitIntoChunks(buffer: Buffer): Buffer[] {
    const chunks: Buffer[] = [];
    const chunkSize = 512;
    for (let i = 0; i < buffer.length; i += chunkSize) {
      chunks.push(buffer.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private verifyFileIntegrity(fileContent: Buffer, fileId: string) {
    const hash = crypto.createHash("sha256").update(fileContent).digest("hex");
    console.log(`File integrity check:
      File ID: ${fileId}
      SHA-256 Hash: ${hash}
    `);
  }

  private getChunkLocations(
    fileId: string,
    chunkId: number
  ): Promise<WorkerInfo[]> {
    return new Promise((resolve) => {
      this.trackerSocket.emit(
        "get_chunk_locations",
        { fileId, chunkId },
        (locations: WorkerInfo[]) => {
          resolve(locations);
        }
      );
    });
  }

  private getFileChunks(fileId: string): Promise<{ string: string[] }> {
    return new Promise((resolve) => {
      fetch(`${TRACKER_URL}/files/${fileId}/chunks`)
        .then((response) => response.json())
        .then((data) => resolve(data));
    });
  }

  private getChunkHashes(fileId: string): Promise<string[]> {
    return new Promise((resolve) => {
      fetch(`${TRACKER_URL}/chunks/${fileId}/hash`)
        .then((response) => response.json())
        .then((data) => resolve(data))
        .catch((error) => console.error("Error fetching chunk hashes:", error));
    });
  }

  private listStoredChunks() {
    console.log("Stored chunks:");
    this.chunks.forEach((fileChunks, fileId) => {
      console.log(`File ID: ${fileId}`);
      fileChunks.forEach((chunk, chunkId) => {
        console.log(`Chunk ID: ${chunkId}, Size: ${chunk.length} bytes`);
      });
    });
  }

  private listStoredFiles() {
    console.log("Fetching stored files from tracker...");
    fetch(`${TRACKER_URL}/files`)
      .then((response) => response.json())
      .then((files) => {
        console.log("Stored files:");
        Object.entries(files).forEach(([fileId, fileInfo]) => {
          if (
            typeof fileInfo === "object" &&
            fileInfo !== null &&
            "fileName" in fileInfo &&
            "size" in fileInfo
          ) {
            console.log(
              `File ID: ${fileId}, Name: ${fileInfo.fileName}, Size: ${fileInfo.size} bytes`
            );
          } else {
            console.log(
              `File ID: ${fileId}, Info: ${JSON.stringify(fileInfo)}`
            );
          }
        });
      })
      .catch((error) => {
        console.error("Error fetching stored files:", error);
      });
  }

  cli() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(`Worker CLI (Port ${this.port}):`);
    console.log("Available commands:");
    console.log("- upload <file_path>: Upload a file");
    console.log("- download <file_id> <output_path>: Download a file");
    console.log("- list_chunks: List all stored chunks");
    console.log("- list_files: List all stored files");
    console.log("- exit: Exit the worker");

    rl.on("line", async (input) => {
      const [command, ...args] = input.trim().split(" ");

      switch (command) {
        case "upload":
          if (args.length !== 1) {
            console.log("Usage: upload <file_path>");
            break;
          }
          await this.uploadFile(args[0]);
          break;
        case "download":
          if (args.length !== 2) {
            console.log("Usage: download <file_id> <output_path>");
            break;
          }
          await this.downloadFile(args[0], args[1]);
          break;
        case "list_chunks":
          this.listStoredChunks();
          break;
        case "list_files":
          this.listStoredFiles();
          break;
        case "exit":
          rl.close();
          break;
        default:
          console.log("Unknown command:", command);
      }
    });

    rl.on("close", () => {
      console.log("Exiting worker...");
      process.exit(0);
    });
  }
}

// Usage
const port = Number(process.argv[2]);
const trackerAddress = process.argv[3] || "http://localhost:3000";
const worker = new Worker(port, trackerAddress);
worker.cli();
