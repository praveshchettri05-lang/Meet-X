import { useState, useRef, useEffect } from 'react';
import { getSocket } from '../lib/socket';

/**
 * In-meeting text chat sidebar.
 *
 * @param {string} roomCode
 * @param {string} senderName - Current user's display name
 * @param {string} currentUserId - Current user's DB id (to identify own messages)
 */
export default function Chat({ roomCode, senderName, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mySocketId, setMySocketId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();

    // Store our own socket ID so we can identify our own messages
    setMySocketId(socket.id);
    socket.on('connect', () => setMySocketId(socket.id));

    socket.on('chat:message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.off('chat:message');
      socket.off('connect');
    };
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    if (!input.trim()) return;

    const socket = getSocket();
    socket.emit('chat:message', {
      roomCode,
      message: input.trim(),
      senderName,
      timestamp: Date.now(),
    });

    setInput('');
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  }

  return (
    <div className="sidebar-panel">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-meet-dark">In-Meeting Chat</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-meet-gray text-sm py-8">
            <div className="text-3xl mb-2">💬</div>
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg, i) => {
            // Identify own messages by socket ID (reliable), fall back to name
            const isMe = mySocketId
              ? msg.socketId === mySocketId
              : msg.senderName === senderName;

            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-xs font-medium text-meet-gray mb-0.5 px-1">
                    {msg.senderName}
                  </span>
                )}
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-meet-blue text-white rounded-br-none'
                    : 'bg-gray-100 text-meet-dark rounded-bl-none'
                }`}>
                  {msg.message}
                </div>
                <span className="text-xs text-gray-400 mt-0.5 px-1">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message…"
            className="input-field flex-1 !py-2 text-sm"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="btn-primary !py-2 !px-3 disabled:opacity-40"
            title="Send"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
