"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var socket_io_1 = require("socket.io");
var Tracker = /** @class */ (function () {
    function Tracker(port) {
        this.port = port;
        this.server = new socket_io_1.Server(port);
        this.nodes = new Map(); // Keep tracks of the active nodes:  socketId, { address, port }
        this.fileChunks = new Map(); // Keep tracks of the chunks: fileId, { chunkId, [workerId] }
        this.files = new Map(); // Keep tracks of the files: fileId, { fileName, fileSize }
        this.setupEventListeners();
        console.log("Tracker started on port ".concat(port));
    }
    Tracker.prototype.setupEventListeners = function () {
        var _this = this;
        this.server.on('connection', function (socket) {
            console.log('New worker connected to tracker');
            socket.on('register_worker', function (data) {
                _this.registerWorker(socket.id, data.address, data.port);
            });
            socket.on('disconnect', function () {
                _this.removeWorker(socket.id);
            });
            socket.on('store_chunk_info', function (data) {
                _this.storeChunkInfo(data.fileId, data.chunkId, socket.id);
            });
            socket.on('get_chunk_locations', function (data, callback) {
                var locations = _this.getChunkLocations(data.fileId, data.chunkId);
                callback(locations);
            });
            socket.on('get_active_workers', function (callback) {
                callback(Array.from(_this.nodes.values()));
            });
            socket.on('get_file_chunks', function (fileId, callback) {
                var chunks = _this.getFileChunks(fileId);
                callback(chunks);
            });
            socket.on('retrieve_chunk', function (data, callback) {
                _this.retrieveChunk(data.fileId, data.chunkId, callback);
            });
            socket.on('store_file', function (data) {
                _this.storeFile(data.fileId, data.fileName, data.fileSize);
            });
            socket.on('list_files', function (callback) {
                console.log('Listing files: ', _this.files);
                var filesArray = Array.from(_this.files.entries()).map(function (_a) {
                    var fileId = _a[0], fileInfo = _a[1];
                    return ({
                        fileId: fileId,
                        fileName: fileInfo.fileName,
                        fileSize: fileInfo.fileSize,
                    });
                });
                callback(filesArray); // Send the array back
            });
        });
    };
    Tracker.prototype.registerWorker = function (socketId, address, port) {
        this.nodes.set(socketId, { address: address, port: port });
        console.log("Registered worker: ".concat(address, ":").concat(port));
    };
    Tracker.prototype.removeWorker = function (socketId) {
        this.nodes.delete(socketId);
        console.log("Worker disconnected: ".concat(socketId));
    };
    Tracker.prototype.storeChunkInfo = function (fileId, chunkId, workerId) {
        var _a, _b, _c, _d;
        if (!this.fileChunks.has(fileId)) {
            this.fileChunks.set(fileId, new Map());
        }
        if (!((_a = this.fileChunks.get(fileId)) === null || _a === void 0 ? void 0 : _a.has(chunkId))) {
            (_b = this.fileChunks.get(fileId)) === null || _b === void 0 ? void 0 : _b.set(chunkId, new Set());
        }
        (_d = (_c = this.fileChunks.get(fileId)) === null || _c === void 0 ? void 0 : _c.get(chunkId)) === null || _d === void 0 ? void 0 : _d.add(workerId);
    };
    Tracker.prototype.getChunkLocations = function (fileId, chunkId) {
        var _this = this;
        var _a, _b, _c;
        if (this.fileChunks.has(fileId) && ((_a = this.fileChunks.get(fileId)) === null || _a === void 0 ? void 0 : _a.has(chunkId))) {
            return Array.from((_c = (_b = this.fileChunks.get(fileId)) === null || _b === void 0 ? void 0 : _b.get(chunkId)) !== null && _c !== void 0 ? _c : [])
                .map(function (workerId) { return _this.nodes.get(workerId); })
                .filter(Boolean);
        }
        return [];
    };
    Tracker.prototype.getFileChunks = function (fileId) {
        var _a, _b;
        if (this.fileChunks.has(fileId)) {
            return Array.from((_b = (_a = this.fileChunks.get(fileId)) === null || _a === void 0 ? void 0 : _a.keys()) !== null && _b !== void 0 ? _b : []);
        }
        return [];
    };
    Tracker.prototype.retrieveChunk = function (fileId, chunkId, callback) {
        var chunkLocations = this.getChunkLocations(fileId, chunkId);
        callback(chunkLocations);
    };
    Tracker.prototype.storeFile = function (fileId, fileName, fileSize) {
        console.log("Storing file: ".concat(fileName, " with ID: ").concat(fileId));
        this.files.set(fileId, { fileName: fileName, fileSize: fileSize });
    };
    return Tracker;
}());
// Create and start the tracker
var port = 3000;
var tracker = new Tracker(port);
