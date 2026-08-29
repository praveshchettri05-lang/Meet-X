const express = require('express');
const router = express.Router();
const { WebhookReceiver } = require('@livekit/livekit-server-sdk');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * POST /api/webhook/livekit
 * Receives LiveKit webhook events for participant join/leave.
 * LiveKit signs the request body — we must receive raw bytes to verify.
 */
router.post(
  '/livekit',
  // Parse body as raw Buffer BEFORE JSON middleware runs
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const receiver = new WebhookReceiver(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET
    );

    let event;
    try {
      // req.body is a Buffer here due to express.raw()
      const body = req.body instanceof Buffer ? req.body.toString('utf8') : req.body;
      event = await receiver.receive(body, req.headers['authorization']);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      // Still return 200 so LiveKit doesn't keep retrying with bad events
      return res.status(200).json({ received: false, error: 'Invalid signature' });
    }

    console.log(`📩 LiveKit webhook: ${event.event}`, event.participant?.identity);

    try {
      switch (event.event) {
        case 'participant_joined':
          await handleParticipantJoined(event);
          break;
        case 'participant_left':
          await handleParticipantLeft(event);
          break;
        case 'room_finished':
          await handleRoomFinished(event);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('Webhook handler error:', err);
    }

    res.status(200).json({ received: true });
  }
);

async function handleParticipantJoined(event) {
  const livekitRoom = event.room?.name;
  const participantIdentity = event.participant?.identity; // This is the user's DB ID
  if (!livekitRoom || !participantIdentity) return;

  const meeting = await prisma.meeting.findUnique({ where: { livekitRoom } });
  if (!meeting) return;

  const user = await prisma.user.findUnique({ where: { id: participantIdentity } });
  if (!user) return;

  await prisma.attendance.upsert({
    where: { meetingId_userId: { meetingId: meeting.id, userId: user.id } },
    create: {
      meetingId: meeting.id,
      userId: user.id,
      joinedAt: new Date(),
    },
    update: {
      leftAt: null, // Reset if reconnecting
    },
  });

  console.log(`✅ Attendance recorded: ${user.name} joined ${meeting.roomCode}`);
}

async function handleParticipantLeft(event) {
  const livekitRoom = event.room?.name;
  const participantIdentity = event.participant?.identity;
  if (!livekitRoom || !participantIdentity) return;

  const meeting = await prisma.meeting.findUnique({ where: { livekitRoom } });
  if (!meeting) return;

  const attendance = await prisma.attendance.findUnique({
    where: {
      meetingId_userId: { meetingId: meeting.id, userId: participantIdentity },
    },
  });

  if (!attendance) return;

  const now = new Date();
  const totalSecs = Math.floor((now - attendance.joinedAt) / 1000);
  const meetingEndTime = meeting.endedAt || now;
  const meetingDurationSecs = Math.max(1, Math.floor((meetingEndTime - meeting.startedAt) / 1000));
  const pct = Math.min(100, Math.round((totalSecs / meetingDurationSecs) * 100));

  await prisma.attendance.update({
    where: { id: attendance.id },
    data: { leftAt: now, totalSeconds: totalSecs, percentage: pct },
  });

  console.log(`📤 Attendance updated: ${participantIdentity} left ${meeting.roomCode} (${pct}%)`);
}

async function handleRoomFinished(event) {
  const livekitRoom = event.room?.name;
  if (!livekitRoom) return;

  const meeting = await prisma.meeting.findUnique({ where: { livekitRoom } });
  if (!meeting || meeting.endedAt) return;

  const now = new Date();
  await prisma.meeting.update({
    where: { livekitRoom },
    data: { endedAt: now },
  });

  console.log(`🏁 Meeting ended via webhook: ${meeting.roomCode}`);
}

module.exports = router;
