const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { verifyFirebaseToken } = require('../middleware/auth');

const prisma = new PrismaClient();

/**
 * GET /api/auth/me
 * Returns the current user's profile (if it exists in DB).
 */
router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.user.uid },
    });

    if (!user) {
      // User authenticated with Firebase but hasn't set up profile yet
      return res.status(404).json({ needsProfile: true });
    }

    res.json(user);
  } catch (err) {
    console.error('GET /auth/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/profile
 * Creates or updates user profile with name and roll number.
 * Called after first Google Sign-in.
 * Body: { name: string, rollNumber: string }
 */
router.post('/profile', verifyFirebaseToken, async (req, res) => {
  const { name, rollNumber } = req.body;

  if (!name || !rollNumber) {
    return res.status(400).json({ error: 'name and rollNumber are required' });
  }

  try {
    const user = await prisma.user.upsert({
      where: { firebaseUid: req.user.uid },
      update: { name, rollNumber },
      create: {
        firebaseUid: req.user.uid,
        email: req.user.email,
        name,
        rollNumber,
      },
    });

    res.json(user);
  } catch (err) {
    console.error('POST /auth/profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
