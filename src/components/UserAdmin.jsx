import React, { useEffect, useState } from 'react';
import { ref, onValue, set, remove } from 'firebase/database';
import { db } from '../firebase';
import { sanitizeEmail, OWNER_EMAIL } from '../auth/authConfig';

// Owner-only panel for managing the allow-list stored at /allowedEmails.
// Each entry is keyed by the sanitized email (dots → commas) and stores the
// original email + timestamp so we can display it nicely.
export default function UserAdmin({ onClose }) {
  const [list, setList] = useState([]);
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() =>
    onValue(
      ref(db, 'allowedEmails'),
      (snap) => {
        const val = snap.val() || {};
        const arr = Object.entries(val).map(([key, v]) => ({
          key,
          email: (v && v.email) || key.replace(/,/g, '.'),
          addedAt: v?.addedAt,
        }));
        arr.sort((a, b) => a.email.localeCompare(b.email));
        setList(arr);
      },
      (e) => setErr('명단을 불러오지 못했습니다: ' + e.message)
    ), []);

  const addEmail = async () => {
    const email = input.trim().toLowerCase();
    setErr('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('올바른 이메일 주소를 입력해주세요.');
      return;
    }
    if (email === OWNER_EMAIL) {
      setErr('관리자 계정은 이미 항상 접근할 수 있어요.');
      return;
    }
    try {
      setBusy(true);
      await set(ref(db, 'allowedEmails/' + sanitizeEmail(email)), { email, addedAt: Date.now() });
      setInput('');
    } catch (e) {
      setErr('추가 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeEmail = async (key) => {
    setErr('');
    try {
      await remove(ref(db, 'allowedEmails/' + key));
    } catch (e) {
      setErr('삭제 실패: ' + e.message);
    }
  };

  const s = {
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    },
    modal: {
      background: 'var(--color-card)', borderRadius: '16px', padding: '20px',
      width: '100%', maxWidth: '420px', maxHeight: '80vh', overflowY: 'auto',
      boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
    },
    head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
    title: { fontSize: '17px', fontWeight: 800, margin: 0 },
    closeBtn: { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--color-text-light)' },
    desc: { fontSize: '12px', color: 'var(--color-text-light)', marginBottom: '14px', lineHeight: 1.5 },
    row: { display: 'flex', gap: '8px', marginBottom: '14px' },
    input: { flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' },
    addBtn: { padding: '10px 16px', borderRadius: '10px', border: 'none', background: 'var(--color-point)', color: 'white', fontWeight: 700, cursor: 'pointer' },
    err: { color: '#ff4d4f', fontSize: '13px', marginBottom: '10px' },
    item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border)' },
    ownerBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: 'var(--color-green)', color: '#333', marginLeft: '6px' },
    delBtn: { background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
    empty: { textAlign: 'center', color: 'var(--color-text-light)', fontSize: '13px', padding: '16px 0' },
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.head}>
          <h2 style={s.title}>👥 사용자 관리</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="닫기">×</button>
        </div>
        <p style={s.desc}>
          여기에 추가한 구글 계정만 일정·가계부를 보고 편집할 수 있어요.
          관리자(나)는 명단과 상관없이 항상 접근할 수 있습니다.
        </p>

        <div style={s.row}>
          <input
            style={s.input}
            type="email"
            placeholder="허용할 구글 이메일 (예: friend@gmail.com)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addEmail(); }}
          />
          <button style={s.addBtn} onClick={addEmail} disabled={busy}>추가</button>
        </div>
        {err && <div style={s.err}>{err}</div>}

        {/* Owner is always allowed — show it pinned at the top, non-removable. */}
        <div style={s.item}>
          <span style={{ fontSize: '14px' }}>{OWNER_EMAIL}<span style={s.ownerBadge}>관리자</span></span>
        </div>

        {list.length === 0 ? (
          <div style={s.empty}>아직 추가한 계정이 없어요.</div>
        ) : (
          list.map((u) => (
            <div key={u.key} style={s.item}>
              <span style={{ fontSize: '14px' }}>{u.email}</span>
              <button style={s.delBtn} onClick={() => removeEmail(u.key)}>삭제</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
