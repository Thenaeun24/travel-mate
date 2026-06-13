import React, { useState } from 'react';
import ShareButton from '../components/ShareButton';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { CURRENCIES, DEFAULT_CURRENCY, currencySymbol } from '../constants/currencies';

const buildLedgerShareText = (folder, baseCurrency, toBase, toKRW) => {
  if (!folder) return '';
  const sym = currencySymbol(baseCurrency);
  const expenses = folder.expenses || [];
  const allItems = [
    ...(folder.items || []),
    ...(folder.days || []).flatMap((d) => d.items || []),
  ];
  const totalBudget = allItems.reduce((s, i) => s + Number(i.budget || 0), 0);
  const totalExp = expenses.reduce((s, e) => s + toBase(e.amount, e.currency), 0);
  const remaining = totalBudget - totalExp;
  const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
  const krwLine = (amtBase) => {
    const krw = toKRW(amtBase);
    return krw == null ? '' : ` (₩${fmt(krw)})`;
  };

  const expByCat = {};
  expenses.forEach((e) => {
    const cat = e.category || '기타';
    expByCat[cat] = (expByCat[cat] || 0) + toBase(e.amount, e.currency);
  });

  const lines = [];
  lines.push(`💰 ${folder.name} 가계부`);
  lines.push('');
  lines.push(`총 예산: ${sym}${fmt(totalBudget)}${krwLine(totalBudget)}`);
  lines.push(`총 지출: ${sym}${fmt(totalExp)}${krwLine(totalExp)}`);
  lines.push(`잔액: ${remaining < 0 ? '-' : ''}${sym}${fmt(Math.abs(remaining))}`);

  if (Object.keys(expByCat).length > 0) {
    lines.push('');
    lines.push('카테고리별 지출:');
    Object.entries(expByCat).forEach(([cat, amt]) => {
      lines.push(`- ${cat}: ${sym}${fmt(amt)}`);
    });
  }

  if (expenses.length > 0) {
    lines.push('');
    lines.push(`지출 내역 (${expenses.length}건):`);
    [...expenses].slice(-10).reverse().forEach((e) => {
      lines.push(`- ${e.date} ${e.description} ${currencySymbol(e.currency)}${Number(e.amount).toLocaleString('ko-KR')}`);
    });
  }

  return lines.join('\n');
};

const CATEGORY_COLORS = {
  '관광명소': '#A3CCDA',
  '맛집': '#F5D2D2',
  '카페': '#F8F7BA',
  '숙소': '#BDE3C3',
  '기타': '#E0D4F5',
};

const EXPENSE_CATEGORIES = ['식비', '교통', '숙박', '관광', '쇼핑', '기타'];
const EXPENSE_CAT_COLORS = {
  '식비': '#F5D2D2',
  '교통': '#A3CCDA',
  '숙박': '#BDE3C3',
  '관광': '#F8F7BA',
  '쇼핑': '#E0D4F5',
  '기타': '#E8E8E8',
};

