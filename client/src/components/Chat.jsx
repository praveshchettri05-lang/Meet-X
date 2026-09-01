import { useState, useRef, useEffect } from 'react';
import { connectSocket, getSocket } from '../lib/socket';

/**
 * In-meeting text chat sidebar.
 *
 * @param {string} roomCode
 * @param {string} senderName - Current user display name
 * @param {string} currentUserId - Current user DB id
 */
export default function Chat({ roomCode, senderName, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const pendingQueue = useRef([]);

  useEffect(() => {
    const socket = connectSocket();

    const onConnect = () => {
      setSocketConnected(true);
      // Flush queued messages
      while (pendingQueue.current.length > 0) {
        const msg = pendingQueue.current.shift();
        socket.emit('chat:message', msg);
      }
    };

    const onDisconnect = () => setSocketConnected(false);

    if (socket.connected) {
      setSocketConnected(true);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Server now sends chat:message only to OTHER participants (not back to sender),
    // so every message received here is from someone else.
    socket.on('chat:message', (msg) => {
      setMessages(prev => [...prev, { ...msg, _isMe: false }]);
    });

    return () => {
      socket.off('chat:message');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const clientMsgId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = { roomCode, message: trimmed, senderName, timestamp: Date.now(), clientMsgId };

    const socket = getSocket();

    // Optimistically add the message as "mine" immediately
    setMessages(prev => [...prev, { ...payload, _isMe: true }]);

    if (socket?.connected) {
      socket.emit('chat:message', payload);
    } else {
      pendingQueue.current.push(payload);
    }

    setInput('');
    inputRef.current?.focus();
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {!socketConnected && (
        <div className="mx-3 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
          Connection lost. Messages will be sent when reconnected.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            <div className="text-3xl mb-2">💬</div>
            <p>No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg._isMe;

            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-xs font-medium text-gray-500 mb-0.5 px-1">{msg.senderName}</span>
                )}
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                  isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'
                }`}>
                  {msg.message}
                </div>
                <span className="text-xs text-gray-400 mt-0.5 px-1">{formatTime(msg.timestamp)}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-gray-200 flex-shrink-0">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={socketConnected ? 'Send a message...' : 'Reconnecting...'}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
            maxLength={500}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!input.trim() || !socketConnected}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
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
