const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * In-memory map of socket IDs to user/meeting info.
 * { socketId → { userId, meetingId, roomCode, isHost } }
 */
const socketUserMap = new Map();

/**
 * In-memory map of pending attentiveness pings.
 * { pingId → { hostSocketId, targetSocketId, sentAt, reacted } }
 */
const pendingPings = new Map();

/**
 * Registers all Socket.io event handlers.
 * @param {import('socket.io').Server} io
 */
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ─── JOIN MEETING ROOM ──────────────────────────────────────────────────
    /**
     * Client emits this after connecting to LiveKit.
     * We track the socket for attentiveness pings.
     * Payload: { userId, roomCode, isHost }
     */
    socket.on('meeting:join', async ({ userId, roomCode, isHost }) => {
      try {
        const meeting = await prisma.meeting.findUnique({ where: { roomCode } });
        if (!meeting) return;

        socket.join(roomCode); // Join the Socket.io room

        socketUserMap.set(socket.id, {
          userId,
          meetingId: meeting.id,
          roomCode,
          isHost: isHost || false,
        });

        // Notify others in the room about the new participant
        socket.to(roomCode).emit('participant:joined', {
          socketId: socket.id,
          userId,
          isHost,
        });

        // Send this socket the list of current participants in room
        const roomSockets = await io.in(roomCode).fetchSockets();
        const participants = roomSockets
          .filter(s => s.id !== socket.id)
          .map(s => ({
            socketId: s.id,
            ...socketUserMap.get(s.id),
          }))
          .filter(p => p.userId);

        socket.emit('participants:list', participants);
        console.log(`👤 ${userId} joined room ${roomCode} (${isHost ? 'HOST' : 'participant'})`);
      } catch (err) {
        console.error('meeting:join error:', err);
      }
    });

    // ─── ATTENTIVENESS PING ─────────────────────────────────────────────────
    /**
     * Host sends a ping to a specific participant.
     * Payload: { targetUserId, roomCode, pingId }
     */
    socket.on('ping:send', async ({ targetUserId, roomCode, pingId }) => {
      try {
        const senderInfo = socketUserMap.get(socket.id);
        if (!senderInfo?.isHost) {
          socket.emit('error', { message: 'Only the host can send pings' });
          return;
        }

        // Find target's socket ID
        const roomSockets = await io.in(roomCode).fetchSockets();
        const targetSocket = roomSockets.find(s => {
          const info = socketUserMap.get(s.id);
          return info?.userId === targetUserId;
        });

        if (!targetSocket) {
          socket.emit('ping:error', { pingId, message: 'Participant not found in room' });
          return;
        }

        // Record the ping
        pendingPings.set(pingId, {
          hostSocketId: socket.id,
          targetSocketId: targetSocket.id,
          targetUserId,
          roomCode,
          sentAt: Date.now(),
          reacted: false,
        });

        // Send ping to target participant
        targetSocket.emit('ping:receive', {
          pingId,
          from: 'Host',
          sentAt: Date.now(),
        });

        // Update ping count in DB
        const meeting = await prisma.meeting.findUnique({ where: { roomCode } });
        if (meeting) {
          await prisma.attendance.updateMany({
            where: { meetingId: meeting.id, userId: targetUserId },
            data: { pingsSent: { increment: 1 } },
          });
        }

        // Auto-resolve after 10 seconds if no reaction
        setTimeout(async () => {
          const ping = pendingPings.get(pingId);
          if (ping && !ping.reacted) {
            pendingPings.delete(pingId);
            socket.emit('ping:result', {
              pingId,
              targetUserId,
              reacted: false,
              message: 'No reaction within 10 seconds',
            });
          }
        }, 10000);

        console.log(`🔔 Ping sent to ${targetUserId} in room ${roomCode}`);
      } catch (err) {
        console.error('ping:send error:', err);
      }
    });

    /**
     * Target participant reacts to a ping.
     * Payload: { pingId }
     */
    socket.on('ping:react', async ({ pingId }) => {
      try {
        const ping = pendingPings.get(pingId);
        if (!ping || ping.reacted) return;

        ping.reacted = true;
        pendingPings.delete(pingId);

        // Notify host
        const hostSocket = io.sockets.sockets.get(ping.hostSocketId);
        if (hostSocket) {
          hostSocket.emit('ping:result', {
            pingId,
            targetUserId: ping.targetUserId,
            reacted: true,
            reactionTimeMs: Date.now() - ping.sentAt,
          });
        }

        // Update reaction count in DB
        const meeting = await prisma.meeting.findUnique({ where: { roomCode: ping.roomCode } });
        if (meeting) {
          await prisma.attendance.updateMany({
            where: { meetingId: meeting.id, userId: ping.targetUserId },
            data: { pingsReacted: { increment: 1 } },
          });
        }

        console.log(`✅ Ping reacted by ${ping.targetUserId}`);
      } catch (err) {
        console.error('ping:react error:', err);
      }
    });

    // ─── CHAT MESSAGES ──────────────────────────────────────────────────────
    /**
     * Relay chat messages to all room participants.
     * Payload: { roomCode, message, senderName, timestamp }
     */
    socket.on('chat:message', ({ roomCode, message, senderName, timestamp }) => {
      io.to(roomCode).emit('chat:message', {
        socketId: socket.id,
        senderName,
        message,
        timestamp: timestamp || Date.now(),
      });
    });

    // ─── DISCONNECT ─────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const info = socketUserMap.get(socket.id);

      if (info) {
        const { roomCode, userId } = info;

        // Notify others
        socket.to(roomCode).emit('participant:left', {
          socketId: socket.id,
          userId,
        });

        socketUserMap.delete(socket.id);
        console.log(`❌ Socket disconnected: ${socket.id} (${userId})`);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
