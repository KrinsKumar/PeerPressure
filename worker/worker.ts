import { Server } from 'socket.io';
import ioClient, { Socket as ClientSocket } from 'socket.io-client';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as readline from 'readline';
import * as path from 'path';

interface ChunkData {
    fileId: string;
    chunkId: number;
    chunk: Buffer;
}

interface WorkerInfo {
    address: string;
    port: number;
}

class Worker {
    private server: Server;
    private trackerSocket: ClientSocket;
    private chunks: Map<string, Map<number, Buffer>>;
    private workerSockets: Map<string, ClientSocket>;
    private address: string;
    private port: number;

    constructor(port: number, trackerAddress: string) {
        this.port = port;
        this.server = new Server(port);
        this.trackerSocket = ioClient(trackerAddress);
        this.chunks = new Map();
        this.setupEventListeners();
        this.workerSockets = new Map();
        this.address = 'localhost'; // Assuming the address is localhost
        console.log(`Worker started on port ${port}`);
    }

    private setupEventListeners() {
        this.server.on('connection', (socket) => {
            console.log(`New connection on port ${this.port}`);

            socket.on('store_chunk', (data: ChunkData, callback: (response: { success: boolean }) => void) => {
                this.storeChunk(data.fileId, data.chunkId, data.chunk);
                this.trackerSocket.emit('store_chunk_info', {
                    fileId: data.fileId,
                    chunkId: data.chunkId
                });
                callback({ success: true });
            });

            socket.on('retrieve_chunk', (data: { fileId: string; chunkId: number }, callback: (chunk: Buffer | null) => void) => {
                const chunk = this.retrieveChunk(data.fileId, data.chunkId);
                callback(chunk);
            });
        });

        this.trackerSocket.on('connect', () => {
            this.trackerSocket.emit('register_worker', {
                address: this.address,
                port: this.port
            });
        });
    }

    private storeChunk(fileId: string, chunkId: number, chunk: Buffer) {
        if (!this.chunks.has(fileId)) {
            this.chunks.set(fileId, new Map());
        }
        this.chunks.get(fileId)!.set(chunkId, chunk);
        console.log(`Stored chunk ${chunkId} of file ${fileId} to node ${this.trackerSocket}:${this.port}`);
    }

    private retrieveChunk(fileId: string, chunkId: number): Buffer | null {
        if (this.chunks.has(fileId) && this.chunks.get(fileId)!.has(chunkId)) {
            return this.chunks.get(fileId)!.get(chunkId)!;
        }
        return null;
    }

    async uploadFile(filePath: string): Promise<string> {
        const fileContent = fs.readFileSync(filePath);
        const fileId = crypto.createHash('sha256').update(fileContent).digest('hex');
        const chunks = this.splitIntoChunks(fileContent);

        const activeWorkers: WorkerInfo[] = await this.getActiveWorkers();
        const replicationFactor = Math.ceil(activeWorkers.length / 2);

        const workerSockets: { [key: string]: ClientSocket } = {};
        for (const worker of activeWorkers) {
            if (worker.address !== this.address || worker.port !== this.port) {
                const workerSocket = ioClient(`http://${worker.address}:${worker.port}`);
                workerSockets[`${worker.address}:${worker.port}`] = workerSocket;
            }
        }

        for (let i = 0; i < chunks.length; i++) {
            const targetWorkers = this.selectRandomWorkers(activeWorkers, replicationFactor);

            for (const worker of targetWorkers) {
                const workerKey = `${worker.address}:${worker.port}`;
                const workerSocket = workerSockets[workerKey];

                await new Promise<void>((resolve) => {
                    workerSocket.emit('store_chunk', {
                        fileId,
                        chunkId: i,
                        chunk: chunks[i]
                    }, (response: { success: boolean }) => {
                        if (response.success) {
                            resolve();
                        }
                    });
                });
            }
        }

        for (const workerKey in workerSockets) {
            workerSockets[workerKey].close();
            console.log(`Connection to worker ${workerKey} closed.`);
        }

        this.trackerSocket.emit('store_file', {
            fileId,
            fileName: path.basename(filePath),
            fileSize: fileContent.length
        });

        console.log(`File uploaded with ID: ${fileId}`);
        return fileId;
    }

    private async getActiveWorkers(): Promise<WorkerInfo[]> {
        return new Promise((resolve) => {
            this.trackerSocket.emit('get_active_workers', (workers: WorkerInfo[]) => {
                resolve(workers);
            });
        });
    }

