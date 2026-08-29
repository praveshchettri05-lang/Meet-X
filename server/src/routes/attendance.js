const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { verifyFirebaseToken } = require('../middleware/auth');

const prisma = new PrismaClient();

/**
 * GET /api/attendance/history/mine
 * Returns current user's attendance history across all meetings.
 * IMPORTANT: This MUST be defined BEFORE /:roomCode or Express will
 * match "history" as a roomCode parameter.
 */
router.get('/history/mine', verifyFirebaseToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.uid } });
    if (!user) return res.status(403).json({ error: 'User not found' });

    const records = await prisma.attendance.findMany({
      where: { userId: user.id },
      include: { meeting: { include: { host: true } } },
      orderBy: { joinedAt: 'desc' },
    });

    res.json(records.map(att => ({
      meetingTitle: att.meeting.title,
      roomCode: att.meeting.roomCode,
      host: att.meeting.host.name,
      startedAt: att.meeting.startedAt,
      joinedAt: att.joinedAt,
      leftAt: att.leftAt,
      totalMinutes: Math.round(att.totalSeconds / 60),
      percentage: Math.round(att.percentage),
    })));
  } catch (err) {
    console.error('GET /attendance/history/mine error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/attendance/:roomCode
 * Returns full attendance report for a meeting.
 * Both host and participants can view.
 */
router.get('/:roomCode', verifyFirebaseToken, async (req, res) => {
  const { roomCode } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { firebaseUid: req.user.uid } });
    if (!user) return res.status(403).json({ error: 'User not found' });

    const meeting = await prisma.meeting.findUnique({
      where: { roomCode },
      include: {
        attendances: {
          include: { user: true },
          orderBy: { joinedAt: 'asc' },
        },
        host: true,
      },
    });

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const records = meeting.attendances.map((att) => {
      const totalMins = Math.round(att.totalSeconds / 60);
      let status = 'poor';
      if (att.percentage >= 75) status = 'good';
      else if (att.percentage >= 50) status = 'partial';

      return {
        userId: att.userId,
        name: att.user.name,
        rollNumber: att.user.rollNumber,
        email: att.user.email,
        joinedAt: att.joinedAt,
        leftAt: att.leftAt,
        totalMinutes: totalMins,
        totalSeconds: att.totalSeconds,
        percentage: Math.round(att.percentage),
        status,
        pingsSent: att.pingsSent,
        pingsReacted: att.pingsReacted,
        attentivenessRate: att.pingsSent > 0
          ? Math.round((att.pingsReacted / att.pingsSent) * 100)
          : null,
      };
    });

    // Meeting duration stats
    const meetingEndTime = meeting.endedAt || new Date();
    const meetingDurationSecs = Math.floor((meetingEndTime - meeting.startedAt) / 1000);
    const meetingDurationMins = Math.round(meetingDurationSecs / 60);

    res.json({
      meeting: {
        id: meeting.id,
        roomCode: meeting.roomCode,
        title: meeting.title,
        host: meeting.host.name,
        startedAt: meeting.startedAt,
        endedAt: meeting.endedAt,
        durationMinutes: meetingDurationMins,
        isOngoing: !meeting.endedAt,
      },
      attendance: records,
      summary: {
        total: records.length,
        good: records.filter(r => r.status === 'good').length,
        partial: records.filter(r => r.status === 'partial').length,
        poor: records.filter(r => r.status === 'poor').length,
        averagePercentage: records.length > 0
          ? Math.round(records.reduce((sum, r) => sum + r.percentage, 0) / records.length)
          : 0,
      },
    });
  } catch (err) {
    console.error('GET /attendance/:roomCode error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
