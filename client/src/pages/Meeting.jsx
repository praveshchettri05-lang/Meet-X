import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { useAuth } from '../context/AuthContext';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import ParticipantPanel from '../components/ParticipantPanel';
import Chat from '../components/Chat';
import PingAlert from '../components/PingAlert';
import AttendanceDashboard from '../components/AttendanceDashboard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Meeting() {
  const { roomCode } = useParams();
  const { firebaseUser, dbUser } = useAuth();
  const navigate = useNavigate();

  const [livekitToken, setLivekitToken] = useState(null);
  const [livekitUrl, setLivekitUrl] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meeting, setMeeting] = useState(null);

  // Sidebar state
  const [sidebarTab, setSidebarTab] = useState(null); // null | 'participants' | 'chat' | 'attendance'

  // Socket participants list
  const [socketParticipants, setSocketParticipants] = useState([]);

  useEffect(() => {
    fetchToken();
  }, [roomCode]);

  async function fetchToken() {
    try {
      const token = await firebaseUser.getIdToken();

      // Fetch meeting details
      const meetingRes = await fetch(`${API_URL}/api/meetings/${roomCode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meetingRes.ok) throw new Error('Meeting not found');
      const meetingData = await meetingRes.json();
      setMeeting(meetingData);

      // Get LiveKit token
      const tokenRes = await fetch(`${API_URL}/api/livekit/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roomCode }),
      });
      if (!tokenRes.ok) throw new Error('Failed to get meeting token');
      const tokenData = await tokenRes.json();

      setLivekitToken(tokenData.token);
      setLivekitUrl(tokenData.livekitUrl);
      setIsHost(tokenData.isHost);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Connect Socket.io when token is ready
  useEffect(() => {
    if (!livekitToken || !dbUser) return;

    const socket = connectSocket();

    socket.emit('meeting:join', {
      userId: dbUser.id,
      roomCode,
      isHost,
    });

    socket.on('participants:list', (participants) => {
      setSocketParticipants(participants);
    });

    socket.on('participant:joined', (p) => {
      setSocketParticipants(prev => {
        if (prev.find(x => x.userId === p.userId)) return prev;
        return [...prev, p];
      });
    });

    socket.on('participant:left', ({ userId }) => {
      setSocketParticipants(prev => prev.filter(p => p.userId !== userId));
    });

    return () => {
      socket.off('participants:list');
      socket.off('participant:joined');
      socket.off('participant:left');
      disconnectSocket();
    };
  }, [livekitToken, dbUser, roomCode, isHost]);

  async function handleEndMeeting() {
    if (!confirm('End the meeting for everyone?')) return;
    try {
      const token = await firebaseUser.getIdToken();
      await fetch(`${API_URL}/api/meetings/${roomCode}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate(`/attendance/${roomCode}`);
    } catch (err) {
      console.error('Failed to end meeting:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-meet-dark flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg">Joining meeting…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-meet-dark flex items-center justify-center text-white">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-semibold mb-2">Cannot join meeting</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // ── Participants list for sidebar (merge socket data with LiveKit presence) ──
  const allParticipants = [
    // Add self
    {
      userId: dbUser?.id,
      name: dbUser?.name,
      rollNumber: dbUser?.rollNumber,
      isHost,
      socketId: 'self',
    },
    // Add others from socket
    ...socketParticipants.filter(p => p.userId !== dbUser?.id),
  ];

  return (
    <div className="h-screen bg-meet-dark flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-meet-dark border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold">📹 MeetX</span>
          <span className="text-gray-400 text-sm hidden sm:block">
            {meeting?.title || roomCode}
          </span>
          {/* Room code badge */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(roomCode);
              alert('Room code copied!');
            }}
            className="bg-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded-full hover:bg-gray-600 transition-colors"
            title="Click to copy room code"
          >
            {roomCode}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Sidebar toggle buttons */}
          {[
            { key: 'participants', icon: '👥', label: 'People', count: allParticipants.length },
            { key: 'chat', icon: '💬', label: 'Chat' },
            ...(isHost ? [{ key: 'attendance', icon: '📋', label: 'Attendance' }] : []),
          ].map(({ key, icon, label, count }) => (
            <button
              key={key}
              onClick={() => setSidebarTab(prev => prev === key ? null : key)}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition-colors ${
                sidebarTab === key
                  ? 'bg-meet-blue text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span>{icon}</span>
              <span className="hidden sm:inline">{label}</span>
              {count !== undefined && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                  sidebarTab === key ? 'bg-white/20' : 'bg-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}

          {/* End meeting (host only) */}
          {isHost && (
            <button
              onClick={handleEndMeeting}
              className="bg-meet-red text-white text-sm px-4 py-1.5 rounded-full hover:bg-red-600 transition-colors ml-2"
            >
              End Meeting
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* LiveKit Video Room */}
        <div className={`flex-1 overflow-hidden transition-all ${sidebarTab ? 'w-0 sm:flex-1' : 'flex-1'}`}>
          <LiveKitRoom
            token={livekitToken}
            serverUrl={livekitUrl}
            connect={true}
            video={true}
            audio={true}
            style={{ height: '100%' }}
          >
            <RoomAudioRenderer />
            <VideoConference />
          </LiveKitRoom>
        </div>

        {/* Sidebar */}
        {sidebarTab && (
          <div className="w-full sm:w-80 bg-white flex-shrink-0 border-l border-gray-200 overflow-hidden">
            {sidebarTab === 'participants' && (
              <ParticipantPanel
                isHost={isHost}
                roomCode={roomCode}
                participants={allParticipants}
                currentUserId={dbUser?.id}
              />
            )}
            {sidebarTab === 'chat' && (
              <Chat roomCode={roomCode} senderName={dbUser?.name} />
            )}
            {sidebarTab === 'attendance' && isHost && (
              <AttendanceDashboard
                roomCode={roomCode}
                firebaseUser={firebaseUser}
                isLive={true}
              />
            )}
          </div>
        )}
      </div>

      {/* Attentiveness ping alert (participant side) */}
      {!isHost && <PingAlert />}
    </div>
  );
}
