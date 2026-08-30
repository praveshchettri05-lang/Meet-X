import { useState, useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { playTone } from '../utils/tone';

/**
 * Sidebar panel showing all meeting participants.
 * Host view: shows "Ping" buttons and ping results next to each participant.
 * Participant view: shows read-only list.
 *
 * @param {object} props
 * @param {boolean} props.isHost
 * @param {string} props.roomCode
 * @param {Array}  props.participants - [{ userId, name, rollNumber, socketId, isHost }]
 * @param {string} props.currentUserId
 */
export default function ParticipantPanel({ isHost, roomCode, participants, currentUserId }) {
  const [pingResults, setPingResults] = useState({}); // { userId: { reacted, pending, time } }

  useEffect(() => {
    const socket = getSocket();

    socket.on('ping:result', ({ targetUserId, reacted, reactionTimeMs }) => {
      setPingResults(prev => ({
        ...prev,
        [targetUserId]: { reacted, pending: false, time: reactionTimeMs },
      }));
      // Play feedback tone for host
      playTone(reacted ? 'success' : 'ping');
      // Clear result after 8 seconds
      setTimeout(() => {
        setPingResults(prev => {
          const next = { ...prev };
          delete next[targetUserId];
          return next;
        });
      }, 8000);
    });

    return () => socket.off('ping:result');
  }, []);

  function sendPing(targetUserId) {
    const socket = getSocket();
    const pingId = `ping-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setPingResults(prev => ({
      ...prev,
      [targetUserId]: { pending: true, reacted: null, time: null },
    }));

    socket.emit('ping:send', { targetUserId, roomCode, pingId });
  }

  return (
    <div className="sidebar-panel">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-meet-dark">Participants</h3>
        <span className="text-sm text-meet-gray bg-gray-100 px-2 py-0.5 rounded-full">
          {participants.length}
        </span>
      </div>

      {/* Participant list */}
      <div className="flex-1 overflow-y-auto p-2">
        {participants.length === 0 ? (
          <p className="text-center text-meet-gray text-sm py-8">No participants yet</p>
        ) : (
          <ul className="space-y-1">
            {participants.map((p) => {
              const ping = pingResults[p.userId];
              const isMe = p.userId === currentUserId;

              return (
                <li
                  key={p.userId || p.socketId}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
                    p.isHost ? 'bg-meet-blue' : 'bg-meet-gray'
                  }`}>
                    {p.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-meet-dark truncate">
                      {p.name} {isMe && <span className="text-xs text-meet-gray">(you)</span>}
                    </p>
                    <p className="text-xs text-meet-gray truncate">
                      {p.rollNumber} {p.isHost && '· Host'}
                    </p>
                  </div>

                  {/* Ping button (host only, not for self, not for other hosts) */}
                  {isHost && !isMe && !p.isHost && (
                    <div className="flex-shrink-0">
                      {ping?.pending ? (
                        <span className="text-xs text-meet-gray flex items-center gap-1">
                          <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                          Pinging…
                        </span>
                      ) : ping?.reacted === true ? (
                        <span className="text-xs text-meet-green font-medium flex items-center gap-1">
                          ✅ Reacted
                          {ping.time && (
                            <span className="text-gray-400">({Math.round(ping.time / 1000)}s)</span>
                          )}
                        </span>
                      ) : ping?.reacted === false ? (
                        <span className="text-xs text-meet-red font-medium">❌ No reaction</span>
                      ) : (
                        <button
                          onClick={() => sendPing(p.userId)}
                          title="Send an attention ping"
                          className="text-xs bg-meet-yellow/20 hover:bg-meet-yellow/40 text-yellow-700 
                                     font-medium px-2.5 py-1 rounded-full transition-colors flex items-center gap-1"
                        >
                          🔔 Ping
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
