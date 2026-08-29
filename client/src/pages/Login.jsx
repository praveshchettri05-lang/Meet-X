import { useState, useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { firebaseUser, dbUser, needsProfile, loading: authLoading } = useAuth();

  // Wait for auth to initialise before deciding to redirect
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-meet-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Already has a full profile → go home
  if (dbUser) return <Navigate to="/" replace />;

  // Authenticated but needs to fill in profile
  if (firebaseUser && needsProfile) return <Navigate to="/setup-profile" replace />;

  async function handleGoogleSignIn() {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      // AuthContext will detect state change and redirect accordingly
    } catch (err) {
      console.error('Sign in error code:', err.code);
      console.error('Sign in error message:', err.message);

      const errorMessages = {
        'auth/popup-closed-by-user':
          'Sign-in popup was closed. Please try again.',
        'auth/popup-blocked':
          'Popup was blocked by your browser. Please allow popups for localhost and try again.',
        'auth/unauthorized-domain':
          '⚠️ Domain not authorized in Firebase. Fix: Go to Firebase Console → Authentication → Settings → Authorized domains → Add "localhost".',
        'auth/configuration-not-found':
          '⚠️ Firebase is not configured. Make sure your client/.env file has all VITE_FIREBASE_* values filled in correctly.',
        'auth/invalid-api-key':
          '⚠️ Invalid Firebase API key. Check VITE_FIREBASE_API_KEY in your client/.env file.',
        'auth/network-request-failed':
          'Network error. Check your internet connection.',
        'auth/cancelled-popup-request':
          'Another sign-in popup is already open. Please close it and try again.',
        'auth/internal-error':
          '⚠️ Firebase internal error. Check that Google Sign-in is enabled in Firebase Console → Authentication → Sign-in method.',
      };

      const msg = errorMessages[err.code]
        || `Sign-in failed (${err.code || 'unknown'}): ${err.message}`;

      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-meet-blue flex-col items-center justify-center p-16 text-white">
        <div className="max-w-md text-center">
          <div className="text-6xl font-bold mb-4">📹</div>
          <h1 className="text-4xl font-bold mb-4">MeetX</h1>
          <p className="text-xl text-blue-100 mb-8">
            Video meetings with smart attendance tracking and attentiveness monitoring
          </p>
          <div className="space-y-4 text-left">
            {[
              { icon: '🎥', text: 'Crystal clear video for up to 80 participants' },
              { icon: '📋', text: 'Automatic attendance with join/leave timestamps' },
              { icon: '🔔', text: 'Attentiveness ping to keep students engaged' },
              { icon: '📊', text: 'Detailed reports with CSV export' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-2xl">{f.icon}</span>
                <span className="text-blue-100">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-bold text-meet-blue">📹 MeetX</h1>
            <p className="text-meet-gray mt-2">Smart video meetings</p>
          </div>

          <div className="card">
            <h2 className="text-2xl font-semibold text-meet-dark mb-2">Sign in to MeetX</h2>
            <p className="text-meet-gray text-sm mb-8">
              Use your Google (Gmail) account to sign in. Your attendance records will be linked to your email.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
                {error}
              </div>
            )}

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 border border-gray-300
                         rounded-lg px-6 py-3.5 hover:bg-gray-50 transition-colors duration-150
                         disabled:opacity-60 disabled:cursor-not-allowed font-medium text-meet-dark"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <GoogleLogo />
              )}
              {loading ? 'Signing in…' : 'Continue with Google'}
            </button>

            <p className="text-xs text-gray-500 text-center mt-6">
              By signing in, you agree to allow MeetX to record your meeting attendance.
            </p>
          </div>

          <p className="text-center text-sm text-meet-gray mt-6">
            Need help?{' '}
            <a href="mailto:support@meetx.app" className="text-meet-blue hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