    private selectRandomWorkers(workers: WorkerInfo[], count: number): WorkerInfo[] {
        const shuffled = workers.slice().sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    async downloadFile(fileId: string, outputPath: string) {
        const chunks: (Buffer | null)[] = [];
        const fileChunks = await this.getFileChunks(fileId);

        console.log("retrieving file with ID: ", fileId);

        for (const chunkId of fileChunks) {
            const locations = await this.getChunkLocations(fileId, chunkId);
            if (locations.length === 0) {
                console.error(`Chunk ${chunkId} of file ${fileId} not found`);
                return;
            }
            console.log("trying to retrieve chunk");
            const chunk = await new Promise<Buffer>((resolve) => {
                const nodeSocket = ioClient(`http://${locations[0].address}:${locations[0].port}`);
                nodeSocket.emit('retrieve_chunk', { fileId, chunkId }, (chunk: Buffer) => {
                    resolve(chunk);
                });
            });

            chunks[chunkId] = chunk;
        }

        const validChunks = chunks.filter(Boolean) as Buffer[];

        if (validChunks.length === 0) {
            console.error('No valid chunks retrieved for the file.');
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
        const hash = crypto.createHash('sha256').update(fileContent).digest('hex');
        console.log(`File integrity check:
      File ID: ${fileId}
      SHA-256 Hash: ${hash}
    `);
    }

    private getActiveNodes(): Promise<any[]> {
        return new Promise((resolve) => {
            this.trackerSocket.emit('get_active_nodes', (nodes: any[]) => {
                resolve(nodes);
            });
        });
    }

    private getChunkLocations(fileId: string, chunkId: number): Promise<WorkerInfo[]> {
        return new Promise((resolve) => {
            this.trackerSocket.emit('get_chunk_locations', { fileId, chunkId }, (locations: WorkerInfo[]) => {
                resolve(locations);
            });
        });
    }

    private getFileChunks(fileId: string): Promise<number[]> {
        return new Promise((resolve) => {
            this.trackerSocket.emit('get_file_chunks', fileId, (chunks: number[]) => {
                resolve(chunks);
            });
        });
    }

    private selectRandomNodes(nodes: any[], count: number): any[] {
        const shuffled = nodes.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    private listStoredChunks() {
        console.log('Stored chunks:');
        this.chunks.forEach((fileChunks, fileId) => {
            console.log(`File ID: ${fileId}`);
            fileChunks.forEach((chunk, chunkId) => {
                console.log(`Chunk ID: ${chunkId}, Size: ${chunk.length} bytes`);
            });
        });
    }

    private listStoredFiles() {
        this.trackerSocket.emit('list_files', (files: any[]) => {
            console.log('Stored files:', files);
            files.forEach((file, index) => {
                console.log(`File ID: ${file.fileId}, Name: ${file.fileName}, Size: ${file.fileSize} bytes`);
            });
        });
    }

    cli() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log(`Worker CLI (Port ${this.port}):`);
        console.log('Available commands:');
        console.log('- upload <file_path>: Upload a file');
        console.log('- download <file_id> <output_path>: Download a file');
        console.log('- list_chunks: List all stored chunks');
        console.log('- list_files: List all stored files');
        console.log('- exit: Exit the worker');

        rl.on('line', async (input) => {
            const [command, ...args] = input.trim().split(' ');

            switch (command) {
                case 'upload':
                    if (args.length !== 1) {
                        console.log('Usage: upload <file_path>');
                        break;
                    }
                    await this.uploadFile(args[0]);
                    break;
                case 'download':
                    if (args.length !== 2) {
                        console.log('Usage: download <file_id> <output_path>');
                        break;
                    }
                    await this.downloadFile(args[0], args[1]);
                    break;
                case 'list_chunks':
                    this.listStoredChunks();
                    break;
                case 'list_files':
                    this.listStoredFiles();
                    break;
                case 'exit':
                    rl.close();
                    break;
                default:
                    console.log('Unknown command:', command);
            }
        });

        rl.on('close', () => {
            console.log('Exiting worker...');
            process.exit(0);
        });
    }
}

// Usage
const port = Number(process.argv[2]);
const trackerAddress = process.argv[3] || 'http://localhost:3000';
const worker = new Worker(port, trackerAddress);
worker.cli();
