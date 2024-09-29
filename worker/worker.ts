import { Server } from "socket.io";
import ioClient, { Socket as ClientSocket } from "socket.io-client";
import * as fs from "fs";
import * as crypto from "crypto";
import * as readline from "readline";
import * as path from "path";
import express from "express";
import { Request, Response } from "express";
import * as zlib from 'zlib';


interface ChunkData {
    fileId: string;
    chunkId: number;
    chunk: Buffer;
}

interface WorkerInfo {
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
    private trackerAddress: string
    private expressApp: express.Application;

    constructor(host: string, port: number, trackerHost: string, trackerPort: number) {
        this.trackerAddress = `http://${trackerHost}:${trackerPort}`
        this.host = host
        this.port = port;
        this.chunks = new Map(); 
        this.address = `http://${this.host}:${this.port}`;
        console.log(`Worker started on port ${port}`);
        this.expressApp = express();

        // Start the Express server for heartbeat
        const httpServer = this.expressApp.listen(this.port, () => {
            console.log(`Heartbeat server listening on port ${this.port}`);
        });

        this.server = new Server(httpServer);
        this.setupEventListeners();

        this.setupHeartbeat();
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
            console.log(`New connection on port ${this.port}`);
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

    private setupHeartbeat() {
        this.expressApp.get("/heartbeat", (req: Request, res: Response) => {
            res.status(200).send("OK");
        });
    }

    private storeChunk(fileId: string, chunkId: number, chunk: Buffer) {
        if (!this.chunks.has(fileId)) {
            this.chunks.set(fileId, new Map());
        }
        this.chunks.get(fileId)!.set(chunkId, chunk);
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
            console.log("response: ", response);
            if (response.ok) {
                console.log(`File ${fileId} already exists in the system.`);
                return fileId;
            }
        } catch (error) {
            console.error(`Error checking file existence: ${error}`);
        }
        const chunks = this.splitIntoChunks(fileContent);

        const activeWorkers: WorkerInfo[] = await this.getActiveWorkers();
        const replicationFactor = Math.ceil(activeWorkers.length / 2);

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

        const chunkDistribution: { [chunkId: number]: string[] } = {};

        for (let i = 0; i < chunks.length; i++) {
            const targetWorkers = this.selectRandomWorkers(
                filteredWorkers,
                replicationFactor
            );
            chunkDistribution[i] = [];

            for (const worker of targetWorkers) {
                chunkDistribution[i].push(worker.route);
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

        console.log(`File uploaded with ID: ${fileId}`);
        return fileId;
    }

    private async getActiveWorkers(): Promise<WorkerInfo[]> {
        return new Promise((resolve) => {
            fetch(`${this.trackerAddress}/worker`)
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
        const decompressedContent = zlib.inflateSync(fileContent);
        fs.writeFileSync(outputPath, decompressedContent);
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

    private getFileChunks(fileId: string): Promise<{ string: string[] }> {
        return new Promise((resolve) => {
            fetch(`${this.trackerAddress}/files/${fileId}/chunks`)
                .then((response) => response.json())
                .then((data) => resolve(data));
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

    cli() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        console.log(`Worker CLI (Port ${this.port}):`);
        console.log("Available commands:");
        console.log("1: upload <file_path> - Upload a file");
        console.log("2: download <file_id> <output_path> - Download a file");
        console.log("3: list_chunks - List all stored chunks");
        console.log("4: list_files - List all stored files");
        console.log("5: exit - Exit the worker");
        console.log("6: upload_example_text - Upload example text file");
        console.log("7: upload_example_pic - Upload example picture file");
        console.log("8: upload_example_sound - Upload example sound file");
        console.log("9: upload_example_bulk - Upload example bulk file");

        rl.on("line", async (input) => {
            const [command, ...args] = input.trim().split(" ");
            
            // Map numbers to commands
            const commandMap = {
                '1': 'upload',
                '2': 'download',
                '3': 'list_chunks',
                '4': 'list_files',
                '5': 'exit',
                '6': 'upload_example_text',
                '7': 'upload_example_pic',
                '8': 'upload_example_sound',
                '9': 'upload_example_bulk',
            } as { [key: string]: string };
        
            // Check if the input is a number shortcut
            const actualCommand = commandMap[command] || command;
        
            switch (actualCommand) {
                case "upload":
                    if (args.length !== 1) {
                        console.log("Usage: upload <file_path>");
                        break;
                    }
                    await this.uploadFile(args[0]);
                    break;
                case "upload_example":
                    // Upload the specific example file
                    await this.uploadFile('./examples/example.txt');
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
                case "upload_example_text":
                    await this.uploadFile('./examples/example.txt');
                    break;
                case "upload_example_pic":
                    await this.uploadFile('./examples/pic.jpg');
                    break;
                case "upload_example_sound":
                    await this.uploadFile('./examples/sound.mp3');
                    break;
                case "exit":
                    rl.close();
                    break;
                default:
                    console.log("Unknown command:", actualCommand);
                    // show possible commands
                    console.log("Possible commands:");
                    console.log("1: upload <file_path> - Upload a file");
                    console.log("2: download <file_id> <output_path> - Download a file");
                    console.log("3: list_chunks - List all stored chunks");
                    console.log("4: list_files - List all stored files");
                    console.log("5: exit - Exit the worker");
                    console.log("6: upload_example_text - Upload example text file");
                    console.log("7: upload_example_pic - Upload example picture file");
                    console.log("8: upload_example_sound - Upload example sound file");
            }
        });
        
        rl.on("close", () => {
            console.log("Exiting worker...");
            process.exit(0);
        });
    }
}

// Usage
const TRACKER_HOST = process.env.TRACKER_HOST || "localhost"
const TRACKER_PORT = Number(process.env.TRACKER_PORT) || 3000
const WORKER_HOST = process.env.WORKER_HOST || "localhost"
const WORKER_PORT = Number(process.env.WORKER_PORT) || 3001
const worker = new Worker(WORKER_HOST, WORKER_PORT, TRACKER_HOST, TRACKER_PORT);
worker.cli();

