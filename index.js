const http = require('http');
const app = require('./src/app');
const { initSocket } = require('./src/socket');

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


