const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static('public'));

// When a client connects to the server
io.on('connection', (socket) => {
    console.log('A user connected: ' + socket.id);

    // Handle file upload event
    socket.on('upload-file', (fileData) => {
        console.log('File uploaded:', fileData);
        // Broadcast file information to other nodes
        socket.broadcast.emit('file-uploaded', fileData);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.id);
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