const Ledger = ({ folders, setFolders, activeFolderId, setActiveFolderId }) => {
  const [activeTab, setActiveTab] = useState('budget');

  const activeFolder = folders?.find((f) => f.id === activeFolderId) || folders?.[0];
  const baseCurrency = activeFolder?.currency || DEFAULT_CURRENCY;
  const baseSym = currencySymbol(baseCurrency);
  const expenses = activeFolder?.expenses || [];

  // Expense form state — defaults to the trip's base currency
  const [expForm, setExpForm] = useState({
    description: '', amount: '', category: '식비', currency: baseCurrency, date: new Date().toISOString().slice(0, 10),
  });
  const [showForm, setShowForm] = useState(false);

  // All scheduled items (from days) with budget
  const allItems = [
    ...(activeFolder?.items || []),
    ...(activeFolder?.days || []).flatMap((d) => d.items || []),
  ];
  const budgetItems = allItems.filter((item) => item.budget && Number(item.budget) > 0);

  // ── Exchange rates (base currency → others) ───────────────────────────────
  const { rateToKRW, loading: rateLoading, toBase, toKRW } = useExchangeRates(baseCurrency);

  const fmt = (num) => num?.toLocaleString('ko-KR') ?? '—';

  const setBaseCurrency = (code) => {
    setFolders((prev) =>
      prev.map((folder) => (folder.id === activeFolderId ? { ...folder, currency: code } : folder))
    );
    setExpForm((f) => ({ ...f, currency: code }));
  };

  // ── Budget calculations (all in base currency) ────────────────────────────
  const totalBudget = budgetItems.reduce((s, i) => s + Number(i.budget || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + toBase(e.amount, e.currency), 0);
  const remaining = totalBudget - totalExpenses;

  const budgetByCategory = {};
  budgetItems.forEach((item) => {
    const cat = item.category || '기타';
    budgetByCategory[cat] = (budgetByCategory[cat] || 0) + Number(item.budget || 0);
  });

  const expByCategory = {};
  expenses.forEach((e) => {
    const cat = e.category || '기타';
    expByCategory[cat] = (expByCategory[cat] || 0) + toBase(e.amount, e.currency);
  });

  // ── Expense handlers ──────────────────────────────────────────────────────
  const handleAddExpense = () => {
    if (!expForm.description.trim() || !expForm.amount) return;
    const newExp = {
      id: 'exp_' + Date.now(),
      ...expForm,
      amount: Number(expForm.amount),
      createdAt: Date.now(),
    };
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === activeFolderId
          ? { ...folder, expenses: [...(folder.expenses || []), newExp] }
          : folder
      )
    );
    setExpForm({ description: '', amount: '', category: '식비', currency: baseCurrency, date: new Date().toISOString().slice(0, 10) });
    setShowForm(false);
  };

  const handleDeleteExpense = (id) => {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === activeFolderId
          ? { ...folder, expenses: (folder.expenses || []).filter((e) => e.id !== id) }
          : folder
      )
    );
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = {
    page: { minHeight: '100%', padding: '20px 16px 32px', background: 'var(--color-bg)' },
    folderBar: { display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' },
    folderBtn: (active) => ({
      padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
      fontWeight: active ? 'bold' : 'normal', fontSize: '14px', transition: 'all 0.2s',
      background: active ? 'var(--color-point)' : 'var(--color-card)',
      color: active ? 'white' : 'var(--color-text)',
      boxShadow: active ? '0 2px 8px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
    }),
    rateBar: {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
      background: 'var(--color-card)', borderRadius: '12px', marginBottom: '16px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)', fontSize: '13px', color: 'var(--color-text-light)',
    },
    tabs: { display: 'flex', gap: '8px', marginBottom: '20px' },
    tab: (active) => ({
      flex: 1, padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer',
      fontWeight: active ? '700' : '500', fontSize: '15px', transition: 'all 0.2s',
      background: active ? 'var(--color-point)' : 'var(--color-card)',
      color: active ? 'white' : 'var(--color-text-light)',
      boxShadow: active ? '0 4px 12px rgba(163,204,218,0.4)' : '0 1px 3px rgba(0,0,0,0.04)',
    }),
    summaryGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' },
    summaryCard: (color) => ({
      background: 'var(--color-card)', borderRadius: '14px', padding: '16px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: `3px solid ${color}`,
      textAlign: 'center',
    }),
    card: { background: 'var(--color-card)', borderRadius: '14px', padding: '18px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
    badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: color, color: '#333', marginRight: '6px' }),
    progressBar: (pct, color) => ({
      height: '6px', borderRadius: '3px', background: '#eee', overflow: 'hidden', marginTop: '6px',
    }),
    progressFill: (pct, color) => ({
      height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: '3px', transition: 'width 0.4s',
    }),
    input: { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none', marginBottom: '10px' },
    addBtn: { width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--color-point)', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer', marginBottom: '14px' },
    expRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--color-border)' },
    delBtn: { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '18px', padding: '0 4px' },
  };

  return (
    <div className="ledger-page" style={s.page}>

      {/* Folder selector */}
      <div style={s.folderBar}>
        <span style={{ fontWeight: 'bold', color: 'var(--color-point)', whiteSpace: 'nowrap', lineHeight: '36px' }}>✈️</span>
        {(folders || []).map((f) => (
          <button key={f.id} style={s.folderBtn(f.id === activeFolderId)} onClick={() => setActiveFolderId(f.id)}>
            {f.name}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <ShareButton
            label="가계부 공유"
            getShareData={() => ({
              title: `${activeFolder?.name || ''} 가계부`,
              text: buildLedgerShareText(activeFolder, baseCurrency, toBase, toKRW),
            })}
          />
        </div>
      </div>

      {/* Exchange rate bar + trip currency selector */}
      <div style={s.rateBar}>
        <span>💱</span>
        <select
          value={baseCurrency}
          onChange={(e) => setBaseCurrency(e.target.value)}
          style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '4px 6px', fontSize: '13px', background: 'white', cursor: 'pointer' }}
          aria-label="여행 통화"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.flag} {c.symbol} {c.label} ({c.code})</option>
          ))}
        </select>
        {rateLoading
          ? <span>환율 불러오는 중...</span>
          : baseCurrency === 'KRW'
            ? <span><b>기준 통화: 원(KRW)</b></span>
            : rateToKRW
              ? <span><b>{baseCurrency} 100</b> = <b style={{ color: '#333' }}>₩ {fmt(Math.round(rateToKRW * 100))}</b> <span style={{ fontSize: '11px' }}>(실시간)</span></span>
              : <span style={{ color: '#f5a623' }}>환율 불러오기 실패 (오프라인)</span>
        }
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        <button style={s.tab(activeTab === 'budget')} onClick={() => setActiveTab('budget')}>📋 예산 계획</button>
        <button style={s.tab(activeTab === 'expenses')} onClick={() => setActiveTab('expenses')}>💸 지출 내역</button>
      </div>

      {/* ─── BUDGET TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'budget' && (
        <>
          {/* Summary cards */}
          <div style={s.summaryGrid}>
            <div style={s.summaryCard('#A3CCDA')}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginBottom: '4px' }}>총 예산</div>
              <div style={{ fontWeight: '800', fontSize: '17px' }}>{baseSym}{fmt(Math.round(totalBudget))}</div>
              {rateToKRW && <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginTop: '2px' }}>₩{fmt(toKRW(totalBudget))}</div>}
            </div>
            <div style={s.summaryCard('#F5D2D2')}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginBottom: '4px' }}>총 지출</div>
              <div style={{ fontWeight: '800', fontSize: '17px', color: totalExpenses > totalBudget ? '#ff4d4f' : '#333' }}>{baseSym}{fmt(Math.round(totalExpenses))}</div>
              {rateToKRW && <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginTop: '2px' }}>₩{fmt(toKRW(totalExpenses))}</div>}
            </div>
            <div style={s.summaryCard(remaining >= 0 ? '#BDE3C3' : '#ffccc7')}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginBottom: '4px' }}>잔액</div>
              <div style={{ fontWeight: '800', fontSize: '17px', color: remaining >= 0 ? '#52c41a' : '#ff4d4f' }}>
                {remaining >= 0 ? '' : '-'}{baseSym}{fmt(Math.abs(Math.round(remaining)))}
              </div>
              {rateToKRW && <div style={{ fontSize: '11px', color: remaining >= 0 ? '#52c41a' : '#ff4d4f', marginTop: '2px' }}>₩{fmt(Math.abs(toKRW(remaining)))}</div>}
            </div>
          </div>

          {/* Progress bar */}
          {totalBudget > 0 && (
            <div style={{ ...s.card, marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>지출 현황</span>
                <span style={{ fontSize: '13px', color: 'var(--color-text-light)' }}>{Math.round((totalExpenses / totalBudget) * 100)}%</span>
              </div>
              <div style={s.progressBar()}>
                <div style={s.progressFill((totalExpenses / totalBudget) * 100, totalExpenses > totalBudget ? '#ff4d4f' : '#A3CCDA')} />
              </div>
            </div>
          )}

          {/* Category breakdown */}
          <div style={s.card}>
            <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '14px' }}>카테고리별 예산</div>
            {Object.keys(budgetByCategory).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-light)', fontSize: '14px' }}>
                일정 페이지에서 장소에 예산을 입력하면 여기에 표시됩니다 💡
              </div>
            ) : (
              Object.entries(budgetByCategory).map(([cat, amt]) => {
                const exp = expByCategory[cat] || 0;
                const pct = amt > 0 ? (exp / amt) * 100 : 0;
                return (
                  <div key={cat} style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={s.badge(CATEGORY_COLORS[cat] || '#eee')}>{cat}</span>
                      </div>
                      <div style={{ fontSize: '13px', textAlign: 'right' }}>
                        <span style={{ color: 'var(--color-text-light)' }}>{baseSym}{fmt(Math.round(exp))}</span>
                        <span style={{ color: '#ccc', margin: '0 4px' }}>/</span>
                        <span style={{ fontWeight: '600' }}>{baseSym}{fmt(Math.round(amt))}</span>
                      </div>
                    </div>
                    <div style={s.progressBar()}>
                      <div style={s.progressFill(pct, pct > 100 ? '#ff4d4f' : CATEGORY_COLORS[cat] || '#A3CCDA')} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Budget items list */}
          {budgetItems.length > 0 && (
            <div style={s.card}>
              <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '14px' }}>예산 항목</div>
              {budgetItems.map((item) => (
                <div key={item.id} style={s.expRow}>
                  <div>
                    <span style={s.badge(CATEGORY_COLORS[item.category] || '#eee')}>{item.category || '기타'}</span>
                    <span style={{ fontSize: '14px' }}>{item.name}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '700' }}>{baseSym}{fmt(Number(item.budget))}</div>
                    {rateToKRW && <div style={{ fontSize: '11px', color: 'var(--color-text-light)' }}>₩{fmt(toKRW(Number(item.budget)))}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── EXPENSES TAB ───────────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <>
          {/* Add button */}
          <button
            style={s.addBtn}
            onClick={() => {
              setShowForm((v) => {
                if (!v) setExpForm((f) => ({ ...f, currency: baseCurrency }));
                return !v;
              });
            }}
          >
            {showForm ? '✕ 취소' : '+ 지출 추가'}
          </button>

          {/* Form */}
          {showForm && (
            <div style={{ ...s.card, marginBottom: '20px' }}>
              <input
                style={s.input} placeholder="내용 (예: 라멘, 지하철)"
                value={expForm.description}
                onChange={(e) => setExpForm((f) => ({ ...f, description: e.target.value }))}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <input
                  style={{ ...s.input, marginBottom: 0 }} type="number" placeholder="금액"
                  value={expForm.amount}
                  onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                />
                <select
                  style={{ ...s.input, marginBottom: 0 }}
                  value={expForm.currency}
                  onChange={(e) => setExpForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.label} ({c.code})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <select
                  style={{ ...s.input, marginBottom: 0 }}
                  value={expForm.category}
                  onChange={(e) => setExpForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input
                  style={{ ...s.input, marginBottom: 0 }} type="date"
                  value={expForm.date}
                  onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <button
                onClick={handleAddExpense}
                style={{ ...s.addBtn, marginBottom: 0, background: '#52c41a' }}
              >
                저장
              </button>
            </div>
          )}

          {/* Expenses summary */}
          <div style={s.summaryGrid}>
            <div style={s.summaryCard('#F5D2D2')}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginBottom: '4px' }}>총 지출</div>
              <div style={{ fontWeight: '800', fontSize: '17px' }}>{baseSym}{fmt(Math.round(totalExpenses))}</div>
              {rateToKRW && <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginTop: '2px' }}>₩{fmt(toKRW(totalExpenses))}</div>}
            </div>
            <div style={s.summaryCard('#A3CCDA')}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginBottom: '4px' }}>잔액</div>
              <div style={{ fontWeight: '800', fontSize: '17px', color: remaining >= 0 ? '#52c41a' : '#ff4d4f' }}>
                {remaining >= 0 ? '' : '-'}{baseSym}{fmt(Math.abs(Math.round(remaining)))}
              </div>
            </div>
            <div style={s.summaryCard('#F8F7BA')}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginBottom: '4px' }}>건수</div>
              <div style={{ fontWeight: '800', fontSize: '17px' }}>{expenses.length}건</div>
            </div>
          </div>

          {/* Category chips */}
          {Object.keys(expByCategory).length > 0 && (
            <div style={{ ...s.card, marginBottom: '14px' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '12px' }}>카테고리별 지출</div>
              {Object.entries(expByCategory).map(([cat, amt]) => (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={s.badge(EXPENSE_CAT_COLORS[cat] || '#eee')}>{cat}</span>
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>{baseSym}{fmt(Math.round(amt))}</span>
                </div>
              ))}
            </div>
          )}

          {/* Expense list */}
          <div style={s.card}>
            <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '4px' }}>지출 내역</div>
            {expenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-light)', fontSize: '14px' }}>
                아직 지출 내역이 없어요 🌸<br />위 버튼으로 추가해보세요!
              </div>
            ) : (
              [...expenses].reverse().map((e) => {
                const amtBase = toBase(e.amount, e.currency);
                return (
                  <div key={e.id} style={s.expRow}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={s.badge(EXPENSE_CAT_COLORS[e.category] || '#eee')}>{e.category}</span>
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>{e.description}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-light)' }}>{e.date}</div>
                    </div>
                    <div style={{ textAlign: 'right', marginRight: '8px' }}>
                      <div style={{ fontWeight: '700', fontSize: '15px' }}>
                        {currencySymbol(e.currency)}{fmt(e.amount)}
                      </div>
                      {e.currency !== baseCurrency && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-light)' }}>≈ {baseSym}{fmt(Math.round(amtBase))}</div>
                      )}
                      {e.currency === baseCurrency && rateToKRW && baseCurrency !== 'KRW' && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-light)' }}>₩{fmt(toKRW(e.amount))}</div>
                      )}
                    </div>
                    <button style={s.delBtn} onClick={() => handleDeleteExpense(e.id)}>×</button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Ledger;
