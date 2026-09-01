const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * In-memory map of socket IDs to user/meeting info.
 * { socketId → { userId, meetingId, roomCode, isHost, joinedAt } }
 */
const socketUserMap = new Map();

/**
 * In-memory map of pending attentiveness pings.
 * { pingId → { hostSocketId, targetSocketId, sentAt, reacted } }
 */
const pendingPings = new Map();

/**
 * Records attendance join event in DB via Socket.io.
 * This is the PRIMARY attendance mechanism (webhook is optional backup).
 */
async function recordJoin(userId, meetingId) {
  try {
    await prisma.attendance.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      create: {
        meetingId,
        userId,
        joinedAt: new Date(),
        totalSeconds: 0,
        percentage: 0,
      },
      update: {
        // If reconnecting, reset left time
        leftAt: null,
      },
    });
    console.log(`✅ Attendance JOIN recorded: userId=${userId} meetingId=${meetingId}`);
  } catch (err) {
    console.error('recordJoin error:', err);
  }
}

/**
 * Records attendance leave event in DB via Socket.io.
 */
async function recordLeave(userId, meetingId, roomCode) {
  try {
    const att = await prisma.attendance.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });
    if (!att) return;

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) return;

    const now = new Date();
    const totalSecs = Math.max(0, Math.floor((now - att.joinedAt) / 1000));

    // Use actual meeting duration if ended, otherwise now
    const meetingEndTime = meeting.endedAt || now;
    const meetingDurationSecs = Math.max(1, Math.floor((meetingEndTime - meeting.startedAt) / 1000));
    const pct = Math.min(100, Math.round((totalSecs / meetingDurationSecs) * 100));

    await prisma.attendance.update({
      where: { id: att.id },
      data: {
        leftAt: now,
        totalSeconds: totalSecs,
        percentage: pct,
      },
    });
    console.log(`📤 Attendance LEAVE recorded: userId=${userId} ${pct}% (${totalSecs}s)`);
  } catch (err) {
    console.error('recordLeave error:', err);
  }
}

/**
 * Registers all Socket.io event handlers.
 * @param {import('socket.io').Server} io
 */
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ─── JOIN MEETING ROOM ──────────────────────────────────────────────────
    socket.on('meeting:join', async ({ userId, roomCode, isHost, name }) => {
      try {
        const meeting = await prisma.meeting.findUnique({ where: { roomCode } });
        if (!meeting) {
          console.warn(`meeting:join — room not found: ${roomCode}`);
          return;
        }

        socket.join(roomCode);

        socketUserMap.set(socket.id, {
          userId,
          name: name || 'Unknown',
          meetingId: meeting.id,
          roomCode,
          isHost: isHost || false,
          joinedAt: Date.now(),
        });

        // ── Record attendance JOIN in DB ──────────────────────────────────
        await recordJoin(userId, meeting.id);

        // Notify others in the room
        socket.to(roomCode).emit('participant:joined', {
          socketId: socket.id,
          userId,
          name: name || 'Unknown',
          isHost,
        });

        // Send current participants list to this socket
        const roomSockets = await io.in(roomCode).fetchSockets();
        const participants = roomSockets
          .filter(s => s.id !== socket.id)
          .map(s => ({
            socketId: s.id,
            ...socketUserMap.get(s.id),
          }))
          .filter(p => p.userId);

        socket.emit('participants:list', participants);
        console.log(`👤 ${userId} (${name}) joined room ${roomCode} (${isHost ? 'HOST' : 'participant'})`);
      } catch (err) {
        console.error('meeting:join error:', err);
      }
    });

    // ─── ATTENTIVENESS PING ─────────────────────────────────────────────────
    socket.on('ping:send', async ({ targetUserId, roomCode, pingId }) => {
      try {
        const senderInfo = socketUserMap.get(socket.id);
        if (!senderInfo?.isHost) {
          socket.emit('error', { message: 'Only the host can send pings' });
          return;
        }

        const roomSockets = await io.in(roomCode).fetchSockets();
        const targetSocket = roomSockets.find(s => {
          const info = socketUserMap.get(s.id);
          return info?.userId === targetUserId;
        });

        if (!targetSocket) {
          socket.emit('ping:error', { pingId, message: 'Participant not found in room' });
          return;
        }

        pendingPings.set(pingId, {
          hostSocketId: socket.id,
          targetSocketId: targetSocket.id,
          targetUserId,
          roomCode,
          sentAt: Date.now(),
          reacted: false,
        });

        const senderName = senderInfo.name || 'Host';
        targetSocket.emit('ping:receive', {
          pingId,
          from: senderName,
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

    socket.on('ping:react', async ({ pingId }) => {
      try {
        const ping = pendingPings.get(pingId);
        if (!ping || ping.reacted) return;

        ping.reacted = true;
        pendingPings.delete(pingId);

        const hostSocket = io.sockets.sockets.get(ping.hostSocketId);
        if (hostSocket) {
          hostSocket.emit('ping:result', {
            pingId,
            targetUserId: ping.targetUserId,
            reacted: true,
            reactionTimeMs: Date.now() - ping.sentAt,
          });
        }

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
    // FIX: Forward clientMsgId back so the sender can deduplicate their own echo.
    //      Use socket.to() (excludes sender) so the sender doesn't receive their
    //      own message via the socket — the client already adds it optimistically.
    socket.on('chat:message', ({ roomCode, message, senderName, timestamp, clientMsgId }) => {
      // Broadcast to everyone EXCEPT the sender so there's no duplicate on the sender's side.
      socket.to(roomCode).emit('chat:message', {
        socketId: socket.id,
        senderName,
        message,
        timestamp: timestamp || Date.now(),
        clientMsgId, // preserve so receiver can deduplicate if needed
      });
    });

    // ─── DISCONNECT ─────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const info = socketUserMap.get(socket.id);

      if (info) {
        const { roomCode, userId, meetingId } = info;

        // Notify others
        socket.to(roomCode).emit('participant:left', {
          socketId: socket.id,
          userId,
        });

        // ── Record attendance LEAVE in DB ─────────────────────────────────
        await recordLeave(userId, meetingId, roomCode);

        socketUserMap.delete(socket.id);
        console.log(`❌ Socket disconnected: ${socket.id} (userId=${userId})`);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
