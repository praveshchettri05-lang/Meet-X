import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  ParticipantTile,
  useParticipants,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { useAuth } from '../context/AuthContext';
import { connectSocket, disconnectSocket } from '../lib/socket';
import ParticipantPanel from '../components/ParticipantPanel';
import Chat from '../components/Chat';
import PingAlert from '../components/PingAlert';
import AttendanceDashboard from '../components/AttendanceDashboard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────────────────
// Google-Meet-style layout:
//   [top thumbnail strip]
//   [main large video]
//   [bottom control bar]
// ─────────────────────────────────────────────────────────────────────────────
﻿function VideoLayout({ pinnedTrackId, onPinToggle }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera,      withPlaceholder: true  },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const getTrackId = (t) => `${t.participant?.identity}-${t.source}`;

  const pinnedTrack = pinnedTrackId
    ? tracks.find(t => getTrackId(t) === pinnedTrackId)
    : null;

  // If there's a screen share, default to showing it if nothing is pinned
  const defaultMainTrack = tracks.find(t => t.source === Track.Source.ScreenShare) ?? tracks[0] ?? null;
  const mainTrack = pinnedTrack ?? defaultMainTrack;
  const stripTracks = tracks.filter(t => t !== mainTrack);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">

      {stripTracks.length > 0 && (
        <div
          className="flex-shrink-0 flex gap-2 px-3 py-2 overflow-x-auto bg-[#181818]"
          style={{ height: '120px' }}
        >
          {stripTracks.map(t => {
            const id    = getTrackId(t);
            const isPin = id === pinnedTrackId;
            return (
              <div
                key={id}
                className={`relative flex-shrink-0 rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${isPin ? 'border-blue-500' : 'border-transparent hover:border-gray-500'}`}
                style={{ width: '150px', height: '96px' }}
                onClick={() => onPinToggle(id)}
              >
                <ParticipantTile trackRef={t} className="w-full h-full" />
                {isPin && (
                  <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-0.5">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                    </svg>
                  </div>
                )}
                {t.source === Track.Source.ScreenShare && (
                  <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    Screen
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1 min-h-0 p-2 overflow-hidden">
        {mainTrack ? (
          <div className="w-full h-full rounded-2xl overflow-hidden relative">
            <ParticipantTile trackRef={mainTrack} className="w-full h-full" />
            {pinnedTrack && (
              <button
                onClick={() => onPinToggle(null)}
                className="absolute top-3 right-3 bg-black/50 text-blue-300 hover:text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm"
              >
                Unpin
              </button>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-5xl mb-3">📹</div>
              <p className="text-sm">Waiting for participants...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingRoom({ roomCode, isHost, meeting, dbUser, firebaseUser, onEndMeeting }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();

  const [sidebarTab,       setSidebarTab]       = useState(null);
  const [socketParticipants, setSocketParticipants] = useState([]);
  const [unreadCount,      setUnreadCount]      = useState(0);
  const [socketConnected,  setSocketConnected]  = useState(false);
  const [isFullscreen,     setIsFullscreen]     = useState(false);
  const [pinnedIdentity,   setPinnedIdentity]   = useState(null); // LiveKit identity string
  const [pinnedUserId,     setPinnedUserId]     = useState(null); // DB userId (for panel)
  const [micError,         setMicError]         = useState(null);
  const [currentTime,      setCurrentTime]      = useState(new Date());
  const rootRef = useRef(null);
  // Keep a ref to socketParticipants so pin handlers don't capture stale state
  const socketParticipantsRef = useRef([]);
  useEffect(() => { socketParticipantsRef.current = socketParticipants; }, [socketParticipants]);

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  // ── Auto-enable mic on join ──────────────────────────────────────────────
  useEffect(() => {
    if (!localParticipant) return;
    localParticipant.setMicrophoneEnabled(true).catch(err => {
      console.warn('Mic auto-enable failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Microphone permission denied. Please allow mic access in your browser.');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant?.identity]);

  // ── Controls ─────────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    if (!localParticipant) return;
    setMicError(null);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err) {
      if (err.name === 'NotAllowedError') setMicError('Microphone permission denied.');
    }
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleCam = useCallback(async () => {
    if (!localParticipant) return;
    try { await localParticipant.setCameraEnabled(!isCameraEnabled); }
    catch (err) { console.error('Camera toggle error:', err); }
  }, [localParticipant, isCameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (!localParticipant) return;
    try { await localParticipant.setScreenShareEnabled(!isScreenShareEnabled); }
    catch (err) { console.error('Screen share toggle error:', err); }
  }, [localParticipant, isScreenShareEnabled]);

  // ── Fullscreen ───────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen().catch(console.warn);
    } else {
      document.exitFullscreen().catch(console.warn);
    }
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // ── Socket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dbUser) return;
    const socket = connectSocket();

    if (socket.connected) setSocketConnected(true);
    const onConn = () => setSocketConnected(true);
    const onDisc = () => setSocketConnected(false);
    socket.on('connect', onConn);
    socket.on('disconnect', onDisc);

    socket.emit('meeting:join', { userId: dbUser.id, name: dbUser.name, roomCode, isHost });

    socket.on('participants:list', setSocketParticipants);
    socket.on('participant:joined', (p) => {
      setSocketParticipants(prev =>
        prev.find(x => x.userId === p.userId) ? prev : [...prev, p]
      );
    });
    socket.on('participant:left', ({ userId }) => {
      setSocketParticipants(prev => prev.filter(p => p.userId !== userId));
    });
    socket.on('chat:message', () => {
      if (sidebarTab !== 'chat') setUnreadCount(c => c + 1);
    });

    return () => {
      socket.off('connect', onConn);
      socket.off('disconnect', onDisc);
      socket.off('participants:list');
      socket.off('participant:joined');
      socket.off('participant:left');
      socket.off('chat:message');
      disconnectSocket();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUser, roomCode, isHost]);

  useEffect(() => {
    if (sidebarTab === 'chat') setUnreadCount(0);
  }, [sidebarTab]);

  // ── Pin toggle ───────────────────────────────────────────────────────────
  // Called from thumbnail strip (trackId) or from ParticipantPanel (userId)
  function handlePinByTrackId(trackId) {
    if (!trackId) {
      // Explicit unpin
      setPinnedIdentity(null);
      setPinnedUserId(null);
      return;
    }
    setPinnedIdentity(prev => {
      if (prev === trackId) {
        setPinnedUserId(null);
        return null;
      }
      // Extract userId from trackId (which is "userId-source")
      const extractedUserId = trackId.split('-')[0];
      setPinnedUserId(extractedUserId);
      return trackId;
    });
  }

  function handlePinByUserId(userId) {
    // If pinned from sidebar, pin their camera track by default
    handlePinByTrackId(`${userId}-camera`);
  }


  // ── Participants list ────────────────────────────────────────────────────
  const allParticipants = [
    { userId: dbUser?.id, name: dbUser?.name, rollNumber: dbUser?.rollNumber, isHost, socketId: 'self' },
    ...socketParticipants.filter(p => p.userId !== dbUser?.id),
  ];

  const timeStr = currentTime.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  return (
    <div ref={rootRef} className="h-screen bg-[#1e1e1e] flex flex-col overflow-hidden select-none">

      {/* ── Mic error banner ──────────────────────────────────────────────── */}
      {micError && (
        <div className="bg-red-700 text-white text-xs px-4 py-2 flex items-center justify-between flex-shrink-0 z-30">
          <span>🎤 {micError}</span>
          <button onClick={() => setMicError(null)} className="ml-4 hover:opacity-70 text-lg leading-none">✕</button>
        </div>
      )}

      {/* ── Slim info bar (top) ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2 flex-shrink-0 z-10">
        {/* Left: time + room code */}
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-medium">{timeStr}</span>
          <span className="text-gray-500 text-xs">|</span>
          <button
            onClick={() => { navigator.clipboard.writeText(roomCode); }}
            className="flex items-center gap-1.5 text-gray-300 text-xs hover:text-white transition-colors group"
            title="Click to copy room code"
          >
            <span className="font-mono bg-gray-800 px-2 py-0.5 rounded">{roomCode}</span>
            <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          {meeting?.title && (
            <span className="text-gray-500 text-xs truncate max-w-[140px] hidden sm:block">{meeting.title}</span>
          )}
        </div>

        {/* Right: connection dot + fullscreen */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`}
            title={socketConnected ? 'Connected' : 'Reconnecting…'}
          />
          <button
            onClick={toggleFullscreen}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Main area (video + sidebar) ───────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Video layout */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <VideoLayout
            pinnedTrackId={pinnedIdentity}
            onPinToggle={handlePinByTrackId}
          />
        </div>

        {/* Sidebar panel */}
        {sidebarTab && (
          <div className="w-full sm:w-80 bg-[#2d2d2d] flex-shrink-0 border-l border-gray-700 overflow-hidden flex flex-col sidebar-slide-in">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <span className="text-white font-semibold text-sm">
                {sidebarTab === 'participants' && '👥 People'}
                {sidebarTab === 'chat' && '💬 Chat'}
                {sidebarTab === 'attendance' && '📋 Attendance'}
              </span>
              <button
                onClick={() => setSidebarTab(null)}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              {sidebarTab === 'participants' && (
                <ParticipantPanel
                  isHost={isHost}
                  roomCode={roomCode}
                  participants={allParticipants}
                  currentUserId={dbUser?.id}
                  pinnedUserId={pinnedUserId}
                  onPinToggle={handlePinByUserId}
                />
              )}
              {sidebarTab === 'chat' && (
                <Chat roomCode={roomCode} senderName={dbUser?.name} currentUserId={dbUser?.id} />
              )}
              {sidebarTab === 'attendance' && isHost && (
                <AttendanceDashboard roomCode={roomCode} firebaseUser={firebaseUser} isLive />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom control bar (Google Meet style) ───────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-3 bg-[#1e1e1e] border-t border-gray-800">

        {/* Mic */}
        <ControlBtn
          onClick={toggleMic}
          active={isMicrophoneEnabled}
          danger={!isMicrophoneEnabled}
          title={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        >
          {isMicrophoneEnabled ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27 6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
            </svg>
          )}
        </ControlBtn>

        {/* Camera */}
        <ControlBtn
          onClick={toggleCam}
          active={isCameraEnabled}
          danger={!isCameraEnabled}
          title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraEnabled ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
            </svg>
          )}
        </ControlBtn>

        {/* Screen Share */}
        <ControlBtn
          onClick={toggleScreenShare}
          active={isScreenShareEnabled}
          title={isScreenShareEnabled ? 'Stop presenting' : 'Present now'}
        >
          {isScreenShareEnabled ? (
            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zm-4-4l-4-4v3H7v2h6v3l4-4z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zm-9-9.11V7l4 4-4 4v-2.89H7v-2.22h5z"/>
            </svg>
          )}
        </ControlBtn>

        <div className="w-px h-8 bg-gray-700 mx-1" />

        {/* People */}
        <SidebarBtn
          label="People"
          active={sidebarTab === 'participants'}
          badge={allParticipants.length}
          onClick={() => setSidebarTab(p => p === 'participants' ? null : 'participants')}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
        </SidebarBtn>

        {/* Chat */}
        <SidebarBtn
          label="Chat"
          active={sidebarTab === 'chat'}
          badge={unreadCount > 0 ? unreadCount : 0}
          badgeDanger
          onClick={() => setSidebarTab(p => p === 'chat' ? null : 'chat')}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
        </SidebarBtn>

        {/* Attendance (host only) */}
        {isHost && (
          <SidebarBtn
            label="Attendance"
            active={sidebarTab === 'attendance'}
            onClick={() => setSidebarTab(p => p === 'attendance' ? null : 'attendance')}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
            </svg>
          </SidebarBtn>
        )}

        <div className="w-px h-8 bg-gray-700 mx-1" />

        {/* End / Leave */}
        <button
          onClick={onEndMeeting}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm transition-all ${
            isHost
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
          {isHost ? 'End' : 'Leave'}
        </button>
      </div>

      {/* Ping alert (all users) */}
      <PingAlert />

      {/* Audio renderer */}
      <RoomAudioRenderer />
    </div>
  );
}

// ── Reusable bottom-bar button ────────────────────────────────────────────────
function ControlBtn({ onClick, active, danger, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150 ${
        danger
          ? 'bg-red-600 hover:bg-red-500 text-white'
          : active
          ? 'bg-blue-600 hover:bg-blue-500 text-white'
          : 'bg-gray-700 hover:bg-gray-600 text-white'
      }`}
    >
      {children}
    </button>
  );
}

function SidebarBtn({ onClick, active, label, badge, badgeDanger, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150 ${
        active ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'
      }`}
    >
      {children}
      {badge > 0 && (
        <span className={`absolute -top-1 -right-1 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
          badgeDanger ? 'bg-red-500 text-white' : 'bg-blue-400 text-white'
        }`}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Outer: fetches token, renders LiveKitRoom
// ─────────────────────────────────────────────────────────────────────────────
export default function Meeting() {
  const { roomCode } = useParams();
  const { firebaseUser, dbUser } = useAuth();
  const navigate = useNavigate();

  const [livekitToken, setLivekitToken] = useState(null);
  const [livekitUrl,   setLivekitUrl]   = useState(null);
  const [isHost,       setIsHost]       = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [meeting,      setMeeting]      = useState(null);

  useEffect(() => { fetchToken(); }, [roomCode]);

  async function fetchToken() {
    try {
      const token = await firebaseUser.getIdToken();
      const [meetingRes, tokenRes] = await Promise.all([
        fetch(`${API_URL}/api/meetings/${roomCode}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/livekit/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ roomCode }),
        }),
      ]);

      if (!meetingRes.ok) { const d = await meetingRes.json(); throw new Error(d.error || 'Meeting not found.'); }
      if (!tokenRes.ok)   { const d = await tokenRes.json();   throw new Error(d.error || 'Failed to get token.'); }

      const [meetingData, tokenData] = await Promise.all([meetingRes.json(), tokenRes.json()]);
      setMeeting(meetingData);
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
      } catch { navigate('/'); }
    } else {
      navigate('/');
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-lg">Joining meeting…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">
      <div className="text-center max-w-md px-6">
        <div className="text-5xl mb-4">❌</div>
        <h2 className="text-xl font-semibold mb-2">Cannot join meeting</h2>
        <p className="text-gray-300 mb-6">{error}</p>
        <button onClick={() => navigate('/')} className="btn-primary">Go Home</button>
      </div>
    </div>
  );

  return (
    <LiveKitRoom
      token={livekitToken}
      serverUrl={livekitUrl}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={() => navigate('/')}
      style={{ height: '100vh' }}
    >
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

