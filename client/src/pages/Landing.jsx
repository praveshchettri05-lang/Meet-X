import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Landing() {
  const { dbUser, firebaseUser, logout } = useAuth();
  const navigate = useNavigate();

  const [joinCode, setJoinCode] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  async function handleCreateMeeting() {
    setCreateLoading(true);
    setError('');
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`${API_URL}/api/meetings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: meetingTitle.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create meeting');
      }

      const meeting = await res.json();
      navigate(`/meeting/${meeting.roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleJoinMeeting(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setJoinLoading(true);
    setError('');
    try {
      const token = await firebaseUser.getIdToken();
      // Verify the room exists
      const res = await fetch(`${API_URL}/api/meetings/${joinCode.trim().toLowerCase()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Meeting not found');
      }

      navigate(`/meeting/${joinCode.trim().toLowerCase()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📹</span>
          <span className="text-xl font-semibold text-meet-dark">MeetX</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/history')}
            className="text-sm text-meet-gray hover:text-meet-blue transition-colors"
          >
            My Attendance
          </button>
          <div className="flex items-center gap-2">
            {firebaseUser?.photoURL && (
              <img
                src={firebaseUser.photoURL}
                alt="Avatar"
                className="w-8 h-8 rounded-full border border-gray-200"
              />
            )}
            <span className="text-sm font-medium text-meet-dark hidden sm:block">
              {dbUser?.name}
            </span>
          </div>
          <button
            onClick={logout}
            className="text-sm text-meet-gray hover:text-meet-red transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 px-6 py-12">
        {/* Left: CTA */}
        <div className="max-w-lg text-center lg:text-left">
          <h1 className="text-4xl lg:text-5xl font-bold text-meet-dark leading-tight mb-4">
            Video meetings for{' '}
            <span className="text-meet-blue">everyone</span>
          </h1>
          <p className="text-lg text-meet-gray mb-8">
            Connect, collaborate, and track attendance — all in one place.
            Perfect for online classrooms.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center justify-center gap-2 text-base"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              New Meeting
            </button>

            <form onSubmit={handleJoinMeeting} className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Enter room code"
                className="input-field flex-1 !py-2.5"
              />
              <button
                type="submit"
                disabled={!joinCode.trim() || joinLoading}
                className="btn-secondary whitespace-nowrap"
              >
                {joinLoading ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Right: Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md w-full">
          {[
            { icon: '🎥', title: 'HD Video', desc: 'Up to 80 participants with crystal clear video and audio' },
            { icon: '📋', title: 'Attendance', desc: 'Auto-tracks join/leave times with percentage attendance' },
            { icon: '🔔', title: 'Ping Check', desc: 'Host can ping students to verify they are attentive' },
            { icon: '📊', title: 'Reports', desc: 'Detailed CSV reports for gradebook integration' },
          ].map((f) => (
            <div key={f.title} className="card hover:shadow-lg transition-shadow duration-200">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-meet-dark mb-1">{f.title}</h3>
              <p className="text-sm text-meet-gray">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Create Meeting Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-semibold mb-4">Create a New Meeting</h2>
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="Meeting title (optional)"
              className="input-field mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateMeeting()}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowCreate(false); setMeetingTitle(''); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateMeeting}
                disabled={createLoading}
                className="btn-primary"
              >
                {createLoading ? 'Creating…' : 'Start Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
