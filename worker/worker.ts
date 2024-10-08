import { Server } from "socket.io";
import ioClient, { Socket as ClientSocket } from "socket.io-client";
import * as fs from "fs";
import * as crypto from "crypto";
import * as readline from "readline";
import * as path from "path";
import express from "express";
import { Request, Response } from "express";
import chalk from "chalk";
import * as zlib from "zlib";

interface ChunkData {
  fileId: string;
  chunkId: number;
  chunk: Buffer;
}

interface WorkerInfo {
  status: string;
  host: string;
  port: number;
  route: string;
}

class Worker {
  private server: Server;
  private chunks: Map<string, Map<number, Buffer>>;
  private host: string;
  private port: number;
  private address: string;
  private trackerAddress: string;
  private expressApp: express.Application;

  constructor(host: string, port: number, trackerHost: string, trackerPort: number) {
    this.trackerAddress = `http://${trackerHost}:${trackerPort}`
    this.host = host
    this.port = port;
    this.chunks = new Map();
    this.address = `http://${this.host}:${this.port}`;
    console.log(`Worker started on port ${port}`);
    this.expressApp = express();
    this.expressApp.use(express.json());

    // Start the Express server for heartbeat
    const httpServer = this.expressApp.listen(this.port, () => {
      console.log(`Heartbeat server listening on port ${this.port}`);
    });

    this.server = new Server(httpServer);
    this.setupEventListeners();

    this.setupExpressRoutes();
    fetch(`${this.trackerAddress}/worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: this.port,
        address: this.address,
        port: this.port,
        route: this.address,
      }),
    });
  }

  private setupEventListeners() {
    this.server.on("connection", (socket) => {
      // console.log(`New connection on port ${this.port}`);
      socket.on(
        "store_chunk",
        (
          data: ChunkData,
          callback: (response: { success: boolean }) => void
        ) => {
          this.storeChunk(data.fileId, data.chunkId, data.chunk);
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
  }

  private setupExpressRoutes() {
    this.expressApp.get("/heartbeat", (req: Request, res: Response) => {
      res.status(200).send("OK");
    });

    this.expressApp.post('/pull_chunk', async (req: Request, res: Response) => {
      const { actorUrl, fileId, chunkId } = req.body;
      console.log(chalk.cyan(`Pulling ch_${chalk.yellow(chunkId)} from file ${chalk.magenta(fileId)} from ${chalk.green(actorUrl)}`));
      try {
        // Fetch the chunk from the other actor
        const chunk = await this.pullChunkFromActor(actorUrl, fileId, chunkId);

        if (chunk) {
          // Store the chunk locally
          this.storeChunk(fileId, chunkId, chunk);

          res.status(200).send({ success: true, message: 'Chunk pulled and stored successfully' });
        } else {
          res.status(404).send({ success: false, message: 'Chunk not found' });
        }
      } catch (error) {
        console.error('Error pulling chunk from actor:', error);
        res.status(500).send({ success: false, message: 'Error pulling chunk from actor' });
      }
    });

  }


  private async pullChunkFromActor(actorUrl: string, fileId: string, chunkId: number): Promise<Buffer | null> {
    return new Promise<Buffer | null>((resolve, reject) => {
      console.log("Pulling chunk from actor: ", actorUrl);
      const socket = ioClient(actorUrl);

      socket.emit('retrieve_chunk', { fileId, chunkId }, (chunk: Buffer | null) => {
        socket.close();
        if (chunk) {
          resolve(chunk);
        } else {
          reject(new Error('Chunk not found'));
        }
      });
    });
  }


  private storeChunk(fileId: string, chunkId: number, chunk: Buffer) {
    if (!this.chunks.has(fileId)) {
      this.chunks.set(fileId, new Map());
    }
    this.chunks.get(fileId)!.set(chunkId, chunk);
    console.log(chalk.green(`📦 Stored chunk ${chunkId} of file ${fileId.slice(0, 2)}..${fileId.slice(-3)} 🛠️`));
  }

  private retrieveChunk(fileId: string, chunkId: number): Buffer | null {
    if (
      this.chunks.has(fileId) &&
      this.chunks.get(fileId)!.has(Number(chunkId))
    ) {
      return this.chunks.get(fileId)!.get(Number(chunkId))!;
    }
    return null;
  }

  async uploadFile(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return "";
    }

    const fileContent = zlib.deflateSync(fs.readFileSync(filePath));
    // const fileContent =fs.readFileSync(filePath);
    const fileId = crypto
      .createHash("sha256")
      .update(fileContent)
      .digest("hex");
    // Check if the file is already in the system
    try {
      const response = await fetch(`${this.trackerAddress}/files/${fileId}`);
      if (response.ok) {
        // console.log(`File ${fileId} already exists in the system.`);
        return fileId;
      }
    } catch (error) {
      console.error(`Error checking file existence: ${error}`);
    }
    const chunks = this.splitIntoChunks(fileContent);

    const activeWorkers: WorkerInfo[] = await this.getActiveWorkers();
    const replicationFactor = 2;

    const workerSockets: { [key: string]: ClientSocket } = {};
    console.log("active workers: ", activeWorkers);
    for (const worker of activeWorkers) {
      if (worker.route !== this.address) {
        const workerSocket = ioClient(`${worker.route}`);
        workerSockets[`${worker.route}`] = workerSocket;
      }
    }
    const filteredWorkers = activeWorkers.filter(
      (worker) => worker.route !== this.address
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
        chunkDistribution[i].push(worker.route);
        const workerKey = worker.route;
        const workerSocket = workerSockets[workerKey];
        console.log(`🚀 Sending ch_${i} of file_${chalk.red(fileId.slice(0, 2),"...",fileId.slice(-3))} ------> ${chalk.green(worker.route)} 🛠️`);
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

    // Send chunk distribution data to tracker
    fetch(`${this.trackerAddress}/files/${fileId}/chunks`, {
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

    // console.log("Chunk hashes:", chunkHashes);c:\Users\pietr\AppData\Local\Packages\Microsoft.ScreenSketch_8wekyb3d8bbwe\TempState\Recordings\20241001-2010-10.7724664.mp4
    fetch(`${this.trackerAddress}/chunks/${fileId}/hash`, {
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

    // Send file metadata to tracker
    fetch(`${this.trackerAddress}/files`, {
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

    console.log(chalk.green(`🎉 File uploaded with ID: ${fileId}`))
    return fileId;
  }

  private async getActiveWorkers(): Promise<WorkerInfo[]> {
    return new Promise((resolve) => {
      fetch(`${this.trackerAddress}/worker`).then((response) => {
        response.json().then((data: WorkerInfo[]) => {
          const filteredWorkers = data.filter(
            (worker: WorkerInfo) => worker.status !== "inactive"
          );
          resolve(filteredWorkers);
        });
      });
    });
  }

  private selectRandomWorkers(
    workers: WorkerInfo[],
    count: number
  ): WorkerInfo[] {
    const shuffled = workers.slice().sort(() => 0.5 - Math.random());
    // console.log("shuffled: ", shuffled.slice(0, count));
    return shuffled.slice(0, count);
  }

  async downloadFile(fileId: string, outputPath: string) {
    const chunks: (Buffer | null)[] = [];
    const fileChunks: any = await this.getFileChunks(fileId);
    const chunkHashes = await this.getChunkHashes(fileId);

    let FAIL_NOW = false;
    let hash = "!!!!!!";

    console.log("retrieving file with ID: ", fileId);

    for (const chunkId of Object.keys(fileChunks)) {
      const locations = fileChunks[chunkId];
      let correct_chunk = null;

      for (const location of locations) {
        // console.log(location);
        const isOpen = await this.checkIfLocationOpen(location);
        if (!isOpen) {
          console.error(`Location ${location} is not open.`);
          continue; // Skip to the next location if it's not open
        }
        const chunk = await new Promise<Buffer>((resolve) => {
          const nodeSocket = ioClient(`${location}`);
          nodeSocket.emit(
            "retrieve_chunk",
            { fileId, chunkId },
            (chunk: Buffer) => {
              resolve(chunk);
            }
          );
        });
        if (!chunk) {
          console.error(chalk.red(`Chunk ${chunkId} of file ${fileId} not found`));
          // console.error(`Chunk ${chunkId} of file ${fileId} not found`);
          continue;
        }
        if (!FAIL_NOW) {
          hash = crypto.createHash("sha256").update(chunk).digest("hex");
        } else {
          FAIL_NOW = false;
        }
        if (chunkHashes[Number(chunkId)].includes(hash)) {
          correct_chunk = chunk;
          console.log(
            chalk.green(`${chunkId} : ${location} -> ${this.address}`)
          );
          break;
        }
        console.log(
          `Chunk ${chunkId} of file ${fileId} failed integrity check`
        );
      }

      if (locations.length === 0) {
        console.error(`Chunk ${chunkId} of file ${fileId} not found`);
        return;
      }
      chunks[Number(chunkId)] = correct_chunk;
    }

    const validChunks = chunks.filter(Boolean) as Buffer[];

    if (validChunks.length === 0) {
      console.error("No valid chunks retrieved for the file.");
      return;
    }

    const fileContent = Buffer.concat(validChunks);
    this.verifyFileIntegrity(fileContent, fileId);
    const decompressedContent = zlib.inflateSync(fileContent);
    fs.writeFileSync(outputPath, decompressedContent);
    console.log(chalk.green(`🎉 File downloaded to ${chalk.bold(outputPath)}`));
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

  private getFileChunks(fileId: string): Promise<{ string: string[] }> {
    return new Promise((resolve) => {
      fetch(`${this.trackerAddress}/files/${fileId}/chunks`)
        .then((response) => response.json())
        .then((data) => resolve(data));
    });
  }

  private getChunkHashes(fileId: string): Promise<string[]> {
    return new Promise((resolve) => {
      fetch(`${this.trackerAddress}/chunks/${fileId}/hash`)
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
    fetch(`${this.trackerAddress}/files`)
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

  private async checkIfLocationOpen(location: string, maxRetries = 1): Promise<boolean> {
    let retries = 0;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (retries < maxRetries) {
      const isOpen = await new Promise<boolean>((resolve) => {
        const socket = ioClient(location, {
          timeout: 5000, // 5 second timeout
        });

        socket.on("connect", () => {
          console.log(`Location is open: ${location}`);
          resolve(true); // Location is open
          socket.disconnect();
        });

        socket.on("connect_error", (err) => {
          console.log(`Failed to connect to location: ${location}`);
          resolve(false); // Location is not open or unreachable
          socket.disconnect(); // Ensure disconnection
        });

        socket.on("disconnect", () => {
          resolve(false); // Disconnected
        });
      });

      if (isOpen) return true;

      retries++;
      if (retries < maxRetries) {
        console.log(`Retrying connection to ${location} (${retries}/${maxRetries})...`);
        await delay(1000); // Delay 1 second before retrying
      }
    }

    console.log(`Max retries reached for location: ${location}`);
    return false; // Location couldn't be reached after retries
  }


  cli() {
    console.clear();
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    console.log(chalk.bold.green(`🚀 Worker CLI (Port ${this.port}):`));
    console.log(chalk.cyan('Available commands:'));
    console.log(chalk.yellow('1: 📤 upload <file_path>') + ' - Upload a file');
    console.log(chalk.yellow('2: 📥 download <file_id> <output_path>') + ' - Download a file');
    console.log(chalk.yellow('3: 📋 list_chunks') + ' - List all stored chunks');
    console.log(chalk.yellow('4: 📂 list_files') + ' - List all stored files');
    console.log(chalk.yellow('5: 🚪 Exit') + ' - Exit the worker');
    console.log(chalk.yellow('6: 📄 upload_example_text') + ' - Upload example text file');
    console.log(chalk.yellow('7: 🖼️ upload_example_pic') + ' - Upload example picture file');
    console.log(chalk.yellow('8: 🎵 upload_example_sound') + ' - Upload example sound file');
    console.log(chalk.yellow('9: 📦 upload_example_bulk') + ' - Upload example bulk file');

    rl.on("line", async (input) => {
      const [command, ...args] = input.trim().split(" ");
      const commandMap = {
        "1": "upload",
        "2": "download",
        "3": "list_chunks",
        "4": "list_files",
        "5": "exit",
        "6": "upload_example_text",
        "7": "upload_example_pic",
        "8": "upload_example_sound",
        "9": "upload_example_bulk",
      } as { [key: string]: string };
      const actualCommand = commandMap[command] || command;

      switch (actualCommand) {
        case "upload":
          if (args.length !== 1) {
            console.log(chalk.red("Usage: upload <file_path>"));
            break;
          }
          await this.uploadFile(args[0]);
          break;
        case "download":
          if (args.length !== 2) {
            console.log(chalk.red("Usage: download <file_id> <output_path>"));
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
        case "upload_example_text":
          await this.uploadFile("./examples/example.txt");
          break;
        case "upload_example_pic":
          await this.uploadFile("./examples/pic.jpg");
          break;
        case "upload_example_sound":
          await this.uploadFile("./examples/sound.mp3");
          break;
        case "upload_example_bulk":
          await this.uploadFile("./examples/bulk.zip");
          break;
        case "exit":
          rl.close();
          break;
        default:
          console.log(chalk.red("❌ Unknown command:"), actualCommand);
          console.log(chalk.cyan("🔍 Available commands:"));
          console.log(chalk.yellow("1: upload <file_path>") + " - 📤 Upload a file");
          console.log(chalk.yellow("2: download <file_id> <output_path>") + " - 📥 Download a file");
          console.log(chalk.yellow("3: list_chunks") + " - 📊 List all stored chunks");
          console.log(chalk.yellow("4: list_files") + " - 📋 List all stored files");
          console.log(chalk.yellow("5: exit") + " - 👋 Exit the worker");
          console.log(chalk.yellow("6: upload_example_text") + " - 📝 Upload example text file");
          console.log(chalk.yellow("7: upload_example_pic") + " - 🖼️ Upload example picture file");
          console.log(chalk.yellow("8: upload_example_sound") + " - 🎵 Upload example sound file");
          console.log(chalk.yellow("9: upload_example_bulk") + " - 📦 Upload example bulk file");
          console.log(chalk.cyan("Enter a number or command to proceed..."));
      }
    });

    rl.on("close", () => {
      console.log(chalk.green("👋 Exiting worker..."));
      process.exit(0);
    });
  }
}

// Usage
const args = process.argv.slice(2); // Get CLI arguments

// Default values if not provided via CLI
const TRACKER_HOST = args[0] || process.env.TRACKER_HOST || "localhost";
const TRACKER_PORT = Number(args[1]) || Number(process.env.TRACKER_PORT) || 3000;
const WORKER_HOST = args[2] || process.env.WORKER_HOST || "localhost";
const WORKER_PORT = Number(args[3]) || Number(process.env.WORKER_PORT) || 3032;

const worker = new Worker(WORKER_HOST, WORKER_PORT, TRACKER_HOST, TRACKER_PORT);
worker.cli();
