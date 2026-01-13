const { Server } = require('socket.io');

let io;
const partnerSockets = new Map();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust this to your frontend URL in production for security
      methods: ["GET", "POST", "PATCH", "PUT"]
    }
  });

  io.on('connection', (socket) => {
    console.log('[SOCKET] Client connected:', socket.id);

    // Join partner specific room
    socket.on('join-partner-room', (partnerId) => {
      if (partnerId) {
        socket.join(`partner-${partnerId}`);
        partnerSockets.set(partnerId, socket.id);
        console.log(`[SOCKET] Partner ${partnerId} joined room: partner-${partnerId}`);
      }
    });

    // Join user/customer specific room
    socket.on('join-user-room', (userId) => {
      if (userId) {
        socket.join(`user-${userId}`);
        console.log(`[SOCKET] User ${userId} joined room: user-${userId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET] Client disconnected:', socket.id);
      // Clean up map
      for (let [id, sockId] of partnerSockets.entries()) {
        if (sockId === socket.id) {
          partnerSockets.delete(id);
          break;
        }
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

module.exports = { initSocket, getIO };
