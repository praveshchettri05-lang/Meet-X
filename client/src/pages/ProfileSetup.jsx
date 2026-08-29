import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function ProfileSetup() {
  const { firebaseUser, dbUser, getToken, refreshDbUser, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  // Wait for Firebase auth to initialise
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-meet-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated at all — back to login
  if (!firebaseUser) return <Navigate to="/login" replace />;

  // Already has a profile — go home
  if (dbUser) return <Navigate to="/" replace />;

  // Pre-fill name from Google account once we know firebaseUser
  const defaultName = firebaseUser.displayName || '';


  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !rollNumber.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setFormLoading(true);
    setError('');

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), rollNumber: rollNumber.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save profile');
      }

      await refreshDbUser();
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-meet-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-meet-blue">📹 MeetX</h1>
        </div>

        <div className="card">
          <div className="text-center mb-6">
            {firebaseUser?.photoURL && (
              <img
                src={firebaseUser.photoURL}
                alt="Profile"
                className="w-16 h-16 rounded-full mx-auto mb-3 border-2 border-meet-blue"
              />
            )}
            <h2 className="text-xl font-semibold text-meet-dark">Complete Your Profile</h2>
            <p className="text-meet-gray text-sm mt-1">
              Signed in as{' '}
              <span className="font-medium text-meet-dark">{firebaseUser?.email}</span>
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-meet-dark mb-1">
                Full Name <span className="text-meet-red">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultName || 'Enter your full name'}
                className="input-field"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-meet-dark mb-1">
                Roll Number <span className="text-meet-red">*</span>
              </label>
              <input
                type="text"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g., 2024CS001"
                className="input-field"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                This will appear in attendance records and reports.
              </p>
            </div>

            <button
              type="submit"
              disabled={formLoading}
              className="btn-primary w-full mt-6"
            >
              {formLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </span>
              ) : (
                'Save Profile & Continue'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
