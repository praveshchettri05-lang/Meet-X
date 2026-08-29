import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null); // Firebase auth user
  const [dbUser, setDbUser] = useState(null);              // Our DB user (name, rollNumber)
  const [loading, setLoading] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);

  // Get Firebase ID token for API calls
  async function getToken() {
    if (!firebaseUser) return null;
    return firebaseUser.getIdToken();
  }

  // Fetch user profile from our database
  async function fetchDbUser(fbUser) {
    try {
      const token = await fbUser.getIdToken();

      // Use AbortController so a slow/down backend doesn't freeze the app
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 404) {
        setNeedsProfile(true);
        return;
      }

      if (res.ok) {
        const user = await res.json();
        setDbUser(user);
        setNeedsProfile(false);
      } else {
        // Server returned an error (500 etc.) — treat as needing profile
        console.error('fetchDbUser: server error', res.status);
        setNeedsProfile(true);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('fetchDbUser: request timed out (backend may be offline)');
      } else {
        console.error('Failed to fetch user profile:', err);
      }
      // Don't leave user stuck — assume they need profile setup
      setNeedsProfile(true);
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        await fetchDbUser(fbUser);
      } else {
        setDbUser(null);
        setNeedsProfile(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  async function logout() {
    await signOut(auth);
    setDbUser(null);
    setFirebaseUser(null);
    setNeedsProfile(false);
  }

  // Called after profile setup is complete
  async function refreshDbUser() {
    if (firebaseUser) await fetchDbUser(firebaseUser);
  }

  return (
    <AuthContext.Provider value={{
      firebaseUser,
      dbUser,
      loading,
      needsProfile,
      getToken,
      logout,
      refreshDbUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
