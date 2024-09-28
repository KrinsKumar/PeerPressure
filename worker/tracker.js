
const io = require('socket.io');

class Tracker {
  constructor(port) {
    this.port = port;
    this.server = io(port);
    this.nodes = new Map(); // Keep tracks of the active nodes:  socketId, { address, port }
    this.fileChunks = new Map(); // Keep tracks of the chunks: fileId, { chunkId, [workerId] }
    this.files = new Map(); // Keep tracks of the files: fileId, { fileName, fileSize }
    this.setupEventListeners();
    console.log(`Tracker started on port ${port}`);
  }

  setupEventListeners() {
    this.server.on('connection', (socket) => {
      console.log('New worker connected to tracker');

      socket.on('register_worker', (data) => {
        this.registerWorker(socket.id, data.address, data.port);
      });

      socket.on('disconnect', () => {
        this.removeWorker(socket.id);
      });

      socket.on('store_chunk_info', (data) => {
        this.storeChunkInfo(data.fileId, data.chunkId, socket.id);
      });

      socket.on('get_chunk_locations', (data, callback) => {
        const locations = this.getChunkLocations(data.fileId, data.chunkId);
        callback(locations);
      });

      socket.on('get_active_workers', (callback) => {
        callback(Array.from(this.nodes.values()));
      });

      socket.on('get_file_chunks', (fileId, callback) => {
        const chunks = this.getFileChunks(fileId);
        callback(chunks);
      });

      socket.on('retrieve_chunk', (data, callback) => {
        this.retrieveChunk(data.fileId, data.chunkId, callback);
      });

      socket.on('store_file', (data) => {
        this.storeFile(data.fileId, data.fileName, data.fileSize);
        
      });

      socket.on('list_files', (callback) => {
        console.log('Listing files: ', this.files);
        // Convert Map to an array of objects
        const filesArray = Array.from(this.files.entries()).map(([fileId, fileInfo]) => ({
          fileId,
          fileName: fileInfo.fileName,
          fileSize: fileInfo.fileSize
        }));
        callback(filesArray);  // Send the array back
      });

    });
  }

  registerWorker(socketId, address, port) {
    this.nodes.set(socketId, { address, port });
    console.log(`Registered worker: ${address}:${port}`);
  }

  removeWorker(socketId) {
    this.nodes.delete(socketId);
    console.log(`Worker disconnected: ${socketId}`);
  }

  storeChunkInfo(fileId, chunkId, workerId) {
    if (!this.fileChunks.has(fileId)) {
      this.fileChunks.set(fileId, new Map());
    }
    if (!this.fileChunks.get(fileId).has(chunkId)) {
      this.fileChunks.get(fileId).set(chunkId, new Set());
    }
    this.fileChunks.get(fileId).get(chunkId).add(workerId);
  }

  getChunkLocations(fileId, chunkId) {
    if (this.fileChunks.has(fileId) && this.fileChunks.get(fileId).has(chunkId)) {
      return Array.from(this.fileChunks.get(fileId).get(chunkId))
        .map(workerId => this.nodes.get(workerId))
        .filter(Boolean);
    }
    return [];
  
  }

  getFileChunks(fileId) {
    if (this.fileChunks.has(fileId)) {
      return Array.from(this.fileChunks.get(fileId).keys());
    }
    return [];
  }

  retrieveChunk(fileId, chunkId, callback) {
    const chunkLocations = this.getChunkLocations(fileId, chunkId);
    callback(chunkLocations);
  }

  storeFile(fileId, fileName, fileSize) {
    console.log(`Storing file: ${fileName} with ID: ${fileId}`);
    this.files.set(fileId, { fileName, fileSize });
  }

}

// Create and start the tracker
const port = 3000;
const tracker = new Tracker(port); 
