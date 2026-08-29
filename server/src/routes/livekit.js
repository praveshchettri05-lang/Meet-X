const express = require('express');
const router = express.Router();
const { AccessToken } = require('livekit-server-sdk');
const { PrismaClient } = require('@prisma/client');
const { verifyFirebaseToken } = require('../middleware/auth');

const prisma = new PrismaClient();

/**
 * POST /api/livekit/token
 * Generates a LiveKit access token for the requesting user to join a room.
 * Body: { roomCode: string }
 *
 * The token grants:
 * - Host: can publish, subscribe, mute others, remove participants
 * - Participant: can publish, subscribe
 */
router.post('/token', verifyFirebaseToken, async (req, res) => {
  const { roomCode } = req.body;

  if (!roomCode) {
    return res.status(400).json({ error: 'roomCode is required' });
  }

  try {
    // Get user profile
    const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.uid } });
    if (!user) return res.status(403).json({ error: 'Profile not set up' });

    // Get meeting
    const meeting = await prisma.meeting.findUnique({ where: { roomCode } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const isHost = meeting.hostId === user.id;

    // Build LiveKit token
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: user.id,
        name: `${user.name} (${user.rollNumber})`,
        ttl: '4h', // token valid for 4 hours
        metadata: JSON.stringify({
          userId: user.id,
          email: user.email,
          name: user.name,
          rollNumber: user.rollNumber,
          isHost,
        }),
      }
    );

    at.addGrant({
      roomJoin: true,
      room: meeting.livekitRoom,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Host-only capabilities
      roomAdmin: isHost,
      canUpdateOwnMetadata: true,
    });

    const token = await at.toJwt();

    res.json({
      token,
      livekitUrl: process.env.LIVEKIT_WS_URL,
      livekitRoom: meeting.livekitRoom,
      isHost,
      user: {
        id: user.id,
        name: user.name,
        rollNumber: user.rollNumber,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('POST /livekit/token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
