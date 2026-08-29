const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../middleware/auth');

const prisma = new PrismaClient();

/**
 * Generates a human-readable room code like "azure-pine-7842"
 */
function generateRoomCode() {
  const adjectives = ['azure', 'coral', 'golden', 'silver', 'crimson', 'jade', 'amber', 'violet', 'indigo', 'emerald'];
  const nouns = ['pine', 'river', 'cloud', 'peak', 'storm', 'tide', 'flame', 'frost', 'grove', 'shore'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}-${noun}-${num}`;
}

/**
 * POST /api/meetings/create
 * Creates a new meeting room.
 * Body: { title?: string }
 */
router.post('/create', verifyFirebaseToken, async (req, res) => {
  const { title } = req.body;

  try {
    // Get user from DB
    const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.uid } });
    if (!user) return res.status(403).json({ error: 'Profile not set up. Please complete your profile first.' });

    const roomCode = generateRoomCode();
    const livekitRoom = `meetx-${roomCode}-${uuidv4().slice(0, 8)}`;

    const meeting = await prisma.meeting.create({
      data: {
        roomCode,
        title: title || `${user.name}'s Meeting`,
        hostId: user.id,
        livekitRoom,
      },
      include: { host: true },
    });

    res.json(meeting);
  } catch (err) {
    console.error('POST /meetings/create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/meetings/:roomCode
 * Returns meeting details by room code.
 */
router.get('/:roomCode', verifyFirebaseToken, async (req, res) => {
  const { roomCode } = req.params;

  try {
    const meeting = await prisma.meeting.findUnique({
      where: { roomCode },
      include: { host: true },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found. Check the room code and try again.' });
    }

    res.json(meeting);
  } catch (err) {
    console.error('GET /meetings/:roomCode error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/meetings/:roomCode/end
 * Ends a meeting (host only). Records endedAt timestamp.
 */
router.post('/:roomCode/end', verifyFirebaseToken, async (req, res) => {
  const { roomCode } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.uid } });
    if (!user) return res.status(403).json({ error: 'User not found' });

    const meeting = await prisma.meeting.findUnique({ where: { roomCode } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.hostId !== user.id) return res.status(403).json({ error: 'Only the host can end the meeting' });

    const now = new Date();
    const meetingDurationMs = now - meeting.startedAt;
    const meetingDurationSecs = Math.floor(meetingDurationMs / 1000);

    // Close all still-open attendance records
    const openAttendances = await prisma.attendance.findMany({
      where: { meetingId: meeting.id, leftAt: null },
    });

    for (const att of openAttendances) {
      const totalSecs = Math.floor((now - att.joinedAt) / 1000);
      const pct = meetingDurationSecs > 0
        ? Math.min(100, Math.round((totalSecs / meetingDurationSecs) * 100))
        : 0;

      await prisma.attendance.update({
        where: { id: att.id },
        data: { leftAt: now, totalSeconds: totalSecs, percentage: pct },
      });
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { roomCode },
      data: { endedAt: now },
    });

    res.json(updatedMeeting);
  } catch (err) {
    console.error('POST /meetings/:roomCode/end error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/meetings (host only)
 * Returns all meetings hosted by the current user.
 */
router.get('/', verifyFirebaseToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.uid } });
    if (!user) return res.status(403).json({ error: 'User not found' });

    const meetings = await prisma.meeting.findMany({
      where: { hostId: user.id },
      orderBy: { startedAt: 'desc' },
      include: {
        _count: { select: { attendances: true } },
      },
    });

    res.json(meetings);
  } catch (err) {
    console.error('GET /meetings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
