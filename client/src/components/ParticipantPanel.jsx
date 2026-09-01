import { useState, useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { playTone } from '../utils/tone';

/**
 * Sidebar panel showing all meeting participants.
 * Host view: shows "Ping" buttons (host→participant only).
 * All users: can Pin/Unpin any participant to spotlight them.
 *
 * @param {object} props
 * @param {boolean} props.isHost
 * @param {string} props.roomCode
 * @param {Array}  props.participants - [{ userId, name, rollNumber, socketId, isHost }]
 * @param {string} props.currentUserId
 * @param {string|null} props.pinnedUserId - currently pinned participant userId
 * @param {function} props.onPinToggle - (userId) => void
 */
export default function ParticipantPanel({
  isHost,
  roomCode,
  participants,
  currentUserId,
  pinnedUserId,
  onPinToggle,
}) {
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
    // FIX: Use min-h-0 so this flex child can shrink below its content height and enable inner scroll
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-meet-dark">Participants</h3>
        <span className="text-sm text-meet-gray bg-gray-100 px-2 py-0.5 rounded-full">
          {participants.length}
        </span>
      </div>

      {/* Pin hint */}
      {pinnedUserId && (
        <div className="mx-3 mt-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-1.5 flex-shrink-0">
          📌 One participant is pinned. Click 📌 again to unpin.
        </div>
      )}

      {/* Participant list — flex-1 + overflow-y-auto enables scrolling */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {participants.length === 0 ? (
          <p className="text-center text-meet-gray text-sm py-8">No participants yet</p>
        ) : (
          <ul className="space-y-1">
            {participants.map((p) => {
              const ping = pingResults[p.userId];
              const isMe = p.userId === currentUserId;
              const isPinned = p.userId === pinnedUserId;

              return (
                <li
                  key={p.userId || p.socketId}
                  className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                    isPinned ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                      p.isHost ? 'bg-meet-blue' : 'bg-meet-gray'
                    }`}>
                      {p.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    {/* Online indicator */}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-white rounded-full" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-meet-dark truncate flex items-center gap-1">
                      {p.isHost && <span title="Host">👑</span>}
                      {p.name}
                      {isMe && <span className="text-xs text-meet-gray font-normal">(you)</span>}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Pin/Unpin button — available to ALL users for any participant (not self) */}
                    {!isMe && (
                      <button
                        onClick={() => onPinToggle(p.userId)}
                        title={isPinned ? 'Unpin' : 'Pin to spotlight'}
                        className={`text-xs px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                          isPinned
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        📌
                      </button>
                    )}

                    {/* Ping button — HOST only, not for self, not for other hosts */}
                    {isHost && !isMe && !p.isHost && (
                      <div>
                        {ping?.pending ? (
                          <span className="text-xs text-meet-gray flex items-center gap-1">
                            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                            Pinging…
                          </span>
                        ) : ping?.reacted === true ? (
                          <span className="text-xs text-meet-green font-medium flex items-center gap-1">
                            ✅
                            {ping.time && (
                              <span className="text-gray-400">({Math.round(ping.time / 1000)}s)</span>
                            )}
                          </span>
                        ) : ping?.reacted === false ? (
                          <span className="text-xs text-meet-red font-medium">❌</span>
                        ) : (
                          <button
                            onClick={() => sendPing(p.userId)}
                            title="Send an attention ping"
                            className="text-xs bg-meet-yellow/20 hover:bg-meet-yellow/40 text-yellow-700
                                       font-medium px-2 py-1 rounded-full transition-colors flex items-center gap-1"
                          >
                            🔔
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
