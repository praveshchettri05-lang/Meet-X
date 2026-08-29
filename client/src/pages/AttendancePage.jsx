import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AttendanceDashboard from '../components/AttendanceDashboard';

export default function AttendancePage() {
  const { roomCode } = useParams();
  const { firebaseUser, dbUser, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-meet-light flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-meet-gray hover:text-meet-blue transition-colors flex items-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-lg font-semibold text-meet-dark">📹 MeetX</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-meet-gray">{dbUser?.name}</span>
          <button onClick={logout} className="text-sm text-meet-gray hover:text-meet-red transition-colors">
            Sign out
          </button>
        </div>
      </header>

      {/* Attendance Dashboard */}
      <div className="flex-1">
        <AttendanceDashboard
          roomCode={roomCode}
          firebaseUser={firebaseUser}
          isLive={false}
        />
      </div>
    </div>
  );
}
