import React, { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

// Wraps the app. Renders children only once the user is signed in AND allowed;
// otherwise shows the appropriate screen (loading / login / no-access).
export default function LoginGate({ children }) {
  const { status, signingIn, error, gisReady, renderButton, user, signOut } = useAuth();
  const btnRef = useRef(null);

  useEffect(() => {
    if (status === 'signedOut' && gisReady) renderButton(btnRef.current);
  }, [status, gisReady, renderButton]);

  if (status === 'authorized') return children;

  const s = {
    screen: {
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '32px 24px', background: 'var(--color-bg)', gap: '8px',
    },
    emoji: { fontSize: '56px', marginBottom: '8px' },
    title: { fontSize: '20px', fontWeight: 800, color: 'var(--color-text)', margin: 0 },
    desc: { fontSize: '14px', color: 'var(--color-text-light)', lineHeight: 1.6, maxWidth: '320px' },
    err: { color: '#ff4d4f', fontSize: '13px', marginTop: '8px', maxWidth: '320px' },
    linkBtn: {
      marginTop: '12px', padding: '10px 18px', borderRadius: '20px', border: '1px solid var(--color-border)',
      background: 'var(--color-card)', color: 'var(--color-text)', fontSize: '14px', cursor: 'pointer',
    },
  };

  return (
    <div style={s.screen}>
      <div style={s.emoji}>✈️</div>
      <h1 style={s.title}>나만의 해외여행 메이트</h1>

      {status === 'loading' && (
        <p style={s.desc}>불러오는 중이에요…</p>
      )}

      {status === 'signedOut' && (
        <>
          <p style={s.desc}>허용된 구글 계정으로 로그인해야 일정과 가계부를 볼 수 있어요.</p>
          <div ref={btnRef} style={{ marginTop: '12px', minHeight: '44px' }} />
          {!gisReady && !error && <p style={s.desc}>구글 로그인 버튼 준비 중…</p>}
          {signingIn && <p style={s.desc}>로그인 중…</p>}
          {error && <p style={s.err}>{error}</p>}
        </>
      )}

      {status === 'unauthorized' && (
        <>
          <p style={s.desc}>
            <b>{user?.email}</b> 계정은 아직 접근 권한이 없어요.<br />
            관리자에게 계정 추가를 요청해주세요.
          </p>
          <button style={s.linkBtn} onClick={signOut}>다른 계정으로 로그인</button>
        </>
      )}
    </div>
  );
}
