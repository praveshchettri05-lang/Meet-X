import { useEffect, useState, useCallback } from 'react';
import { playTone } from '../utils/tone';
import { getSocket } from '../lib/socket';

/**
 * Shown to ANY participant (including host) when they receive a ping.
 * Plays a tone, shows a visible banner, and registers a reaction on any user input.
 */
export default function PingAlert() {
  const [activePing, setActivePing] = useState(null); // { pingId, from, sentAt }
  const [reacted, setReacted] = useState(false);

  const handleReaction = useCallback((pingId) => {
    if (reacted) return;
    setReacted(true);

    const socket = getSocket();
    socket.emit('ping:react', { pingId });
    playTone('success');

    // Hide banner after 2 seconds
    setTimeout(() => setActivePing(null), 2000);
  }, [reacted]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('ping:receive', ({ pingId, from, sentAt }) => {
      setActivePing({ pingId, from, sentAt });
      setReacted(false);
      playTone('alarm');
    });

    return () => {
      socket.off('ping:receive');
    };
  }, []);

  // Register any key press or mouse move as a reaction
  useEffect(() => {
    if (!activePing || reacted) return;

    const handler = () => handleReaction(activePing.pingId);

    window.addEventListener('mousemove', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });

    return () => {
      window.removeEventListener('mousemove', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [activePing, reacted, handleReaction]);

  // Auto-dismiss after 12 seconds if no reaction
  useEffect(() => {
    if (!activePing) return;
    const timer = setTimeout(() => setActivePing(null), 12000);
    return () => clearTimeout(timer);
  }, [activePing]);

  if (!activePing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className={`bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center ping-alert border-4 ${
          reacted ? 'border-meet-green' : 'border-meet-yellow'
        }`}
      >
        {reacted ? (
          <>
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-xl font-bold text-meet-green mb-2">Great! You reacted.</h2>
            <p className="text-meet-gray text-sm">Your response has been noted.</p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3 animate-bounce">🔔</div>
            <h2 className="text-xl font-bold text-meet-dark mb-2">Attention Check!</h2>
            <p className="text-meet-gray mb-4">
              <strong>{activePing.from}</strong> is checking if you're paying attention.
            </p>
            <p className="text-sm text-meet-gray mb-6">
              Move your mouse, press any key, or tap the button below to confirm you're here.
            </p>
            <button
              onClick={() => handleReaction(activePing.pingId)}
              className="btn-primary w-full text-base py-3"
            >
              👋 I'm here!
            </button>
            <div className="mt-4 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-meet-yellow rounded-full"
                style={{
                  width: '100%',
                  animation: 'shrink-bar 10s linear forwards',
                }}
              />
            </div>
            <style>{`@keyframes shrink-bar { from { width: 100% } to { width: 0% } }`}</style>
            <p className="text-xs text-gray-400 mt-2">This alert will close in ~10 seconds</p>
          </>
        )}
      </div>
    </div>
  );
}
