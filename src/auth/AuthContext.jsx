import React, {
  createContext, useContext, useCallback, useEffect, useState,
} from 'react';
import {
  GoogleAuthProvider, signInWithCredential, onAuthStateChanged, signOut as fbSignOut,
} from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { auth, db } from '../firebase';
import { CLIENT_ID, OWNER_EMAIL } from './authConfig';

// Google Identity Services client library. We use the ID-token ("credential")
// flow rather than signInWithPopup/Redirect, because the latter rely on the
// firebaseapp.com / web.app OAuth handler which is blocked on some networks
// (e.g. the fire-station PC firewall). This flow only talks to
// accounts.google.com (GIS) and identitytoolkit.googleapis.com (Firebase),
// both of which are reachable there.
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

// Load the GIS script once and resolve when window.google.accounts.id is ready.
const loadGis = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false); // Firebase auth state resolved?
  const [authorized, setAuthorized] = useState(null);     // null = checking, true, false
  const [gisReady, setGisReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  // Exchange the GIS ID token for a Firebase session.
  const handleCredential = useCallback(async (response) => {
    try {
      setSigningIn(true);
      setError('');
      const credential = GoogleAuthProvider.credential(response.credential);
      await signInWithCredential(auth, credential);
      // onAuthStateChanged (below) takes over from here.
    } catch (e) {
      setError('로그인에 실패했습니다. 다시 시도해주세요. (' + (e?.code || e?.message || e) + ')');
    } finally {
      setSigningIn(false);
    }
  }, []);

  // 1) Load + initialize GIS.
  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: false,
        });
        setGisReady(true);
      })
      .catch(() => setError('구글 로그인 모듈을 불러오지 못했습니다. 네트워크 연결을 확인해주세요.'));
    return () => { cancelled = true; };
  }, [handleCredential]);

  // 2) Track the Firebase auth session (persists across reloads).
  useEffect(() =>
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    }), []);

  // 3) Decide whether this signed-in user may access the travel data.
  //    The real enforcement lives in the database rules; here we just figure
  //    out which screen to show. The owner is always allowed. For everyone
  //    else we probe the protected node: a successful read means the rules
  //    let them in (their email is in allowedEmails), a denied read means no.
  useEffect(() => {
    let cancelled = false;
    if (!user) { setAuthorized(null); return; }
    if (user.email === OWNER_EMAIL) { setAuthorized(true); return; }
    setAuthorized(null);
    get(ref(db, 'travel-mate-app'))
      .then(() => { if (!cancelled) setAuthorized(true); })
      .catch(() => { if (!cancelled) setAuthorized(false); });
    return () => { cancelled = true; };
  }, [user]);

  // Render the official Google button into a DOM element.
  const renderButton = useCallback((el) => {
    if (gisReady && el && window.google?.accounts?.id) {
      el.innerHTML = '';
      window.google.accounts.id.renderButton(el, {
        theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 260,
      });
    }
  }, [gisReady]);

  const signOut = useCallback(async () => {
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* GIS may not be loaded */ }
    await fbSignOut(auth);
    setAuthorized(null);
  }, []);

  // Derive a single status the UI can switch on.
  let status;
  if (!authChecked) status = 'loading';
  else if (!user) status = 'signedOut';
  else if (authorized === null) status = 'loading';
  else status = authorized ? 'authorized' : 'unauthorized';

  const value = {
    user,
    status,
    isOwner: user?.email === OWNER_EMAIL,
    gisReady,
    signingIn,
    error,
    renderButton,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
