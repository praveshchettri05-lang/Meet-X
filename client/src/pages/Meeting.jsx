import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useLocalParticipant,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { useAuth } from '../context/AuthContext';
import { connectSocket, disconnectSocket } from '../lib/socket';
import ParticipantPanel from '../components/ParticipantPanel';
import Chat from '../components/Chat';
import PingAlert from '../components/PingAlert';
import AttendanceDashboard from '../components/AttendanceDashboard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Inner component that has access to LiveKit Room context ──────────────────
function MeetingRoom({ roomCode, isHost, meeting, dbUser, firebaseUser, onEndMeeting }) {
  const { localParticipant } = useLocalParticipant();

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sidebarTab, setSidebarTab] = useState(null);
  const [socketParticipants, setSocketParticipants] = useState([]);

  // Toggle microphone
  const toggleMic = useCallback(async () => {
    if (!localParticipant) return;
    await localParticipant.setMicrophoneEnabled(!micOn);
    setMicOn(prev => !prev);
  }, [localParticipant, micOn]);

  // Toggle camera
  const toggleCam = useCallback(async () => {
    if (!localParticipant) return;
    await localParticipant.setCameraEnabled(!camOn);
    setCamOn(prev => !prev);
  }, [localParticipant, camOn]);

  // Connect Socket.io
  useEffect(() => {
    if (!dbUser) return;

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
  }, [dbUser, roomCode, isHost]);

  const allParticipants = [
    {
      userId: dbUser?.id,
      name: dbUser?.name,
      rollNumber: dbUser?.rollNumber,
      isHost,
      socketId: 'self',
    },
    ...socketParticipants.filter(p => p.userId !== dbUser?.id),
  ];

  return (
    <div className="h-screen bg-meet-dark flex flex-col overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1f1f1f] border-b border-gray-800 flex-shrink-0">
        {/* Left: Logo + room code */}
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">📹 MeetX</span>
          <span className="text-gray-400 text-xs hidden sm:block">{meeting?.title}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(roomCode); alert('Room code copied!'); }}
            className="bg-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded-full hover:bg-gray-600 transition-colors"
            title="Click to copy room code"
          >
            {roomCode}
          </button>
        </div>

        {/* Centre: Mic + Camera controls */}
        <div className="flex items-center gap-2">
          {/* Microphone toggle */}
          <button
            onClick={toggleMic}
            title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            className={`flex flex-col items-center justify-center w-10 h-10 rounded-full transition-all ${
              micOn
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {micOn ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
              </svg>
            )}
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleCam}
            title={camOn ? 'Turn off camera' : 'Turn on camera'}
            className={`flex flex-col items-center justify-center w-10 h-10 rounded-full transition-all ${
              camOn
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {camOn ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
              </svg>
            )}
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-700 mx-1" />

          {/* Sidebar tabs */}
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
          {isHost ? (
            <button
              onClick={onEndMeeting}
              className="bg-red-600 text-white text-sm px-4 py-1.5 rounded-full hover:bg-red-500 transition-colors ml-1"
            >
              End
            </button>
          ) : (
            <button
              onClick={onEndMeeting}
              className="bg-gray-700 text-white text-sm px-4 py-1.5 rounded-full hover:bg-gray-600 transition-colors ml-1"
            >
              Leave
            </button>
          )}
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LiveKit Video Grid */}
        <div className="flex-1 overflow-hidden">
          <VideoConference />
        </div>

        {/* Sidebar */}
        {sidebarTab && (
          <div className="w-full sm:w-80 bg-white flex-shrink-0 border-l border-gray-200 overflow-hidden flex flex-col">
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

      {/* Ping alert overlay (participant only) */}
      {!isHost && <PingAlert />}
    </div>
  );
}

// ── Outer component — fetches token, then mounts LiveKitRoom ─────────────────
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

  useEffect(() => {
    fetchToken();
  }, [roomCode]);

  async function fetchToken() {
    try {
      const token = await firebaseUser.getIdToken();

      const meetingRes = await fetch(`${API_URL}/api/meetings/${roomCode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meetingRes.ok) throw new Error('Meeting not found. Check the room code.');
      const meetingData = await meetingRes.json();
      setMeeting(meetingData);

      const tokenRes = await fetch(`${API_URL}/api/livekit/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roomCode }),
      });
      if (!tokenRes.ok) {
        const d = await tokenRes.json();
        throw new Error(d.error || 'Failed to get meeting token');
      }
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

  async function handleEndOrLeave() {
    const msg = isHost ? 'End the meeting for everyone?' : 'Leave the meeting?';
    if (!confirm(msg)) return;

    if (isHost) {
      try {
        const token = await firebaseUser.getIdToken();
        await fetch(`${API_URL}/api/meetings/${roomCode}/end`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        navigate(`/attendance/${roomCode}`);
      } catch (err) {
        console.error('End meeting error:', err);
        navigate('/');
      }
    } else {
      navigate('/');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1f1f1f] flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg">Joining meeting…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1f1f1f] flex items-center justify-center text-white">
        <div className="text-center max-w-md px-6">
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

  return (
    <LiveKitRoom
      token={livekitToken}
      serverUrl={livekitUrl}
      connect={true}
      video={true}
      audio={true}
      style={{ height: '100vh' }}
    >
      <RoomAudioRenderer />
      <MeetingRoom
        roomCode={roomCode}
        isHost={isHost}
        meeting={meeting}
        dbUser={dbUser}
        firebaseUser={firebaseUser}
        onEndMeeting={handleEndOrLeave}
      />
    </LiveKitRoom>
  );
}
