import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Plus, X, ChevronRight, ArrowLeft, TrendingUp, TrendingDown, Check, Ban,
  Pencil, Users, LayoutGrid, Activity, Lock, ChevronDown, Trash2, Circle, Loader2, AlertCircle, CalendarDays,
} from "lucide-react";

/* ----------------------------------------------------------------------
   STORAGE HELPERS
---------------------------------------------------------------------- */
const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now());

async function loadUsers() {
  const response = await fetch("/api/users");
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Could not load profiles (HTTP ${response.status}).`);
  }
  return response.json();
}
async function createUser(user) {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  if (!response.ok) throw new Error((await response.json()).error || "Could not create profile.");
  return response.json();
}
async function loadUserData(userId) {
  const response = await fetch(`/api/data/${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error("Could not load ledger data.");
  return response.json();
}
async function saveUserData(userId, data) {
  const response = await fetch(`/api/data/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Could not save ledger data.");
}

/* ----------------------------------------------------------------------
   MATH HELPERS
---------------------------------------------------------------------- */
function flattenInstances(weekend) {
  return (weekend.games || []).flatMap((g) =>
    (g.instances || []).map((i) => ({ ...i, gameId: g.id, gameName: g.name }))
  );
}
function usedPercent(weekend) {
  return flattenInstances(weekend).reduce((s, i) => s + (Number(i.budgetPercent) || 0), 0);
}
function projected(weekend) {
  const budget = Number(weekend.startingBudget) || 0;
  let profit = 0;
  for (const i of flattenInstances(weekend)) {
    const stake = budget * ((Number(i.budgetPercent) || 0) / 100);
    profit += i.projectedWon === false ? -stake : stake * ((Number(i.multiplier) || 1) - 1);
  }
  return {
    profit,
    finalBalance: budget + profit,
    pct: budget > 0 ? (profit / budget) * 100 : 0,
  };
}
function actual(weekend) {
  const budget = Number(weekend.startingBudget) || 0;
  let profit = 0;
  let graded = 0;
  let total = 0;
  for (const i of flattenInstances(weekend)) {
    total += 1;
    const stake = budget * ((Number(i.budgetPercent) || 0) / 100);
    if (i.won === true) {
      profit += stake * ((Number(i.multiplier) || 1) - 1);
      graded += 1;
    } else if (i.won === false) {
      profit -= stake;
      graded += 1;
    }
  }
  return {
    profit,
    finalBalance: budget + profit,
    pct: budget > 0 ? (profit / budget) * 100 : 0,
    graded,
    total,
    allGraded: total > 0 && graded === total,
  };
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n) {
  const v = Number(n) || 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function localDateTime(utcDate) {
  const value = new Date(utcDate);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate()),
    time: pad(value.getHours()) + ":" + pad(value.getMinutes()),
  };
}
function gameSortValue(game) {
  return (game.date || "") + "T" + (game.time || "00:00");
}

/* ----------------------------------------------------------------------
   PRIMITIVES
---------------------------------------------------------------------- */
function Modal({ title, onClose, children, width = 420 }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function StatusPill({ status }) {
  return <span className={`pill pill-${status}`}>{status === "complete" ? "Settled" : "Active"}</span>;
}

/* ----------------------------------------------------------------------
   LOGIN / PROFILE PICKER
---------------------------------------------------------------------- */
function LoginView({ users, onAddUser, onSelectUser }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr("Enter a name."); return; }
    if (users.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) {
      setErr("That name is already taken.");
      return;
    }
    onAddUser(trimmed);
    setName("");
    setAdding(false);
    setErr("");
  };

  return (
    <div className="login-shell">
      <div className="login-wrap">
        <div className="brand">
          <div className="brand-mark">SB</div>
          <div>
            <div className="brand-name">THE LEDGER</div>
            <div className="brand-sub">weekend betting simulator</div>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-head">Who's punching in?</div>
          <div className="profile-grid">
            {users.map((u) => (
              <button key={u.id} className="profile-card" onClick={() => onSelectUser(u)}>
                <span className="profile-avatar">{u.name.slice(0, 2).toUpperCase()}</span>
                <span className="profile-name">{u.name}</span>
              </button>
            ))}
            <button className="profile-card profile-card-add" onClick={() => setAdding(true)}>
              <span className="profile-avatar profile-avatar-add"><Plus size={20} /></span>
              <span className="profile-name">Add user</span>
            </button>
          </div>
          {users.length === 0 && (
            <p className="empty-note">No profiles yet — add the first one to get started. No password needed, just a name.</p>
          )}
        </div>
      </div>

      {adding && (
        <Modal title="Add user" onClose={() => { setAdding(false); setErr(""); }}>
          <Field label="Name">
            <input
              autoFocus
              className="input"
              value={name}
              placeholder="e.g. Ventech"
              onChange={(e) => { setName(e.target.value); setErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>
          {err && <div className="form-err">{err}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}>Add & continue</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------
   HEADER / NAV
---------------------------------------------------------------------- */
function Header({ user, view, setView, onSwitchUser }) {
  return (
    <div className="topnav">
      <div className="topnav-left" onClick={() => setView("dashboard")}>
        <div className="brand-mark brand-mark-sm">SB</div>
        <span className="topnav-brand">THE LEDGER</span>
      </div>
      <div className="topnav-mid">
        <button className={`nav-link ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
          <LayoutGrid size={15} /> Weekends
        </button>
        <button className={`nav-link ${view === "portfolio" ? "active" : ""}`} onClick={() => setView("portfolio")}>
          <Activity size={15} /> Portfolio
        </button>
      </div>
      <div className="topnav-right">
        <span className="user-chip">{user.name}</span>
        <button className="btn btn-ghost btn-sm" onClick={onSwitchUser}>
          <Users size={14} /> Switch
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------
   DASHBOARD
---------------------------------------------------------------------- */
function NewWeekendModal({ prevWeekend, onCreate, onClose }) {
  const prevFinal = prevWeekend ? actual(prevWeekend).finalBalance : 0;
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [carryPct, setCarryPct] = useState(100);
  const [addedFunds, setAddedFunds] = useState(prevWeekend ? 0 : 100);

  const computedBudget = prevWeekend
    ? prevFinal * (Number(carryPct) / 100) + Number(addedFunds || 0)
    : Number(addedFunds || 0);

  const submit = () => {
    if (!label.trim()) return;
    onCreate({
      id: uid(),
      label: label.trim(),
      startDate,
      startingBudget: Math.max(0, computedBudget),
      carriedOverPercent: prevWeekend ? Number(carryPct) : 0,
      addedFunds: Number(addedFunds || 0),
      status: "active",
      createdAt: Date.now(),
      games: [],
    });
  };

  return (
    <Modal title="New betting weekend" onClose={onClose} width={460}>
      <Field label="Label">
        <input className="input" autoFocus value={label} placeholder="e.g. Week 1 — Sept 6"
          onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Start date">
        <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>

      {prevWeekend ? (
        <>
          <div className="carry-box">
            <span className="carry-box-label">Previous weekend ended at</span>
            <span className="carry-box-value">{fmtMoney(prevFinal)}</span>
          </div>
          <Field label={`Carry forward: ${carryPct}%`}>
            <input type="range" min={0} max={100} value={carryPct}
              onChange={(e) => setCarryPct(e.target.value)} className="range gold" />
          </Field>
          <Field label="Add new funds" hint="On top of whatever carries forward">
            <input type="number" className="input" value={addedFunds}
              onChange={(e) => setAddedFunds(e.target.value)} min={0} step="0.01" />
          </Field>
        </>
      ) : (
        <Field label="Starting budget">
          <input type="number" className="input" value={addedFunds}
            onChange={(e) => setAddedFunds(e.target.value)} min={0} step="0.01" />
        </Field>
      )}

      <div className="compute-preview">
        Starting budget for this weekend: <b>{fmtMoney(computedBudget)}</b>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!label.trim()} onClick={submit}>Create weekend</button>
      </div>
    </Modal>
  );
}

function DashboardView({ weekends, onOpen, onCreate }) {
  const [showNew, setShowNew] = useState(false);
  const sorted = [...weekends].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || "") || b.createdAt - a.createdAt);
  const mostRecentComplete = [...weekends].filter((w) => w.status === "complete")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const lastAny = [...weekends].sort((a, b) => b.createdAt - a.createdAt)[0];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Weekends</h1>
          <p className="page-sub">Every slate you've planned, graded, or settled.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={16} /> New weekend
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-block">
          <div className="empty-block-title">No weekends yet</div>
          <p>Start your first betting weekend to set a budget and begin adding games.</p>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={16} /> New weekend</button>
        </div>
      ) : (
        <div className="weekend-list">
          {sorted.map((w) => {
            const isComplete = w.status === "complete";
            const result = isComplete ? actual(w) : projected(w);
            const positive = result.profit >= 0;
            return (
              <button key={w.id} className="weekend-row" onClick={() => onOpen(w.id)}>
                <div className="weekend-row-main">
                  <div className="weekend-row-top">
                    <span className="weekend-row-label">{w.label}</span>
                    <StatusPill status={w.status} />
                  </div>
                  <div className="weekend-row-sub">
                    {fmtDate(w.startDate)} · Budget {fmtMoney(w.startingBudget)} · {flattenInstances(w).length} instance{flattenInstances(w).length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="weekend-row-result">
                  <span className={`result-figure ${positive ? "pos" : "neg"}`}>
                    {positive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                    {fmtMoney(result.finalBalance)}
                  </span>
                  <span className={`result-pct ${positive ? "pos" : "neg"}`}>{fmtPct(result.pct)}</span>
                </div>
                <ChevronRight size={18} className="weekend-row-chevron" />
              </button>
            );
          })}
        </div>
      )}

      {showNew && (
        <NewWeekendModal
          prevWeekend={mostRecentComplete || lastAny}
          onClose={() => setShowNew(false)}
          onCreate={(w) => { onCreate(w); setShowNew(false); }}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------
   WEEKEND VIEW — Sim + Result
---------------------------------------------------------------------- */
function EditWeekendModal({ weekend, onSave, onClose }) {
  const [label, setLabel] = useState(weekend.label);
  const [startDate, setStartDate] = useState(weekend.startDate);
  const [budget, setBudget] = useState(weekend.startingBudget);

  return (
    <Modal title="Edit weekend" onClose={onClose}>
      <Field label="Label">
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Start date">
        <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <Field label="Starting budget" hint="Adjust this any time — instance stakes recalculate automatically">
        <input type="number" className="input" value={budget} min={0} step="0.01"
          onChange={(e) => setBudget(e.target.value)} />
      </Field>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave({ label, startDate, startingBudget: Number(budget) || 0 })}>
          Save changes
        </button>
      </div>
    </Modal>
  );
}

function groupFixturesByDate(matches) {
  return matches.reduce((groups, match) => {
    const dateKey = new Date(match.utcDate).toISOString().slice(0, 10);
    (groups[dateKey] ||= []).push(match);
    return groups;
  }, {});
}

function AddGameModal({ defaultDate, onCreate, onClose }) {
  const [mode, setMode] = useState("pl");
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("12:00");
  const [fixtures, setFixtures] = useState(null);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [fixtureError, setFixtureError] = useState("");

  useEffect(() => {
    if (mode !== "pl" || fixtures !== null) return;
    let cancelled = false;
    setLoadingFixtures(true);
    setFixtureError("");
    fetch("/api/fixtures?days=10")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load fixtures.");
        return body;
      })
      .then((body) => { if (!cancelled) setFixtures(body.matches || []); })
      .catch((error) => { if (!cancelled) setFixtureError(error.message || "Could not load fixtures."); })
      .finally(() => { if (!cancelled) setLoadingFixtures(false); });
    return () => { cancelled = true; };
  }, [mode, fixtures]);

  const fixtureGroups = useMemo(
    () => Object.entries(groupFixturesByDate(fixtures || [])).sort(([a], [b]) => a.localeCompare(b)),
    [fixtures]
  );
  const createGame = ({ fixture, manualName, manualDate, manualTime }) => onCreate({
    id: uid(),
    name: fixture ? fixture.homeTeam.name + " - " + fixture.awayTeam.name : manualName.trim(),
    date: fixture ? localDateTime(fixture.utcDate).date : manualDate,
    time: fixture ? localDateTime(fixture.utcDate).time : manualTime,
    instances: [],
    ...(fixture ? {
      sourceMatchId: fixture.id,
      homeCrest: fixture.homeTeam.crest,
      awayCrest: fixture.awayTeam.crest,
    } : {}),
  });

  return (
    <Modal title="Add game" onClose={onClose} width={480}>
      <div className="seg-toggle">
        <button className={"seg-btn " + (mode === "pl" ? "active" : "")} onClick={() => setMode("pl")}>Premier League</button>
        <button className={"seg-btn " + (mode === "manual" ? "active" : "")} onClick={() => setMode("manual")}>Manual</button>
      </div>

      {mode === "manual" ? (
        <>
          <Field label="Matchup / event">
            <input autoFocus className="input" placeholder="e.g. Lakers @ Celtics" value={name}
              onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Kickoff time">
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!name.trim()}
              onClick={() => createGame({ manualName: name, manualDate: date, manualTime: time })}>Add game</button>
          </div>
        </>
      ) : (
        <div className="fixture-picker">
          {loadingFixtures && <div className="fixture-state"><Loader2 size={16} className="spin" /> Loading fixtures…</div>}
          {!loadingFixtures && fixtureError && (
            <div className="fixture-state fixture-state-error">
              <AlertCircle size={16} /> <span>{fixtureError}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { setFixtures(null); setFixtureError(""); }}>Retry</button>
            </div>
          )}
          {!loadingFixtures && !fixtureError && fixtureGroups.length === 0 && (
            <div className="fixture-state"><CalendarDays size={16} /> No scheduled Premier League fixtures in the next 10 days.</div>
          )}
          {!loadingFixtures && !fixtureError && fixtureGroups.length > 0 && (
            <div className="fixture-list">
              {fixtureGroups.map(([dateKey, matches]) => (
                <div key={dateKey} className="fixture-day">
                  <div className="fixture-day-label">{new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                  {matches.map((match) => (
                    <button key={match.id} className="fixture-row" onClick={() => createGame({ fixture: match })}>
                      <span className="fixture-team">
                        {match.homeTeam.crest && <img src={match.homeTeam.crest} alt="" className="fixture-crest" />}
                        {match.homeTeam.name}
                      </span>
                      <span className="fixture-vs">vs</span>
                      <span className="fixture-team fixture-team-away">
                        {match.awayTeam.name}
                        {match.awayTeam.crest && <img src={match.awayTeam.crest} alt="" className="fixture-crest" />}
                      </span>
                      <span className="fixture-time">{new Date(match.utcDate).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>Cancel</button></div>
        </div>
      )}
    </Modal>
  );
}

function AddInstanceModal({ onCreate, onClose, roomLeft }) {
  const [name, setName] = useState("");
  const [multiplier, setMultiplier] = useState("2.0");
  return (
    <Modal title="Add instance" onClose={onClose}>
      <Field label="Bet description">
        <input autoFocus className="input" placeholder="e.g. Lakers -4.5" value={name}
          onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Multiplier" hint="Payout multiplier, e.g. 1.91 for -110 odds">
        <input type="number" className="input" value={multiplier} min={1.01} step="0.01"
          onChange={(e) => setMultiplier(e.target.value)} />
      </Field>
      <div className="form-note">{roomLeft.toFixed(1)}% of the weekend budget is unallocated. You can set the stake after adding.</div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!name.trim() || roomLeft <= 0}
          onClick={() => onCreate({
            id: uid(),
            name: name.trim(),
            multiplier: Number(multiplier) || 1,
            budgetPercent: Math.min(10, roomLeft),
            projectedWon: true,
            won: null,
          })}>
          Add instance
        </button>
      </div>
    </Modal>
  );
}

function AllocationMeter({ weekend }) {
  const flat = flattenInstances(weekend);
  const used = usedPercent(weekend);
  const palette = ["#E3B341", "#6FA8DC", "#C98BE0", "#5BC0A6", "#E08A5B", "#9BA6FF"];
  return (
    <div className="meter-wrap">
      <div className="meter-track">
        {flat.map((i, idx) => (
          <div key={i.id} className="meter-seg" style={{ width: `${i.budgetPercent}%`, background: palette[idx % palette.length] }} />
        ))}
        <div className="meter-seg meter-seg-free" style={{ width: `${Math.max(0, 100 - used)}%` }} />
      </div>
      <div className="meter-caption">
        <span>{used.toFixed(1)}% allocated</span>
        <span>{Math.max(0, 100 - used).toFixed(1)}% free</span>
      </div>
    </div>
  );
}

function InstanceTicket({ instance, weekend, mode, locked, onChange, onRemove, gameName }) {
  const budget = Number(weekend.startingBudget) || 0;
  const stake = budget * ((Number(instance.budgetPercent) || 0) / 100);
  const flat = flattenInstances(weekend);
  const othersUsed = flat.filter((i) => i.id !== instance.id).reduce((s, i) => s + (Number(i.budgetPercent) || 0), 0);
  const maxForThis = Math.max(0, 100 - othersUsed);
  const profitIfWin = stake * ((Number(instance.multiplier) || 1) - 1);

  return (
    <div className="ticket">
      <div className="ticket-main">
        <div className="ticket-topline">
          {mode === "sim" && !locked ? (
            <>
              <input className="ticket-edit ticket-name-edit" value={instance.name} aria-label="Instance name"
                onChange={(e) => onChange({ ...instance, name: e.target.value })} />
              <input className="ticket-edit ticket-multiplier-edit" type="number" min="1" step="0.01"
                value={instance.multiplier} aria-label="Payout multiplier"
                onChange={(e) => onChange({ ...instance, multiplier: Number(e.target.value) || 1 })} />
            </>
          ) : (
            <>
              <span className="ticket-name">{instance.name}</span>
              <span className="ticket-odds">{Number(instance.multiplier).toFixed(2)}×</span>
            </>
          )}
        </div>
        <div className="ticket-sub">{gameName}</div>
      </div>

      <div className="ticket-perf" />

      <div className="ticket-stake">
        {mode === "sim" ? (
          <>
            <div className="ticket-slider-row">
              <input
                type="range" min={0} max={maxForThis} step={0.5} value={instance.budgetPercent}
                disabled={locked}
                onChange={(e) => onChange({ ...instance, budgetPercent: Number(e.target.value) })}
                className="range gold ticket-range"
              />
              <span className="ticket-pct">{Number(instance.budgetPercent).toFixed(1)}%</span>
            </div>
            <label className="projected-toggle">
              <input
                type="checkbox"
                checked={instance.projectedWon !== false}
                disabled={locked}
                onChange={(e) => onChange({ ...instance, projectedWon: e.target.checked })}
              />
              <span>Projected win</span>
            </label>
            <div className="ticket-figures">
              <span>Stake {fmtMoney(stake)}</span>
              <span className={instance.projectedWon === false ? "neg" : "pos"}>
                {instance.projectedWon === false ? "Projected loss " + fmtMoney(-stake) : "Projected win +" + fmtMoney(profitIfWin)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="ticket-figures ticket-figures-static">
              <span>{Number(instance.budgetPercent).toFixed(1)}% · Stake {fmtMoney(stake)}</span>
            </div>
            <div className="wl-toggle">
              <button
                className={`wl-btn wl-win ${instance.won === true ? "active" : ""}`}
                disabled={locked}
                onClick={() => onChange({ ...instance, won: instance.won === true ? null : true })}
              >
                <Check size={14} /> Won
              </button>
              <button
                className={`wl-btn wl-loss ${instance.won === false ? "active" : ""}`}
                disabled={locked}
                onClick={() => onChange({ ...instance, won: instance.won === false ? null : false })}
              >
                <Ban size={14} /> Lost
              </button>
            </div>
          </>
        )}
      </div>

      {mode === "sim" && !locked && (
        <button className="ticket-remove" onClick={onRemove} title="Remove instance"><Trash2 size={14} /></button>
      )}
    </div>
  );
}

function GameCard({ game, weekend, mode, locked, onUpdateGame, onRemoveGame }) {
  const [open, setOpen] = useState(true);
  const [addingInstance, setAddingInstance] = useState(false);
  const used = usedPercent(weekend);
  const roomLeft = Math.max(0, 100 - used);

  const updateInstance = (updated) => {
    onUpdateGame({
      ...game,
      instances: game.instances.map((i) => (i.id === updated.id ? updated : i)),
    });
  };
  const removeInstance = (id) => {
    onUpdateGame({ ...game, instances: game.instances.filter((i) => i.id !== id) });
  };

  return (
    <div className="game-card">
      <div className="game-head" onClick={() => setOpen(!open)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen(!open); }}>
        <ChevronDown size={16} className={`chev ${open ? "open" : ""}`} />
        {mode === "sim" && !locked ? (
          <>
            {game.homeCrest && <img src={game.homeCrest} alt="" className="game-team-crest" />}
            <input className="game-name-edit" value={game.name} aria-label="Game name"
              onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => onUpdateGame({ ...game, name: e.target.value })} />
            {game.awayCrest && <img src={game.awayCrest} alt="" className="game-team-crest" />}
          </>
        ) : (
          <span className="game-name">
            {game.homeCrest && <img src={game.homeCrest} alt="" className="game-team-crest" />}
            {game.name}
            {game.awayCrest && <img src={game.awayCrest} alt="" className="game-team-crest" />}
          </span>
        )}
        {mode === "sim" && !locked ? (
          <div className="game-schedule-edit" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <input type="date" value={game.date || ""} aria-label="Game date"
              onChange={(e) => onUpdateGame({ ...game, date: e.target.value })} />
            <input type="time" value={game.time || ""} aria-label="Game time"
              onChange={(e) => onUpdateGame({ ...game, time: e.target.value })} />
          </div>
        ) : (
          <span className="game-date">{fmtDate(game.date)}{game.time ? " · " + game.time : ""}</span>
        )}
        <span className="game-count">{game.instances.length} instance{game.instances.length === 1 ? "" : "s"}</span>
        {mode === "sim" && !locked && (
          <span className="game-remove" onClick={(e) => { e.stopPropagation(); onRemoveGame(); }}>
            <Trash2 size={14} />
          </span>
        )}
      </div>

      {open && (
        <div className="game-body">
          {game.instances.length === 0 && <div className="game-empty">No instances on this game yet.</div>}
          {game.instances.map((inst) => (
            <InstanceTicket
              key={inst.id}
              instance={inst}
              weekend={weekend}
              mode={mode}
              locked={locked}
              gameName={game.name}
              onChange={updateInstance}
              onRemove={() => removeInstance(inst.id)}
            />
          ))}
          {mode === "sim" && !locked && (
            <button className="add-instance-btn" onClick={() => setAddingInstance(true)} disabled={roomLeft <= 0}>
              <Plus size={14} /> Add instance {roomLeft <= 0 ? "(budget fully allocated)" : ""}
            </button>
          )}
        </div>
      )}

      {addingInstance && (
        <AddInstanceModal
          roomLeft={roomLeft}
          onClose={() => setAddingInstance(false)}
          onCreate={(inst) => { onUpdateGame({ ...game, instances: [...game.instances, inst] }); setAddingInstance(false); }}
        />
      )}
    </div>
  );
}

function SummaryCard({ weekend, mode }) {
  const isComplete = weekend.status === "complete";
  const showActual = mode === "result" || isComplete;
  const res = showActual ? actual(weekend) : projected(weekend);
  const positive = res.profit >= 0;
  return (
    <div className="summary-card">
      <div className="summary-label">{showActual ? "Actual result" : "Projected result"} {showActual && !isComplete ? `(${res.graded}/${res.total} graded)` : ""}</div>
      <div className="summary-figures">
        <span className={`summary-money ${positive ? "pos" : "neg"}`}>{fmtMoney(res.finalBalance)}</span>
        <span className={`summary-pct ${positive ? "pos" : "neg"}`}>{fmtPct(res.pct)}</span>
      </div>
      <div className="summary-detail">
        Starting budget {fmtMoney(weekend.startingBudget)} {positive ? "+" : ""}{fmtMoney(res.profit)} {showActual ? "actual" : "projected"}
      </div>
    </div>
  );
}

function WeekendView({ weekend, onUpdate, onBack }) {
  const [tab, setTab] = useState("sim");
  const [editing, setEditing] = useState(false);
  const [addingGame, setAddingGame] = useState(false);
  const locked = weekend.status === "complete";
  const flat = flattenInstances(weekend);
  const act = actual(weekend);

  const updateGame = (updatedGame) => {
    onUpdate({ ...weekend, games: weekend.games.map((g) => (g.id === updatedGame.id ? updatedGame : g)) });
  };
  const removeGame = (gameId) => {
    onUpdate({ ...weekend, games: weekend.games.filter((g) => g.id !== gameId) });
  };
  const addGame = (game) => {
    onUpdate({ ...weekend, games: [...weekend.games, game] });
    setAddingGame(false);
  };
  const completeWeekend = () => {
    onUpdate({ ...weekend, status: "complete" });
  };

  return (
    <div className="page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> All weekends</button>

      <div className="page-head">
        <div>
          <div className="wv-title-row">
            <h1 className="page-title">{weekend.label}</h1>
            <StatusPill status={weekend.status} />
          </div>
          <p className="page-sub">
            {fmtDate(weekend.startDate)} · Budget {fmtMoney(weekend.startingBudget)}
            {!locked && (
              <button className="inline-edit" onClick={() => setEditing(true)}><Pencil size={12} /> edit</button>
            )}
            {locked && <span className="locked-note"><Lock size={12} /> settled</span>}
          </p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "sim" ? "active" : ""}`} onClick={() => setTab("sim")}>Sim Mode</button>
        <button className={`tab ${tab === "result" ? "active" : ""}`} onClick={() => setTab("result")}>Result Mode</button>
      </div>

      <div className="wv-grid">
        <div className="wv-main">
          {!locked && <AllocationMeter weekend={weekend} />}

          {weekend.games.length === 0 ? (
            <div className="empty-block">
              <div className="empty-block-title">No games yet</div>
              <p>Add a game, then add betting instances inside it.</p>
              {!locked && (
                <button className="btn btn-primary" onClick={() => setAddingGame(true)}><Plus size={16} /> Add game</button>
              )}
            </div>
          ) : (
            <div className="games-list">
              {[...weekend.games].sort((a, b) => gameSortValue(a).localeCompare(gameSortValue(b))).map((g) => (
                <GameCard
                  key={g.id}
                  game={g}
                  weekend={weekend}
                  mode={tab}
                  locked={locked}
                  onUpdateGame={updateGame}
                  onRemoveGame={() => removeGame(g.id)}
                />
              ))}
              {!locked && (
                <button className="add-game-btn" onClick={() => setAddingGame(true)}>
                  <Plus size={15} /> Add game
                </button>
              )}
            </div>
          )}
        </div>

        <div className="wv-side">
          <SummaryCard weekend={weekend} mode={tab} />
          {tab === "result" && !locked && (
            <button
              className="btn btn-primary btn-block"
              disabled={!act.allGraded}
              onClick={completeWeekend}
            >
              <Lock size={15} /> {act.allGraded ? "Complete weekend" : `Grade all instances (${act.graded}/${act.total})`}
            </button>
          )}
          {tab === "result" && locked && (
            <div className="settled-note"><Lock size={14} /> This weekend is settled and locked.</div>
          )}
        </div>
      </div>

      {editing && (
        <EditWeekendModal
          weekend={weekend}
          onClose={() => setEditing(false)}
          onSave={(patch) => { onUpdate({ ...weekend, ...patch }); setEditing(false); }}
        />
      )}
      {addingGame && (
        <AddGameModal defaultDate={weekend.startDate} onClose={() => setAddingGame(false)} onCreate={addGame} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------
   PORTFOLIO
---------------------------------------------------------------------- */
function PortfolioView({ weekends }) {
  const completed = [...weekends]
    .filter((w) => w.status === "complete")
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "") || a.createdAt - b.createdAt);

  const chartData = useMemo(() => {
    let running = 0;
    return completed.map((w) => {
      const a = actual(w);
      running = a.finalBalance;
      return { name: w.label, date: fmtDate(w.startDate), balance: a.finalBalance, profit: a.profit };
    });
  }, [completed]);

  // Derive contributions from current budgets so later edits stay reflected.
  const totalPutIn = [...weekends]
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "") || a.createdAt - b.createdAt)
    .reduce((total, weekend, index, ordered) => {
      const previous = index ? actual(ordered[index - 1]).finalBalance : 0;
      return total + Math.max(0, (Number(weekend.startingBudget) || 0) - previous);
    }, 0);
  const currentBalance = chartData.length ? chartData[chartData.length - 1].balance : 0;
  const allTimeGainPct = totalPutIn > 0 ? ((currentBalance - totalPutIn) / totalPutIn) * 100 : 0;
  const best = completed.length ? completed.reduce((b, w) => (actual(w).profit > actual(b).profit ? w : b)) : null;
  const worst = completed.length ? completed.reduce((b, w) => (actual(w).profit < actual(b).profit ? w : b)) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Portfolio</h1>
          <p className="page-sub">Cumulative performance across every settled weekend.</p>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-box">
          <span className="stat-label">Capital put in</span>
          <span className="stat-value">{fmtMoney(totalPutIn)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Current balance</span>
          <span className="stat-value">{fmtMoney(currentBalance)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">All-time gain</span>
          <span className={`stat-value ${allTimeGainPct >= 0 ? "pos" : "neg"}`}>{fmtPct(allTimeGainPct)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Best weekend</span>
          <span className="stat-value stat-value-sm">{best ? `${best.label} (${fmtMoney(actual(best).profit)})` : "—"}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Worst weekend</span>
          <span className="stat-value stat-value-sm">{worst ? `${worst.label} (${fmtMoney(actual(worst).profit)})` : "—"}</span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="empty-block">
          <div className="empty-block-title">No settled weekends yet</div>
          <p>Complete a weekend in Result Mode to see it appear on the portfolio chart.</p>
        </div>
      ) : (
        <div className="chart-card">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E3B341" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#E3B341" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262E3A" vertical={false} />
              <XAxis dataKey="name" stroke="#8891A0" fontSize={11} tickLine={false} axisLine={{ stroke: "#262E3A" }} />
              <YAxis stroke="#8891A0" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => `$${v.toLocaleString()}`} width={70} />
              <ReferenceLine y={totalPutIn} stroke="#55606F" strokeDasharray="4 4" />
              <Tooltip
                contentStyle={{ background: "#161C25", border: "1px solid #262E3A", borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 12 }}
                labelStyle={{ color: "#E9EDF3" }}
                formatter={(v, key) => [fmtMoney(v), key === "balance" ? "Balance" : key]}
              />
              <Area type="monotone" dataKey="balance" stroke="#E3B341" strokeWidth={2} fill="url(#balFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {completed.length > 0 && (
        <div className="table-card">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Weekend</th><th>Date</th><th>Budget</th><th>Result</th><th>Gain %</th>
              </tr>
            </thead>
            <tbody>
              {[...completed].reverse().map((w) => {
                const a = actual(w);
                const pos = a.profit >= 0;
                return (
                  <tr key={w.id}>
                    <td>{w.label}</td>
                    <td>{fmtDate(w.startDate)}</td>
                    <td>{fmtMoney(w.startingBudget)}</td>
                    <td className={pos ? "pos" : "neg"}>{fmtMoney(a.finalBalance)}</td>
                    <td className={pos ? "pos" : "neg"}>{fmtPct(a.pct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------
   ROOT APP
---------------------------------------------------------------------- */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [data, setData] = useState({ weekends: [] });
  const [view, setView] = useState("dashboard");
  const [activeWeekendId, setActiveWeekendId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await loadUsers();
        setUsers(u);
      } catch (error) {
        setLoadError(error.message || "The ledger could not connect to its database.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectUser = useCallback(async (u) => {
    setCurrentUser(u);
    setView("dashboard");
    const d = await loadUserData(u.id);
    setData(d);
  }, []);

  const addUser = useCallback(async (name) => {
    const newUser = { id: uid(), name, createdAt: Date.now() };
    const savedUser = await createUser(newUser);
    const next = [...users, savedUser];
    setUsers(next);
    selectUser(savedUser);
  }, [users, selectUser]);

  const persist = useCallback((newData) => {
    setData(newData);
    if (currentUser) saveUserData(currentUser.id, newData);
  }, [currentUser]);

  const createWeekend = (w) => persist({ ...data, weekends: [...data.weekends, w] });
  const updateWeekend = (updated) => persist({ ...data, weekends: data.weekends.map((w) => (w.id === updated.id ? updated : w)) });

  const activeWeekend = data.weekends.find((w) => w.id === activeWeekendId);

  if (loading) {
    return (
      <div className="app-shell">
        <style>{CSS}</style>
        <div className="boot-loading">Loading ledger…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app-shell">
        <style>{CSS}</style>
        <div className="boot-loading boot-error">
          <strong>Connection needed</strong>
          <span>{loadError}</span>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <style>{CSS}</style>
      {!currentUser ? (
        <LoginView users={users} onAddUser={addUser} onSelectUser={selectUser} />
      ) : (
        <>
          <Header
            user={currentUser}
            view={activeWeekendId ? "dashboard" : view}
            setView={(v) => { setActiveWeekendId(null); setView(v); }}
            onSwitchUser={() => { setCurrentUser(null); setActiveWeekendId(null); setData({ weekends: [] }); }}
          />
          <div className="app-body">
            {activeWeekend ? (
              <WeekendView weekend={activeWeekend} onUpdate={updateWeekend} onBack={() => setActiveWeekendId(null)} />
            ) : view === "portfolio" ? (
              <PortfolioView weekends={data.weekends} />
            ) : (
              <DashboardView weekends={data.weekends} onOpen={setActiveWeekendId} onCreate={createWeekend} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------
   STYLES
---------------------------------------------------------------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg: #0D1117;
  --bg-alt: #10151C;
  --surface: #161C25;
  --surface-raised: #1C232E;
  --line: #262E3A;
  --text: #E9EDF3;
  --text-dim: #8891A0;
  --gold: #E3B341;
  --gold-dim: #B8924A;
  --win: #34B27B;
  --loss: #E0564C;
  --pending: #55606F;
}
* { box-sizing: border-box; }
html, body, #root { min-height: 100%; margin: 0; background: var(--bg); }
.app-shell {
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  width: 100%;
  border-radius: 0;
  overflow: hidden;
}
.boot-loading { padding: 60px; text-align: center; color: var(--text-dim); font-family: 'IBM Plex Mono', monospace; }
.boot-error { display: flex; min-height: 100vh; align-items: center; justify-content: center; flex-direction: column; gap: 16px; }
.boot-error strong { color: var(--text); font-family: 'Inter', sans-serif; font-size: 20px; }
.boot-error span { max-width: 440px; line-height: 1.6; }

/* ---------- brand ---------- */
.brand-mark {
  width: 44px; height: 44px; border-radius: 8px;
  background: linear-gradient(160deg, var(--gold), var(--gold-dim));
  color: #12161D; font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 16px;
  display: flex; align-items: center; justify-content: center; letter-spacing: 0.5px;
}
.brand-mark-sm { width: 30px; height: 30px; font-size: 12px; border-radius: 6px; }
.brand { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
.brand-name { font-family: 'Oswald', sans-serif; font-size: 22px; letter-spacing: 2px; font-weight: 600; }
.brand-sub { color: var(--text-dim); font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 2px; }

/* ---------- login ---------- */
.login-shell { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px 20px; background: radial-gradient(circle at 50% 0%, #161C25 0%, #0D1117 60%); }
.login-wrap { width: 100%; max-width: 520px; }
.login-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 28px; }
.login-card-head { font-family: 'Oswald', sans-serif; font-size: 15px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 18px; }
.profile-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.profile-card {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  background: var(--surface-raised); border: 1px solid var(--line); border-radius: 10px;
  padding: 18px 10px; cursor: pointer; transition: border-color .15s, transform .15s;
  font-family: 'Inter', sans-serif; color: var(--text);
}
.profile-card:hover { border-color: var(--gold); transform: translateY(-2px); }
.profile-avatar {
  width: 46px; height: 46px; border-radius: 50%; background: linear-gradient(160deg, #2C3646, #1C232E);
  display: flex; align-items: center; justify-content: center; font-family: 'IBM Plex Mono', monospace;
  font-size: 14px; font-weight: 600; color: var(--gold); border: 1px solid var(--line);
}
.profile-avatar-add { color: var(--text-dim); background: transparent; border: 1px dashed var(--line); }
.profile-name { font-size: 13px; text-align: center; }
.profile-card-add { border-style: dashed; }
.empty-note { color: var(--text-dim); font-size: 13px; margin-top: 14px; }

/* ---------- topnav ---------- */
.topnav { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid var(--line); background: var(--bg-alt); }
.topnav-left { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.topnav-brand { font-family: 'Oswald', sans-serif; letter-spacing: 1.5px; font-size: 14px; }
.topnav-mid { display: flex; gap: 4px; }
.nav-link { display: flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--text-dim); font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 7px; cursor: pointer; }
.nav-link:hover { color: var(--text); background: var(--surface); }
.nav-link.active { color: var(--gold); background: var(--surface); }
.topnav-right { display: flex; align-items: center; gap: 10px; }
.user-chip { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--text-dim); background: var(--surface); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line); }

.app-body { padding: 28px 24px 60px; max-width: 980px; margin: 0 auto; }

/* ---------- page ---------- */
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 22px; flex-wrap: wrap; }
.page-title { font-family: 'Oswald', sans-serif; font-size: 26px; font-weight: 600; letter-spacing: 0.5px; margin: 0; }
.page-sub { color: var(--text-dim); font-size: 13px; margin: 4px 0 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.back-link { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--text-dim); font-size: 12px; cursor: pointer; margin-bottom: 14px; padding: 0; }
.back-link:hover { color: var(--text); }
.wv-title-row { display: flex; align-items: center; gap: 10px; }
.inline-edit { background: transparent; border: none; color: var(--gold); font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 0; }
.locked-note { display: inline-flex; align-items: center; gap: 4px; color: var(--text-dim); }

/* ---------- buttons ---------- */
.btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 13px; border-radius: 8px; padding: 10px 16px; cursor: pointer; border: 1px solid transparent; }
.btn-primary { background: var(--gold); color: #14181F; }
.btn-primary:hover { background: #EFC262; }
.btn-primary:disabled { background: #3A3A2E; color: #7A7A6A; cursor: not-allowed; }
.btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--text); }
.btn-ghost:hover { border-color: var(--text-dim); }
.btn-sm { padding: 6px 10px; font-size: 12px; }
.btn-block { width: 100%; justify-content: center; }
.icon-btn { background: transparent; border: none; color: var(--text-dim); cursor: pointer; padding: 4px; border-radius: 6px; }
.icon-btn:hover { color: var(--text); background: var(--surface-raised); }

/* ---------- modal ---------- */
.modal-overlay { position: fixed; inset: 0; background: rgba(6,8,11,0.7); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
.modal { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; width: 100%; max-height: 88vh; overflow-y: auto; }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--line); }
.modal-title { font-family: 'Oswald', sans-serif; font-size: 15px; letter-spacing: 0.5px; }
.modal-body { padding: 18px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

/* ---------- form ---------- */
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field-label { font-size: 12px; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.field-hint { font-size: 11px; color: var(--text-dim); }
.input { background: var(--bg-alt); border: 1px solid var(--line); color: var(--text); border-radius: 7px; padding: 9px 11px; font-size: 14px; font-family: 'Inter', sans-serif; }
.input:focus { outline: none; border-color: var(--gold); }
.form-err { color: var(--loss); font-size: 12px; margin: -6px 0 12px; }
.form-note { font-size: 12px; color: var(--text-dim); margin-bottom: 8px; }
.carry-box { display: flex; justify-content: space-between; align-items: center; background: var(--bg-alt); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
.carry-box-value { font-family: 'IBM Plex Mono', monospace; color: var(--gold); font-weight: 600; }
.compute-preview { background: var(--bg-alt); border: 1px dashed var(--line); border-radius: 8px; padding: 10px 12px; font-size: 13px; color: var(--text-dim); }
.compute-preview b { color: var(--gold); font-family: 'IBM Plex Mono', monospace; }

/* range slider */
.range { -webkit-appearance: none; appearance: none; width: 100%; height: 5px; border-radius: 3px; background: var(--line); outline: none; }
.range.gold::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--gold); border: 2px solid #14181F; cursor: pointer; }
.range.gold::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--gold); border: 2px solid #14181F; cursor: pointer; }

/* ---------- pill / status ---------- */
.pill { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 3px 8px; border-radius: 20px; }
.pill-active { background: rgba(227,179,65,0.15); color: var(--gold); }
.pill-complete { background: rgba(52,178,123,0.15); color: var(--win); }

/* ---------- dashboard weekend list ---------- */
.weekend-list { display: flex; flex-direction: column; gap: 10px; }
.weekend-row { display: flex; align-items: center; gap: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; cursor: pointer; text-align: left; width: 100%; color: var(--text); font-family: 'Inter', sans-serif; }
.weekend-row:hover { border-color: var(--gold-dim); }
.weekend-row-main { flex: 1; min-width: 0; }
.weekend-row-top { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.weekend-row-label { font-family: 'Oswald', sans-serif; font-size: 16px; font-weight: 500; }
.weekend-row-sub { font-size: 12px; color: var(--text-dim); }
.weekend-row-result { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.result-figure { display: flex; align-items: center; gap: 5px; font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 14px; }
.result-pct { font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
.pos { color: var(--win); }
.neg { color: var(--loss); }
.weekend-row-chevron { color: var(--text-dim); flex-shrink: 0; }

.empty-block { background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; padding: 40px 24px; text-align: center; }
.empty-block-title { font-family: 'Oswald', sans-serif; font-size: 16px; margin-bottom: 6px; }
.empty-block p { color: var(--text-dim); font-size: 13px; margin: 0 0 16px; }

/* ---------- tabs ---------- */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
.tab { background: transparent; border: none; color: var(--text-dim); font-family: 'Oswald', sans-serif; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; padding: 10px 4px; margin-right: 22px; cursor: pointer; border-bottom: 2px solid transparent; }
.tab.active { color: var(--gold); border-bottom-color: var(--gold); }

/* ---------- weekend layout ---------- */
.wv-grid { display: grid; grid-template-columns: 1fr 260px; gap: 22px; align-items: start; }
@media (max-width: 760px) { .wv-grid { grid-template-columns: 1fr; } }

/* meter */
.meter-wrap { margin-bottom: 20px; }
.meter-track { display: flex; width: 100%; height: 10px; border-radius: 6px; overflow: hidden; background: var(--surface-raised); border: 1px solid var(--line); }
.meter-seg { height: 100%; }
.meter-seg-free { background: var(--surface-raised); }
.meter-caption { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-top: 6px; font-family: 'IBM Plex Mono', monospace; }

/* games */
.games-list { display: flex; flex-direction: column; gap: 12px; }
.game-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.game-head { display: flex; align-items: center; gap: 10px; width: 100%; background: transparent; border: none; padding: 13px 16px; cursor: pointer; color: var(--text); text-align: left; }
.chev { transition: transform .15s; color: var(--text-dim); flex-shrink: 0; }
.chev.open { transform: rotate(180deg); }
.game-name { font-family: 'Oswald', sans-serif; font-size: 14px; flex: 1; }
.game-team-crest { width: 18px; height: 18px; object-fit: contain; vertical-align: middle; margin: 0 6px; }
.game-name-edit { flex: 1; min-width: 0; background: var(--bg-alt); border: 1px solid var(--line); border-radius: 5px; color: var(--text); font: 500 14px 'Oswald', sans-serif; padding: 4px 7px; }
.game-name-edit:focus, .ticket-edit:focus { outline: none; border-color: var(--gold); }
.game-date { font-size: 11px; color: var(--text-dim); font-family: 'IBM Plex Mono', monospace; }
.game-schedule-edit { display: flex; gap: 5px; }
.game-schedule-edit input { width: 104px; background: var(--bg-alt); border: 1px solid var(--line); border-radius: 5px; color: var(--text); padding: 4px 5px; font: 11px 'IBM Plex Mono', monospace; }
.game-schedule-edit input[type="time"] { width: 72px; }
.game-schedule-edit input:focus { outline: none; border-color: var(--gold); }
.game-count { font-size: 11px; color: var(--text-dim); background: var(--surface-raised); padding: 2px 8px; border-radius: 20px; }
.game-remove { color: var(--text-dim); padding: 4px; border-radius: 6px; display: flex; }
.game-remove:hover { color: var(--loss); }
.game-body { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 10px; }
.game-empty { color: var(--text-dim); font-size: 12px; padding: 8px 4px; }

/* ticket */
.ticket { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto auto; background: var(--bg-alt); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; position: relative; }
.ticket-main { display: flex; flex-direction: column; gap: 2px; }
.ticket-topline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ticket-name { font-size: 13.5px; font-weight: 600; }
.ticket-odds { font-family: 'IBM Plex Mono', monospace; color: var(--gold); font-weight: 600; font-size: 14px; }
.ticket-edit { background: var(--surface); border: 1px solid var(--line); border-radius: 5px; color: var(--text); padding: 4px 7px; font-size: 13px; }
.ticket-name-edit { flex: 1; min-width: 0; font-weight: 600; }
.ticket-multiplier-edit { width: 76px; color: var(--gold); font-family: 'IBM Plex Mono', monospace; }
.ticket-sub { font-size: 11px; color: var(--text-dim); }
.ticket-perf { grid-column: 1 / -1; border-top: 1px dashed var(--line); margin: 10px 0; }
.ticket-stake { grid-column: 1 / -1; }
.ticket-slider-row { display: flex; align-items: center; gap: 12px; }
.ticket-range { flex: 1; }
.ticket-pct { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; color: var(--gold); width: 46px; text-align: right; flex-shrink: 0; }
.ticket-figures { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-dim); margin-top: 8px; font-family: 'IBM Plex Mono', monospace; }
.ticket-figures-static { justify-content: flex-start; gap: 14px; margin-top: 0; }
.projected-toggle { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; color: var(--text-dim); font-size: 11.5px; cursor: pointer; }
.projected-toggle input { accent-color: var(--gold); }
.ticket-remove { position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: var(--text-dim); cursor: pointer; padding: 3px; opacity: 0.6; }
.ticket-remove:hover { color: var(--loss); opacity: 1; }

.wl-toggle { display: flex; gap: 8px; margin-top: 10px; }
.wl-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--text-dim); font-size: 12px; font-weight: 600; cursor: pointer; }
.wl-btn.wl-win.active { background: rgba(52,178,123,0.15); border-color: var(--win); color: var(--win); }
.wl-btn.wl-loss.active { background: rgba(224,86,76,0.15); border-color: var(--loss); color: var(--loss); }
.wl-btn:disabled { cursor: not-allowed; opacity: 0.7; }

.add-instance-btn, .add-game-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: transparent; border: 1px dashed var(--line); color: var(--text-dim); border-radius: 8px; padding: 10px; font-size: 12.5px; cursor: pointer; }
.add-instance-btn:hover, .add-game-btn:hover { border-color: var(--gold-dim); color: var(--gold); }
.add-instance-btn:disabled { cursor: not-allowed; opacity: 0.5; }

/* summary card */
.summary-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
.summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 8px; }
.summary-figures { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.summary-money { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; }
.summary-pct { font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
.summary-detail { font-size: 11.5px; color: var(--text-dim); line-height: 1.5; }
.settled-note { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }

/* portfolio */
.stat-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 22px; }
@media (max-width: 760px) { .stat-strip { grid-template-columns: repeat(2, 1fr); } }
.stat-box { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.stat-label { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 6px; }
.stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 17px; font-weight: 600; }
.stat-value-sm { font-size: 12px; font-weight: 500; }
.chart-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 22px; }
.table-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.ledger-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ledger-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); padding: 12px 16px; border-bottom: 1px solid var(--line); }
.ledger-table td { padding: 11px 16px; border-bottom: 1px solid var(--line); font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; }
.ledger-table tr:last-child td { border-bottom: none; }

/* fixture picker (Add Game modal) */
.seg-toggle { display: flex; background: var(--bg-alt); border: 1px solid var(--line); border-radius: 8px; padding: 3px; margin-bottom: 16px; }
.seg-btn { flex: 1; background: transparent; border: none; color: var(--text-dim); font-family: 'Inter', sans-serif; font-size: 12.5px; font-weight: 600; padding: 8px; border-radius: 6px; cursor: pointer; }
.seg-btn.active { background: var(--gold); color: #14181f; }
.fixture-state { display: flex; align-items: center; gap: 8px; color: var(--text-dim); font-size: 13px; padding: 24px 4px; justify-content: center; text-align: center; }
.fixture-state-error { color: var(--loss); flex-direction: column; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.fixture-list { max-height: 340px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; margin-bottom: 4px; }
.fixture-day-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 6px; }
.fixture-row { display: flex; align-items: center; gap: 8px; width: 100%; background: var(--bg-alt); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; cursor: pointer; margin-bottom: 6px; color: var(--text); font-family: 'Inter', sans-serif; font-size: 12.5px; }
.fixture-row:hover { border-color: var(--gold-dim); }
.fixture-team { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.fixture-team-away { justify-content: flex-end; text-align: right; }
.fixture-crest { width: 16px; height: 16px; object-fit: contain; flex-shrink: 0; }
.fixture-vs { color: var(--text-dim); font-size: 10px; flex-shrink: 0; }
.fixture-time { font-family: 'IBM Plex Mono', monospace; color: var(--gold); font-size: 11px; flex-shrink: 0; width: 54px; text-align: right; }
`;
