import React, { useState } from 'react';

const baseStyle = {
  padding: '8px 14px',
  borderRadius: '20px',
  border: '1px solid var(--color-border)',
  background: 'white',
  color: 'var(--color-text)',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '600',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const ShareButton = ({ getShareData, label = '공유', style }) => {
  const [feedback, setFeedback] = useState(null); // null | 'copied' | 'failed'

  const showFeedback = (kind) => {
    setFeedback(kind);
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleShare = async () => {
    let data;
    try {
      data = getShareData();
    } catch (_) {
      return;
    }
    if (!data || (!data.text && !data.title && !data.url)) return;

    // Try native OS share sheet first (mobile, modern browsers)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) {
          // canShare exists and rejected — fall through to clipboard
        } else {
          await navigator.share(data);
          return;
        }
      } catch (err) {
        // User dismissed the share sheet — do nothing
        if (err && err.name === 'AbortError') return;
        // Other errors fall through to clipboard fallback
      }
    }

    // Fallback: copy to clipboard
    const composed = [data.title, data.text, data.url].filter(Boolean).join('\n\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(composed);
        showFeedback('copied');
        return;
      }
    } catch (_) {
      // ignore, fall through
    }

    // Last-resort fallback for very old environments
    try {
      const ta = document.createElement('textarea');
      ta.value = composed;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showFeedback('copied');
    } catch (_) {
      showFeedback('failed');
    }
  };

  const text =
    feedback === 'copied' ? '✓ 복사됨'
    : feedback === 'failed' ? '✕ 실패'
    : `📤 ${label}`;

  return (
    <button onClick={handleShare} style={{ ...baseStyle, ...style }} title="공유 / 복사">
      {text}
    </button>
  );
};

export default ShareButton;
