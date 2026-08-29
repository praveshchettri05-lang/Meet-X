import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function MyHistory() {
  const { firebaseUser, dbUser, logout } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchHistory() {
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(`${API_URL}/api/attendance/history/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load history');
        const data = await res.json();
        setRecords(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  }

  return (
    <div className="min-h-screen bg-meet-light flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-meet-gray hover:text-meet-blue transition-colors flex items-center gap-1 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-lg font-semibold text-meet-dark">📹 MeetX</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-meet-gray">{dbUser?.name} · {dbUser?.rollNumber}</span>
          <button onClick={logout} className="text-sm text-meet-gray hover:text-meet-red transition-colors">Sign out</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full p-6">
        <h1 className="text-2xl font-semibold text-meet-dark mb-6">My Attendance History</h1>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-meet-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="card text-center text-meet-red">{error}</div>
        ) : records.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-meet-gray">No meeting attendance recorded yet.</p>
            <button onClick={() => navigate('/')} className="btn-primary mt-4">Join a Meeting</button>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((r, i) => (
              <div key={i} className="card hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-meet-dark truncate">{r.meetingTitle}</h3>
                    <p className="text-sm text-meet-gray mt-0.5">
                      Hosted by <span className="text-meet-dark">{r.host}</span> · {formatDate(r.startedAt)}
                    </p>
                    <p className="text-xs text-meet-gray mt-1">
                      Joined: {formatTime(r.joinedAt)} 
                      {r.leftAt && ` · Left: ${formatTime(r.leftAt)}`}
                      · Duration: {r.totalMinutes} min
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-2xl font-bold ${
                      r.percentage >= 75 ? 'text-meet-green' :
                      r.percentage >= 50 ? 'text-yellow-500' : 'text-meet-red'
                    }`}>
                      {r.percentage}%
                    </div>
                    <div className="text-xs text-meet-gray">attendance</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      r.percentage >= 75 ? 'bg-meet-green' :
                      r.percentage >= 50 ? 'bg-yellow-400' : 'bg-meet-red'
                    }`}
                    style={{ width: `${r.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
