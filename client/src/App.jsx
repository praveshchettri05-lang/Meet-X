import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import ProfileSetup from './pages/ProfileSetup';
import Meeting from './pages/Meeting';
import AttendancePage from './pages/AttendancePage';
import MyHistory from './pages/MyHistory';

// Redirect unauthenticated users to login
function ProtectedRoute({ children }) {
  const { firebaseUser, dbUser, needsProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-meet-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-meet-gray font-medium">Loading MeetX…</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (needsProfile) return <Navigate to="/setup-profile" replace />;

  return children;
}

export default function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-meet-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/setup-profile" element={<ProfileSetup />} />

      {/* Protected routes */}
      <Route path="/" element={<ProtectedRoute><Landing /></ProtectedRoute>} />
      <Route path="/meeting/:roomCode" element={<ProtectedRoute><Meeting /></ProtectedRoute>} />
      <Route path="/attendance/:roomCode" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><MyHistory /></ProtectedRoute>} />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
