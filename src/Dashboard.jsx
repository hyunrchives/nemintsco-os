import { useEffect, useState, useRef, useMemo, Fragment } from 'react';
import { supabase } from './supabaseClient';
import Papa from 'papaparse';
import { Upload, LogOut, Trash2, RefreshCw, Calendar, Trophy, TrendingDown, Download, Wallet, UserPlus, Edit, Printer, CheckCircle, Lock, Unlock, X, Home, Users, Gift, Plus } from 'lucide-react';
import './Dashboard.css';
import './DashboardTabs.css';
import './DashboardDark.css';
import './DashboardPayIncentives.css';

const peso = (n, d = 2) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};
const shortDate = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const weekdayShort = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short' });

// ============ BASIC PAY BRACKETS ============
const BRACKETS = [
  { key: '2200', label: '2,200 and up', basic: 500, ca: 0 },
  { key: '2100', label: '2,100', basic: 400, ca: 100 },
  { key: '2000', label: '2,000', basic: 300, ca: 200 },
  { key: '1900', label: '1,900', basic: 200, ca: 300 },
  { key: '1800', label: '1,800', basic: 100, ca: 400 },
  { key: '1700', label: '1,700', basic: 0, ca: 0 },
];
const bracketLabel = (key) =>
  key === 'custom' ? 'Custom' : (!key || key === 'none') ? '—' : (BRACKETS.find((b) => b.key === key)?.label || key);

const suggestBracket = (earnings) => {
  const e = Number(earnings) || 0;
  if (e >= 2200) return '2200';
  if (e >= 1700) return String(Math.floor(e / 100) * 100);
  return null;
};

// ============ INCENTIVE RULES ============
const IND_TIERS = [
  { min: 4000, rate: 0.10 },
  { min: 2500, rate: 0.05 },
];
const RICE_GROUP_TARGET = 150000;
const RICE_CAPTAIN_KG = 10;
const RICE_MEMBER_KG = 5;
const CAPTAIN_PER_MEMBER_DAY = 10;
const CAPTAIN_WEEK_CAP = 600;
const MAX_MEMBERS = 10;

const individualRate = (earnings) => {
  const e = Number(earnings) || 0;
  const tier = IND_TIERS.find((t) => e >= t.min);
  return tier ? tier.rate : 0;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---------- date helpers ----------
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); };
const mondayOf = (s) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); };

const getPrevPeriod = (start, end) => {
  if (!start || !end) return null;
  const s = new Date(start + 'T00:00:00');
  if (s.getDate() === 1) return [toISO(new Date(s.getFullYear(), s.getMonth() - 1, 16)), toISO(new Date(s.getFullYear(), s.getMonth(), 0))];
  if (s.getDate() === 16) return [toISO(new Date(s.getFullYear(), s.getMonth(), 1)), toISO(new Date(s.getFullYear(), s.getMonth(), 15))];
  const len = Math.round((new Date(end + 'T00:00:00') - s) / 86400000) + 1;
  const prevEnd = addDays(start, -1);
  return [addDays(prevEnd, -(len - 1)), prevEnd];
};

const STATUS_FILTERS = ['All', 'HP', 'MP', 'LP', 'Zombie'];
const DAILY_EXPORT_START = '2026-10-28';
const EMPTY_DRIVER = { sap_id: '', full_name: '', phone: '', vehicle_plate: '', cash_advance: 0, coop_share: 0, other_deductions: 0, sss: 0, pagibig: 0, philhealth: 0, sss_loan: 0, pagibig_loan: 0 };
const EMPTY_GROUP = { id: null, name: '', captain: '', members: [] };

export default function Dashboard({ session }) {
  const [rawDrivers, setDrivers] = useState([]);
  const [rawPayrollDrivers, setPayrollDrivers] = useState([]);
  const [rawIncDrivers, setIncDrivers] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [brackets, setBrackets] = useState({});
  const [groups, setGroups] = useState([]);
  const [bracketsReady, setBracketsReady] = useState('');
  const [breakdownSap, setBreakdownSap] = useState(null);
  const [breakdownOrders, setBreakdownOrders] = useState({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [collapsedDays, setCollapsedDays] = useState(new Set());
  const [openOrders, setOpenOrders] = useState(new Set());

  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [incWeek, setIncWeek] = useState('');

  const [loading, setLoading] = useState(false);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [incLoading, setIncLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exportingDaily, setExportingDaily] = useState(false);
  const fileInputRef = useRef(null);

  const [tab, setTab] = useState('overview');
  const [dailySearch, setDailySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dirSearch, setDirSearch] = useState('');

  const [newDriver, setNewDriver] = useState(EMPTY_DRIVER);
  const [editingSapId, setEditingSapId] = useState(null);
  const [addingDriver, setAddingDriver] = useState(false);

  const [groupForm, setGroupForm] = useState(EMPTY_GROUP);
  const [memberSearch, setMemberSearch] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  const [deletingAll, setDeletingAll] = useState(false);
  const [wipeDirectory, setWipeDirectory] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const CONFIRM_PHRASE = 'DELETE ALL';

  const [periodStatus, setPeriodStatus] = useState('Draft');
  const [payslipDriver, setPayslipDriver] = useState(null);

  const isAdmin = session?.user?.email === 'elen@nemintsco.com';

  const TABS = [
    { id: 'overview', label: 'Overview', icon: <Home size={22} /> },
    { id: 'daily', label: 'Daily Breakdown', icon: <Calendar size={22} /> },
    ...(isAdmin ? [
      { id: 'payroll', label: 'Payroll', icon: <Wallet size={22} /> },
      { id: 'incentives', label: 'Incentives', icon: <Gift size={22} /> },
      { id: 'drivers', label: 'Drivers', icon: <Users size={22} /> },
    ] : []),
  ];
  const activeTab = TABS.some((t) => t.id === tab) ? tab : 'overview';

  const dirMap = useMemo(() => new Map(directory.map((d) => [String(d.sap_id).trim(), d])), [directory]);
  const combinedDirectory = useMemo(() => {
    const list = [...directory];
    const seen = new Set(list.map((d) => String(d.sap_id).trim()));
    [...rawPayrollDrivers, ...rawIncDrivers, ...rawDrivers].forEach((d) => {
      const id = String(d.sap_id).trim();
      if (!seen.has(id)) {
        seen.add(id);
        list.push({
          sap_id: d.sap_id, full_name: d.full_name || 'Unknown Driver', vehicle_plate: d.vehicle_plate || '',
          phone: d.phone || '', cash_advance: 0, coop_share: 0, other_deductions: 0, sss: 0, pagibig: 0, philhealth: 0, sss_loan: 0, pagibig_loan: 0,
        });
      }
    });
    return list.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  }, [directory, rawPayrollDrivers, rawIncDrivers, rawDrivers]);

  const withDirectory = (rows) =>
    rows.map((r) => {
      const e = dirMap.get(String(r.sap_id).trim());
      if (!e) return r;
      return {
        ...r,
        full_name: e.full_name || r.full_name,
        phone: e.phone || r.phone,
        vehicle_plate: e.vehicle_plate || r.vehicle_plate,
        cash_advance: e.cash_advance || 0,
        coop_share: e.coop_share || 0,
        other_deductions: e.other_deductions || 0,
        sss: e.sss || 0,
        pagibig: e.pagibig || 0,
        philhealth: e.philhealth || 0,
        sss_loan: e.sss_loan || 0,
        pagibig_loan: e.pagibig_loan || 0,
      };
    });
  const drivers = useMemo(() => withDirectory(rawDrivers), [rawDrivers, dirMap]);
  const payrollDrivers = useMemo(() => withDirectory(rawPayrollDrivers), [rawPayrollDrivers, dirMap]);
  const incDrivers = useMemo(() => withDirectory(rawIncDrivers), [rawIncDrivers, dirMap]);

  // ============ FETCH DATA ============
  const fetchDirectory = async () => {
    const { data } = await supabase.from('driver_directory').select('*').order('sap_id', { ascending: true });
    if (data) setDirectory(data);
  };

  const fetchGroups = async () => {
    const { data, error } = await supabase.from('incentive_groups').select('*').order('name', { ascending: true });
    if (!error && data) setGroups(data);
  };

  const fetchBrackets = async (start, end) => {
    if (!start || !end) return {};
    let all = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('daily_brackets').select('*').gte('order_date', start).lte('order_date', end).range(from, from + 999);
      if (error || !data) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    const fetched = {};
    all.forEach((r) => { fetched[`${r.sap_id}__${r.order_date}`] = r; });
    setBrackets((prev) => ({ ...prev, ...fetched }));
    return fetched;
  };

  const autoFillBrackets = async (statRows, saved) => {
    const toSave = [];
    statRows.forEach((d) => {
      if (saved[`${d.sap_id}__${d.order_date}`]) return;
      const key = suggestBracket(d.total_pay);
      if (!key) return;
      const b = BRACKETS.find((x) => x.key === key);
      toSave.push({ sap_id: d.sap_id, order_date: d.order_date, bracket: key, basic_rate: b.basic, charge_ca: b.ca, total_pay: round2(b.basic + b.ca) });
    });
    if (toSave.length === 0) return;
    const done = {};
    for (let i = 0; i < toSave.length; i += 500) {
      const chunk = toSave.slice(i, i + 500);
      const { error } = await supabase.from('daily_brackets').upsert(chunk, { onConflict: 'sap_id,order_date' });
      if (error) { console.error('Auto bracket save failed:', error.message); break; }
      chunk.forEach((r) => { done[`${r.sap_id}__${r.order_date}`] = r; });
    }
    setBrackets((prev) => ({ ...prev, ...done }));
  };

  const fetchAvailableDates = async () => {
    const { data, error } = await supabase.from('drivers').select('order_date');
    if (!error && data) {
      const unique = [...new Set(data.map((r) => r.order_date))].sort().reverse();
      setAvailableDates(unique);
      if (unique.length > 0) {
        if (!selectedDate) setSelectedDate(unique[0]);
        if (!startDate && !endDate) {
          setStartDate(unique[unique.length - 1]);
          setEndDate(unique[0]);
        }
        if (!incWeek) setIncWeek(mondayOf(unique[0]));
      }
    }
  };

  const fetchDrivers = async (date) => {
    if (!date) { setDrivers([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('daily_driver_stats').select('*').eq('order_date', date).order('total_pay', { ascending: false });
    if (!error) setDrivers(data || []);
    setLoading(false);
  };

  const fetchPayrollDrivers = async (start, end) => {
    if (!start || !end) return;
    setPayrollLoading(true);
    const { data, error } = await supabase
      .from('daily_driver_stats').select('*').gte('order_date', start).lte('order_date', end);
    const rows = error ? [] : (data || []);
    if (!error) setPayrollDrivers(rows);
    let saved = await fetchBrackets(start, end);
    let allRows = rows;
    const prev = getPrevPeriod(start, end);
    if (prev) {
      const prevSaved = await fetchBrackets(prev[0], prev[1]);
      saved = { ...saved, ...prevSaved };
      const { data: prevData } = await supabase
        .from('daily_driver_stats').select('*').gte('order_date', prev[0]).lte('order_date', prev[1]);
      allRows = [...rows, ...(prevData || [])];
    }
    if (periodStatus !== 'Paid') await autoFillBrackets(allRows, saved);
    setPayrollLoading(false);
  };

  const fetchIncDrivers = async (weekStart) => {
    if (!weekStart) return;
    setIncLoading(true);
    const { data, error } = await supabase
      .from('daily_driver_stats').select('*').gte('order_date', weekStart).lte('order_date', addDays(weekStart, 6));
    if (!error) setIncDrivers(data || []);
    setIncLoading(false);
  };

  useEffect(() => { fetchAvailableDates(); fetchDirectory(); }, []);
  useEffect(() => { if (isAdmin) fetchGroups(); }, [isAdmin]);
  useEffect(() => {
    if (!selectedDate) return;
    setBracketsReady('');
    fetchDrivers(selectedDate);
    if (isAdmin) fetchBrackets(selectedDate, selectedDate).then(() => setBracketsReady(selectedDate));
  }, [selectedDate]);
  useEffect(() => { if (isAdmin && startDate && endDate) fetchPayrollDrivers(startDate, endDate); }, [startDate, endDate, isAdmin]);
  useEffect(() => { if (isAdmin && incWeek) fetchIncDrivers(incWeek); }, [incWeek, isAdmin]);

  useEffect(() => {
    setCollapsedDays(new Set());
    setOpenOrders(new Set());
    if (!breakdownSap || !startDate || !endDate) { setBreakdownOrders({}); return; }
    let cancelled = false;
    (async () => {
      setOrdersLoading(true);
      setOrdersError('');
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('driver_orders').select('*')
          .eq('sap_id', String(breakdownSap)).gte('order_date', startDate).lte('order_date', endDate)
          .order('order_date', { ascending: true }).order('seq', { ascending: true })
          .range(from, from + 999);
        if (error) { if (!cancelled) setOrdersError(error.message); break; }
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      if (cancelled) return;
      const map = {};
      all.forEach((o) => { (map[o.order_date] = map[o.order_date] || []).push(o); });
      setBreakdownOrders(map);
      setOrdersLoading(false);
    })();
    return () => { cancelled = true; };
  }, [breakdownSap, startDate, endDate]);

  // ============ MANUAL BRACKETS ============
  const isLocked = (date) => periodStatus === 'Paid' && startDate && endDate && date >= startDate && date <= endDate;

  const saveBracket = async (sapId, date, key, custom, silent = false) => {
    if (!isAdmin) return;
    if (isLocked(date)) {
      if (!silent) alert('🔒 This date is inside a period marked as PAID. Unlock it in Payroll first.');
      return;
    }
    const k = `${sapId}__${date}`;

    if (key === 'none') {
      setBrackets((prev) => { const next = { ...prev }; delete next[k]; return next; });
      const { error } = await supabase.from('daily_brackets').delete().eq('sap_id', sapId).eq('order_date', date);
      if (error && !silent) alert('Could not clear bracket: ' + error.message);
      return;
    }

    let basic = 0, ca = 0;
    if (key === 'custom') {
      basic = Number(custom?.basic) || 0;
      ca = Number(custom?.ca) || 0;
    } else {
      const b = BRACKETS.find((x) => x.key === key);
      basic = b.basic; ca = b.ca;
    }
    const row = { sap_id: sapId, order_date: date, bracket: key, basic_rate: basic, charge_ca: ca, total_pay: round2(basic + ca) };
    setBrackets((prev) => ({ ...prev, [k]: row }));
    const { error } = await supabase.from('daily_brackets').upsert([row], { onConflict: 'sap_id,order_date' });
    if (error && !silent) alert('Could not save bracket: ' + error.message);
  };

  // ============ AUTO-ASSIGN BRACKETS ============
  useEffect(() => {
    if (!isAdmin || !drivers.length || bracketsReady !== selectedDate) return;
    drivers.forEach((d) => {
      if (d.order_date !== selectedDate) return;
      if (brackets[`${d.sap_id}__${d.order_date}`]) return;
      const suggested = suggestBracket(d.total_pay);
      if (suggested) saveBracket(d.sap_id, d.order_date, suggested, null, true);
    });
  }, [drivers, brackets, isAdmin, bracketsReady, selectedDate]);

  const setCustomLocal = (sapId, date, field, value) => {
    const k = `${sapId}__${date}`;
    setBrackets((prev) => ({ ...prev, [k]: { ...prev[k], [field]: value } }));
  };
  const commitCustom = (sapId, date) => {
    const b = brackets[`${sapId}__${date}`];
    if (b) saveBracket(sapId, date, 'custom', { basic: b.basic_rate, ca: b.charge_ca });
  };

  // ============ ADD / EDIT DRIVER ============
  const handleSaveDriver = async (e) => {
    e.preventDefault();
    setAddingDriver(true);

    const res = await supabase.from('driver_directory').upsert([{
      sap_id: newDriver.sap_id.trim(),
      full_name: newDriver.full_name.trim(),
      phone: newDriver.phone.trim(),
      vehicle_plate: newDriver.vehicle_plate.trim(),
      cash_advance: Number(newDriver.cash_advance) || 0,
      coop_share: Number(newDriver.coop_share) || 0,
      other_deductions: Number(newDriver.other_deductions) || 0,
      sss: Number(newDriver.sss) || 0,
      pagibig: Number(newDriver.pagibig) || 0,
      philhealth: Number(newDriver.philhealth) || 0,
      sss_loan: Number(newDriver.sss_loan) || 0,
      pagibig_loan: Number(newDriver.pagibig_loan) || 0,
    }], { onConflict: 'sap_id' });

    if (res.error) {
      alert('Error saving driver: ' + res.error.message);
    } else {
      alert(editingSapId ? '✅ Driver updated!' : '✅ Driver added!');
      setNewDriver(EMPTY_DRIVER);
      setEditingSapId(null);
      await fetchDirectory();
      if (selectedDate) fetchDrivers(selectedDate);
      if (isAdmin && startDate && endDate) fetchPayrollDrivers(startDate, endDate);
      if (isAdmin && incWeek) fetchIncDrivers(incWeek);
    }
    setAddingDriver(false);
  };

  const handleEditClick = (sapId, existingName = '', existingPlate = '') => {
    const dirEntry = directory.find((d) => d.sap_id === sapId) || {};
    setNewDriver({
      sap_id: sapId,
      full_name: dirEntry.full_name || (existingName === 'Unknown Driver' ? '' : existingName),
      phone: dirEntry.phone || '',
      vehicle_plate: dirEntry.vehicle_plate || existingPlate,
      cash_advance: dirEntry.cash_advance || 0,
      coop_share: dirEntry.coop_share || 0,
      other_deductions: dirEntry.other_deductions || 0,
      sss: dirEntry.sss || 0,
      pagibig: dirEntry.pagibig || 0,
      philhealth: dirEntry.philhealth || 0,
      sss_loan: dirEntry.sss_loan || 0,
      pagibig_loan: dirEntry.pagibig_loan || 0,
    });
    setEditingSapId(sapId);
    setTab('drivers');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => { setNewDriver(EMPTY_DRIVER); setEditingSapId(null); };

  const handleDeleteDriver = async (sapId, name) => {
    if (!window.confirm(`Delete ${name} (SAP ID: ${sapId}) from the directory?`)) return;
    const { error } = await supabase.from('driver_directory').delete().eq('sap_id', sapId);
    if (error) alert('Error deleting driver: ' + error.message);
    else await fetchDirectory();
  };

  // ============ INCENTIVE GROUPS ============
  const toggleMember = (sapId) => {
    setGroupForm((f) => {
      if (f.members.includes(sapId)) return { ...f, members: f.members.filter((m) => m !== sapId) };
      if (f.members.length >= MAX_MEMBERS) { alert(`A group can have up to ${MAX_MEMBERS} members.`); return f; }
      return { ...f, members: [...f.members, sapId] };
    });
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return alert('Enter a group name.');
    if (!groupForm.captain) return alert('Pick the team captain.');
    setSavingGroup(true);
    const payload = {
      name: groupForm.name.trim(),
      captain_sap_id: groupForm.captain,
      member_sap_ids: groupForm.members.filter((m) => m !== groupForm.captain),
    };
    const res = groupForm.id
      ? await supabase.from('incentive_groups').update(payload).eq('id', groupForm.id)
      : await supabase.from('incentive_groups').insert([payload]);
    if (res.error) alert('Error saving group: ' + res.error.message);
    else { setGroupForm(EMPTY_GROUP); setMemberSearch(''); await fetchGroups(); }
    setSavingGroup(false);
  };

  const handleEditGroup = (g) => {
    setGroupForm({ id: g.id, name: g.name, captain: String(g.captain_sap_id), members: (g.member_sap_ids || []).map(String) });
    setMemberSearch('');
  };

  const handleDeleteGroup = async (g) => {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    const { error } = await supabase.from('incentive_groups').delete().eq('id', g.id);
    if (error) alert('Error deleting group: ' + error.message);
    else { if (groupForm.id === g.id) setGroupForm(EMPTY_GROUP); await fetchGroups(); }
  };

  // ============ DELETE ALL DATA ============
  const handleDeleteAll = async () => {
    if (!isAdmin) return alert('Access Denied.');
    if (confirmText.trim().toUpperCase() !== CONFIRM_PHRASE) return;
    if (!window.confirm(`⚠️ Permanently delete ALL uploaded records?`)) return;

    setDeletingAll(true);
    const { error } = await supabase.from('drivers').delete().not('sap_id', 'is', null);
    if (error) {
      alert('Failed to delete: ' + error.message);
      setDeletingAll(false);
      return;
    }
    await supabase.from('daily_brackets').delete().not('sap_id', 'is', null);
    await supabase.from('driver_orders').delete().not('sap_id', 'is', null);
    if (wipeDirectory) await supabase.from('driver_directory').delete().not('sap_id', 'is', null);

    setDrivers([]); setPayrollDrivers([]); setIncDrivers([]); setBrackets({}); setAvailableDates([]);
    setSelectedDate(''); setStartDate(''); setEndDate(''); setIncWeek('');
    handleCancelEdit();
    await fetchDirectory();
    setConfirmText(''); setWipeDirectory(false); setDeletingAll(false);
    alert('✅ All data deleted.');
  };

  // ============ LOGIC ============
  const getTeam = (sapId) => {
    if (!sapId) return 'Unassigned';
    const first = String(sapId).trim().charAt(0);
    if (first === '1') return 'Aldrin';
    if (first === '2') return 'Arnil';
    return 'Unassigned';
  };

  const calculateStatus = (totalPay, orders) => {
    const pay = Number(totalPay) || 0;
    const orderCount = Number(orders) || 0;
    if (pay === 0 || orderCount === 0) return 'Zombie';
    if (pay < 1000) return 'LP';
    if (pay < 3000) return 'MP';
    return 'HP';
  };

  const replaceOrders = async (records, orderRows) => {
    try {
      const byDate = {};
      records.forEach((r) => { (byDate[r.order_date] = byDate[r.order_date] || []).push(r.sap_id); });
      for (const date of Object.keys(byDate)) {
        const ids = byDate[date];
        for (let i = 0; i < ids.length; i += 100) {
          const { error } = await supabase.from('driver_orders').delete().eq('order_date', date).in('sap_id', ids.slice(i, i + 100));
          if (error) return error.message;
        }
      }
      for (let i = 0; i < orderRows.length; i += 500) {
        const { error } = await supabase.from('driver_orders').insert(orderRows.slice(i, i + 500));
        if (error) return error.message;
      }
      return '';
    } catch (err) {
      return err.message || 'unknown error';
    }
  };

  // ============ CSV UPLOAD ============
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!isAdmin) {
      alert('Access Denied. Only admins can upload CSV files.');
      event.target.value = '';
      return;
    }

    if (periodStatus === 'Paid') {
      if (!window.confirm('⚠️ WARNING: You are uploading data for a period marked as PAID. This will alter payroll history. Continue?')) {
        event.target.value = '';
        return;
      }
    }

    setUploading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        const grouped = {};
        const orderRows = [];
        const seqMap = {};

        rows.forEach((row) => {
          const cleanRow = {};
          Object.keys(row).forEach((key) => {
            const cleanKey = key.replace(/^\uFEFF/, '').replace(/\?/g, '').trim();
            cleanRow[cleanKey] = row[key];
          });

          const sapId = cleanRow['Sap Profile Id']?.trim();
          if (!sapId) return;

          let createTime = cleanRow['Create Time']?.trim();
          if (!createTime || createTime.includes('#')) return;

          const parts = createTime.split(' ')[0].split('/');
          if (parts.length !== 3) return;

          const orderDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          const key = `${orderDate}__${sapId}`;

          const driverInfo = directory.find((d) => d.sap_id === sapId) || {};
          let phoneStr = driverInfo.phone || cleanRow['Driver Phone Number'] || '';
          if (phoneStr.includes('E+') || phoneStr.includes('e+')) phoneStr = 'Invalid (Excel E+11)';
          let plateStr = driverInfo.vehicle_plate || cleanRow['Driver Vehicle Plate'] || '';

          const payStr = cleanRow['Total Pay Display'] || cleanRow['Total Pay'] || 0;
          const distStr = cleanRow['Distance'] || 0;
          const pay = parseFloat(payStr.toString().replace(/,/g, '')) || 0;
          const dist = parseFloat(distStr.toString().replace(/,/g, '')) || 0;

          if (!grouped[key]) {
            grouped[key] = { sap_id: sapId, order_date: orderDate, phone: phoneStr, vehicle_plate: plateStr, distance: 0, total_pay: 0, orders_count: 0 };
          }
          grouped[key].distance += dist;
          grouped[key].total_pay += pay;
          grouped[key].orders_count += 1;

          const refKey = Object.keys(cleanRow).find((k) => /order.*(id|no|number|num|#)|^order$|(tracking|delivery|waybill|task|job).*(id|no|number)/i.test(k));
          seqMap[key] = (seqMap[key] || 0) + 1;
          orderRows.push({
            sap_id: sapId, order_date: orderDate, seq: seqMap[key],
            order_ref: refKey ? String(cleanRow[refKey] || '').trim() : '',
            order_time: createTime, distance: dist, total_pay: pay, raw: cleanRow,
          });
        });

        const records = Object.values(grouped).map((d) => ({
          ...d, team: getTeam(d.sap_id), status: calculateStatus(d.total_pay, d.orders_count),
          last_updated: new Date().toISOString(),
        }));

        if (records.length === 0) {
          alert(`❌ No valid rows found.`);
          setUploading(false);
          return;
        }

        const { error } = await supabase.from('drivers').upsert(records, { onConflict: 'sap_id,order_date' });
        if (error) alert('Upload failed: ' + error.message);
        else {
          const dates = [...new Set(records.map((r) => r.order_date))].sort();
          const orderErr = await replaceOrders(records, orderRows);
          alert(`✅ Uploaded ${records.length} records.` + (orderErr ? `\n⚠️ Order details were not saved: ${orderErr}` : `\n${orderRows.length} individual orders saved.`));
          setSelectedDate(dates[dates.length - 1]);
          await fetchAvailableDates();
        }
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => { alert('CSV error: ' + err.message); setUploading(false); },
    });
  };

  const clearCurrentDate = async () => {
    if (!isAdmin) return alert('Access Denied.');
    if (!selectedDate) return;
    if (periodStatus === 'Paid') return alert('🔒 Cannot delete data from a PAID period.');
    if (!window.confirm(`⚠️ DELETE ALL records for ${selectedDate}?`)) return;
    await supabase.from('drivers').delete().eq('order_date', selectedDate);
    await supabase.from('driver_orders').delete().eq('order_date', selectedDate);
    await fetchAvailableDates();
    setDrivers([]);
  };

  const handleLogout = () => supabase.auth.signOut();

  const rowClass = (status) => {
    switch (status) {
      case 'Zombie': return 'row-zombie';
      case 'HP': return 'row-hp';
      case 'MP': return 'row-mp';
      case 'LP': return 'row-lp';
      default: return '';
    }
  };

  // ============ STATS ============
  const stats = useMemo(() => {
    if (!drivers.length) return null;
    const totalDrivers = drivers.length;
    const totalOrders = drivers.reduce((s, d) => s + (d.orders_count || 0), 0);
    const totalKm = drivers.reduce((s, d) => s + Number(d.distance || 0), 0);
    const totalPay = drivers.reduce((s, d) => s + Number(d.total_pay || 0), 0);
    const aldrinCount = drivers.filter((d) => d.team === 'Aldrin').length;
    const arnilCount = drivers.filter((d) => d.team === 'Arnil').length;
    const unassignedCount = totalDrivers - aldrinCount - arnilCount;
    const zombieCount = drivers.filter((d) => d.status === 'Zombie').length;

    const statusCounts = {
      HP: drivers.filter((d) => d.status === 'HP').length,
      MP: drivers.filter((d) => d.status === 'MP').length,
      LP: drivers.filter((d) => d.status === 'LP').length,
      Zombie: zombieCount,
    };
    const sorted = [...drivers].sort((a, b) => Number(b.total_pay) - Number(a.total_pay));
    const topEarners = sorted.filter((d) => Number(d.total_pay) > 0).slice(0, 5);
    const lowEarners = [...drivers].sort((a, b) => Number(a.total_pay) - Number(b.total_pay)).slice(0, 5);

    return {
      totalDrivers, totalOrders, totalKm, totalPay, aldrinCount, arnilCount, unassignedCount, zombieCount,
      statusCounts, topEarners, lowEarners, avgPay: totalPay / totalDrivers,
    };
  }, [drivers]);

  // ============ PAYROLL ============
  const prevPeriod = getPrevPeriod(startDate, endDate);

  const bracketFor = (sapId, date, earnings) => {
    const saved = brackets[`${sapId}__${date}`];
    if (saved) return saved;
    const key = suggestBracket(earnings);
    if (!key) return null;
    const p = BRACKETS.find((x) => x.key === key);
    return { sap_id: sapId, order_date: date, bracket: key, basic_rate: p.basic, charge_ca: p.ca, total_pay: round2(p.basic + p.ca) };
  };

  const payrollData = useMemo(() => {
    const rows = {};
    const ensure = (sapId, d = {}) => {
      const id = String(sapId).trim();
      const dir = dirMap.get(id) || {};
      if (!rows[sapId]) {
        rows[sapId] = {
          sap_id: sapId, full_name: d.full_name || dir.full_name || 'Unknown Driver', team: d.team || getTeam(sapId),
          plate_number: d.vehicle_plate || dir.vehicle_plate || '-',
          days_worked: 0, total_earnings: 0, basic: 0, basic_ca: 0, total_basic: 0,
          prev_ca: 0,
          partial_ca: Number(d.cash_advance ?? dir.cash_advance ?? 0),
          coop_share: Number(d.coop_share ?? dir.coop_share ?? 0),
          other_deductions: Number(d.other_deductions ?? dir.other_deductions ?? 0),
          sss: Number(d.sss ?? dir.sss ?? 0),
          pagibig: Number(d.pagibig ?? dir.pagibig ?? 0),
          philhealth: Number(d.philhealth ?? dir.philhealth ?? 0),
          sss_loan: Number(d.sss_loan ?? dir.sss_loan ?? 0),
          pagibig_loan: Number(d.pagibig_loan ?? dir.pagibig_loan ?? 0),
        };
      }
      return rows[sapId];
    };

    payrollDrivers.forEach((d) => {
      const r = ensure(d.sap_id, d);
      r.total_earnings += Number(d.total_pay || 0);
      const b = bracketFor(d.sap_id, d.order_date, d.total_pay);
      if (b) {
        r.basic += Number(b.basic_rate || 0);
        r.basic_ca += Number(b.charge_ca || 0);
        r.total_basic += Number(b.basic_rate || 0); // EXCLUDED Allowable CA from final pay
        if (Number(b.total_pay) > 0) r.days_worked += 1;
      }
      if (d.vehicle_plate) r.plate_number = d.vehicle_plate;
    });

    if (prevPeriod) {
      Object.values(brackets).forEach((b) => {
        if (b.order_date >= prevPeriod[0] && b.order_date <= prevPeriod[1] && Number(b.charge_ca) > 0) {
          ensure(b.sap_id).prev_ca += Number(b.charge_ca);
        }
      });
    }

    return Object.values(rows).map((r) => {
      const deductions = r.prev_ca + r.partial_ca + r.coop_share + r.other_deductions + r.sss + r.pagibig + r.philhealth + r.sss_loan + r.pagibig_loan;
      return {
        ...r,
        total_earnings: round2(r.total_earnings), basic: round2(r.basic), basic_ca: round2(r.basic_ca),
        total_basic: round2(r.total_basic), prev_ca: round2(r.prev_ca),
        total_deductions: round2(deductions), net_pay: round2(r.total_basic - deductions),
      };
    }).sort((a, b) => String(a.sap_id).localeCompare(String(b.sap_id), undefined, { numeric: true }));
  }, [payrollDrivers, brackets, startDate, endDate, dirMap]);

  const payrollTotals = useMemo(() => ({
    drivers: payrollData.length,
    basic: payrollData.reduce((s, d) => s + d.basic, 0),
    basicCa: payrollData.reduce((s, d) => s + d.basic_ca, 0),
    total: payrollData.reduce((s, d) => s + d.total_basic, 0),
    net: payrollData.reduce((s, d) => s + d.net_pay, 0),
  }), [payrollData]);

  const unsetDays = useMemo(
    () => payrollDrivers.filter((d) => !bracketFor(d.sap_id, d.order_date, d.total_pay)).length,
    [payrollDrivers, brackets]
  );

  const dateRangeString = startDate && endDate ? `${formatDate(startDate)} - ${formatDate(endDate)}` : 'Select Dates';
  const prevRangeString = prevPeriod ? `${formatDate(prevPeriod[0])} - ${formatDate(prevPeriod[1])}` : '';

  // ============ INCENTIVES ============
  const weekOptions = useMemo(
    () => [...new Set(availableDates.map(mondayOf))].sort().reverse(),
    [availableDates]
  );
  const weekDays = useMemo(
    () => (incWeek ? Array.from({ length: 7 }, (_, i) => addDays(incWeek, i)) : []),
    [incWeek]
  );

  const { incentiveRows, groupCards } = useMemo(() => {
    const stat = {};
    const present = new Set();
    incDrivers.forEach((d) => {
      const id = String(d.sap_id).trim();
      present.add(`${id}__${d.order_date}`);
      if (!stat[id]) stat[id] = { earnings: 0, individual: 0, days: 0, name: d.full_name };
      const e = Number(d.total_pay || 0);
      stat[id].earnings += e;
      stat[id].individual += e * individualRate(e);
      stat[id].days += 1;
    });
    const nameOf = (id) => stat[id]?.name || dirMap.get(id)?.full_name || id;

    const cards = groups.map((g) => {
      const captain = String(g.captain_sap_id).trim();
      const members = (g.member_sap_ids || []).map((m) => String(m).trim()).filter((m) => m && m !== captain);
      const perDay = weekDays.map((day) => members.filter((m) => present.has(`${m}__${day}`)).length);
      const rawBonus = perDay.reduce((s, n) => s + n * CAPTAIN_PER_MEMBER_DAY, 0);
      const total = members.reduce((s, m) => s + (stat[m]?.earnings || 0), 0);
      return {
        id: g.id, name: g.name, captain, captainName: nameOf(captain), members,
        perDay, bonus: Math.min(rawBonus, CAPTAIN_WEEK_CAP), rawBonus,
        total, riceOk: total >= RICE_GROUP_TARGET,
        raw: g,
      };
    });

    const roleMap = {};
    cards.forEach((c) => {
      roleMap[c.captain] = { role: 'Captain', group: c.name };
      c.members.forEach((m) => { if (!roleMap[m]) roleMap[m] = { role: 'Member', group: c.name }; });
    });

    const ids = new Set([...Object.keys(stat), ...Object.keys(roleMap)]);
    const rows = [...ids].map((id) => {
      const individual = round2(stat[id]?.individual || 0);
      const captain_bonus = cards.filter((c) => c.captain === id).reduce((s, c) => s + c.bonus, 0);
      const rice_kg = cards.reduce((s, c) => {
        if (!c.riceOk) return s;
        if (c.captain === id) return s + RICE_CAPTAIN_KG;
        return c.members.includes(id) ? s + RICE_MEMBER_KG : s;
      }, 0);
      return {
        sap_id: id, full_name: nameOf(id),
        role: roleMap[id]?.role || '', group_name: roleMap[id]?.group || '',
        week_earnings: round2(stat[id]?.earnings || 0), individual, captain_bonus, rice_kg,
        total_cash: round2(individual + captain_bonus),
      };
    }).sort((a, b) => String(a.sap_id).localeCompare(String(b.sap_id), undefined, { numeric: true }));

    return { incentiveRows: rows, groupCards: cards };
  }, [incDrivers, groups, weekDays, dirMap]);

  const incentiveTotals = useMemo(() => ({
    cash: incentiveRows.reduce((s, r) => s + r.total_cash, 0),
    individual: incentiveRows.reduce((s, r) => s + r.individual, 0),
    captain: incentiveRows.reduce((s, r) => s + r.captain_bonus, 0),
    rice: incentiveRows.reduce((s, r) => s + r.rice_kg, 0),
  }), [incentiveRows]);

  const incWeekRange = incWeek ? `${formatDate(incWeek)} - ${formatDate(addDays(incWeek, 6))}` : 'Select week';
  const incReleaseDate = incWeek ? formatDate(addDays(incWeek, 8)) : '';

  // ============ EXPORT ============
  const downloadCSV = (rows, filename) => {
    const blob = new Blob([Papa.unparse(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    if (!isAdmin) return;
    if (payrollData.length === 0) return alert('No data to export.');
    downloadCSV(payrollData.map((d) => ({
      'SAP ID': d.sap_id,
      'NAME': d.full_name,
      '#DAYS': d.days_worked,
      'Total Earnings': d.total_earnings.toFixed(2),
      'BASIC': d.basic.toFixed(2),
      'ALLOWABLE CA': d.basic_ca.toFixed(2),
      'TOTAL': d.total_basic.toFixed(2),
      'Prev Period CA': d.prev_ca.toFixed(2),
      'CA Partial Payment': d.partial_ca.toFixed(2),
      'Coop Share': d.coop_share.toFixed(2),
      'SSS': d.sss.toFixed(2),
      'Pag-Ibig': d.pagibig.toFixed(2),
      'Philhealth': d.philhealth.toFixed(2),
      'SSS Loan': d.sss_loan.toFixed(2),
      'Pag-Ibig Loan': d.pagibig_loan.toFixed(2),
      'Other Deductions': d.other_deductions.toFixed(2),
      'Total Deductions': d.total_deductions.toFixed(2),
      'Net Pay': d.net_pay.toFixed(2),
      'Date Range': dateRangeString,
      'Status': periodStatus,
    })), `Payroll_${periodStatus}_${startDate}_to_${endDate}.csv`);
  };

  const handleExportPayslipsCSV = () => {
    if (!isAdmin) return;
    if (payrollData.length === 0) return alert('No data to export.');

    const rows = payrollData.map((d) => {
      return {
        'SAP ID': d.sap_id,
        'Driver Name': d.full_name,
        'Plate': d.plate_number,
        'Period': dateRangeString,
        'Status': periodStatus,
        'Days with Basic Pay': d.days_worked,
        'Total Earnings': d.total_earnings.toFixed(2),
        'Basic': d.basic.toFixed(2),
        'Allowable CA': d.basic_ca.toFixed(2),
        'Total Pay': d.total_basic.toFixed(2),
        'Prev Period CA': d.prev_ca.toFixed(2),
        'CA Partial Payment': d.partial_ca.toFixed(2),
        'Coop Share': d.coop_share.toFixed(2),
        'SSS': d.sss.toFixed(2),
        'Pag-Ibig': d.pagibig.toFixed(2),
        'Philhealth': d.philhealth.toFixed(2),
        'SSS Loan': d.sss_loan.toFixed(2),
        'Pag-Ibig Loan': d.pagibig_loan.toFixed(2),
        'Other Deductions': d.other_deductions.toFixed(2),
        'Total Deductions': d.total_deductions.toFixed(2),
        'Net Pay': d.net_pay.toFixed(2),
      };
    });

    downloadCSV(rows, `Payslips_${periodStatus}_${startDate}_to_${endDate}.csv`);
  };

  // ============ PRINT ALL PAYSLIPS (5 per A4 page) ============
  const printAllPayslips = () => {
    if (!isAdmin) return;
    if (payrollData.length === 0) return alert('No data to print.');

    const SLIPS_PER_PAGE = 5;
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const money = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const slips = payrollData.map((d) => {
      const recs = payrollDrivers
        .filter((r) => r.sap_id === d.sap_id)
        .sort((a, b) => a.order_date.localeCompare(b.order_date));

      const rowHtml = (rec) => {
        const b = bracketFor(rec.sap_id, rec.order_date, rec.total_pay);
        const pay = Number(b?.basic_rate || 0); // CA EXCLUDED
        return `<tr>
          <td>${esc(shortDate(rec.order_date))}</td>
          <td class="num">${money(rec.total_pay)}</td>
          <td class="num">${pay ? money(pay) : '-'}</td>
        </tr>`;
      };
      const miniTable = (list) => `<table>
        <thead><tr><th>Date</th><th class="num">Earnings</th><th class="num">Pay</th></tr></thead>
        <tbody>${list.map(rowHtml).join('')}</tbody>
      </table>`;

      const half = Math.ceil(recs.length / 2);
      const left = recs.slice(0, half);
      const right = recs.slice(half);

      return `<section class="slip">
        <div class="slip-head">
          <div><b class="name">${esc(d.full_name)}</b> <span>SAP ${esc(d.sap_id)} · ${esc(d.plate_number)}</span></div>
          <div><span>NEMINTSCO - GSM · ${esc(dateRangeString)} · ${esc(periodStatus)}</span></div>
        </div>
        <div class="slip-body">
          <div class="zone days">
            ${miniTable(left)}
            ${right.length ? miniTable(right) : '<div></div>'}
          </div>

          <div class="zone summary">
            <div class="row"><span>Days w/ basic pay</span><b>${d.days_worked}</b></div>
            <div class="row"><span>Total earnings</span><b>${money(d.total_earnings)}</b></div>
            <div class="row"><span>Basic</span><b>${money(d.basic)}</b></div>
            <div class="row"><span>Allowable CA</span><b>${money(d.basic_ca)}</b></div>
            <div class="row strong"><span>Total Pay</span><b>${money(d.total_basic)}</b></div>
            <div class="sig">
              <div>Received: <span class="line">${esc(d.full_name)}</span></div>
              <div>Approved: <span class="line"></span></div>
            </div>
          </div>

          <div class="zone deduct">
            <div class="row"><span>Cash Balance</span><b>-${money(d.prev_ca + d.partial_ca)}</b></div>
            ${d.sss > 0 ? `<div class="row"><span>SSS</span><b>-${money(d.sss)}</b></div>` : ''}
            ${d.pagibig > 0 ? `<div class="row"><span>Pag-Ibig</span><b>-${money(d.pagibig)}</b></div>` : ''}
            ${d.philhealth > 0 ? `<div class="row"><span>Philhealth</span><b>-${money(d.philhealth)}</b></div>` : ''}
            ${d.sss_loan > 0 ? `<div class="row"><span>SSS Loan</span><b>-${money(d.sss_loan)}</b></div>` : ''}
            ${d.pagibig_loan > 0 ? `<div class="row"><span>Pag-Ibig Loan</span><b>-${money(d.pagibig_loan)}</b></div>` : ''}
            ${d.coop_share > 0 ? `<div class="row"><span>Coop Share</span><b>-${money(d.coop_share)}</b></div>` : ''}
            ${d.other_deductions > 0 ? `<div class="row"><span>Other Deductions</span><b>-${money(d.other_deductions)}</b></div>` : ''}
            <div class="row total-ded"><span>Total Deductions</span><b>-${money(d.total_deductions)}</b></div>
            <div class="row net"><span>NET PAY</span><b>${money(d.net_pay)}</b></div>
          </div>
        </div>
      </section>`;
    });

    // group into pages of SLIPS_PER_PAGE
    const pages = [];
    for (let i = 0; i < slips.length; i += SLIPS_PER_PAGE) {
      pages.push(`<div class="page">${slips.slice(i, i + SLIPS_PER_PAGE).join('')}</div>`);
    }

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Payslips ${esc(dateRangeString)}</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: A4 portrait; margin: 6mm; }
        body { font-family: Arial, sans-serif; margin: 0; color: #000; font-size: 7pt; }
        .page { height: 280mm; page-break-after: always; }
        .page:last-child { page-break-after: auto; }

        .slip { height: 56mm; overflow: hidden; padding: 1.5mm 2mm; border-bottom: 1px dashed #888; page-break-inside: avoid; }
        .slip:last-child { border-bottom: none; }

        .slip-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #000; padding-bottom: 1mm; margin-bottom: 1.5mm; }
        .slip-head .name { font-size: 10pt; text-transform: uppercase; margin-right: 6px; }
        .slip-head span { font-size: 7pt; color: #333; }

        .slip-body { display: flex; gap: 3mm; }
        .zone.days { flex: 0 0 98mm; display: flex; gap: 2mm; }
        .zone.days > * { flex: 1; }
        .zone.summary { flex: 0 0 47mm; display: flex; flex-direction: column; }
        .zone.deduct { flex: 1; display: flex; flex-direction: column; }

        table { width: 100%; border-collapse: collapse; font-size: 6.3pt; }
        th, td { border: 1px solid #ccc; padding: 0.3mm 1mm; line-height: 1.25; text-align: left; }
        th { background: #f1f1f1; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

        .row { display: flex; justify-content: space-between; padding: 0.4mm 0; font-size: 7pt; gap: 4px; }
        .row.strong { border-top: 1px solid #000; font-weight: bold; margin-top: 0.5mm; }
        .row.total-ded { border-top: 1px solid #000; font-weight: bold; margin-top: 1mm; }
        .row.net { border-top: 2px solid #000; font-weight: bold; font-size: 9pt; margin-top: 0.5mm; }

        .sig { margin-top: auto; font-size: 6.5pt; display: flex; flex-direction: column; gap: 2.5mm; padding-top: 3mm; }
        .line { border-bottom: 1px solid #000; padding: 0 3px; font-weight: bold; display: inline-block; min-width: 24mm; }
      </style></head><body>${pages.join('')}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const handleExportIncentives = () => {
    if (incentiveRows.length === 0) return alert('No data to export.');
    downloadCSV(incentiveRows.map((r) => ({
      'SAP ID': r.sap_id,
      'NAME': r.full_name,
      'Group': r.group_name || '-',
      'Role': r.role || '-',
      'Week Earnings': r.week_earnings.toFixed(2),
      'Individual Incentive': r.individual.toFixed(2),
      'Captain Bonus': r.captain_bonus.toFixed(2),
      'Rice (kg)': r.rice_kg,
      'Total Cash Incentive': r.total_cash.toFixed(2),
      'Week': incWeekRange,
      'Release Date': incReleaseDate,
    })), `Incentives_${incWeek}.csv`);
  };

  const handleExportDaily = async () => {
    if (!isAdmin) return;
    const latest = availableDates[0];
    if (!latest || latest < DAILY_EXPORT_START) return alert(`No data from ${formatDate(DAILY_EXPORT_START)} onward.`);
    setExportingDaily(true);
    try {
      let stats = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('daily_driver_stats').select('*')
          .gte('order_date', DAILY_EXPORT_START).lte('order_date', latest)
          .order('order_date', { ascending: true }).order('sap_id', { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        stats = stats.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
      }

      const saved = {};
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('daily_brackets').select('*')
          .gte('order_date', DAILY_EXPORT_START).lte('order_date', latest)
          .order('order_date', { ascending: true }).order('sap_id', { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        (data || []).forEach((r) => { saved[`${r.sap_id}__${r.order_date}`] = r; });
        if (!data || data.length < 1000) break;
        from += 1000;
      }

      if (stats.length === 0) return alert('No data to export.');

      const rows = withDirectory(stats)
        .sort((a, b) => a.order_date.localeCompare(b.order_date) || String(a.sap_id).localeCompare(String(b.sap_id), undefined, { numeric: true }))
        .map((d) => {
          const b = saved[`${d.sap_id}__${d.order_date}`];
          const key = b?.bracket || suggestBracket(d.total_pay) || 'none';
          const preset = BRACKETS.find((x) => x.key === key);
          const basic = b ? Number(b.basic_rate || 0) : (preset?.basic || 0);
          const ca = b ? Number(b.charge_ca || 0) : (preset?.ca || 0);
          return {
            'Date': d.order_date,
            'SAP ID': d.sap_id,
            'Driver Name': d.full_name || 'Unknown Driver',
            'Team': d.team,
            'Plate': d.vehicle_plate || '',
            'Orders': d.orders_count,
            'Total Pay (Earnings)': Number(d.total_pay || 0).toFixed(2),
            'Distance (km)': Number(d.distance || 0).toFixed(1),
            'Status': d.status,
            'Bracket': bracketLabel(key),
            'Basic': basic.toFixed(2),
            'Allowable CA': ca.toFixed(2),
            'Pay': round2(basic).toFixed(2),
            'Bracket Source': b ? 'Saved' : (key === 'none' ? 'None' : 'Auto'),
          };
        });

      downloadCSV(rows, `Daily_Breakdown_${DAILY_EXPORT_START}_to_${latest}.csv`);
    } catch (err) {
      alert('Export failed: ' + (err.message || err));
    } finally {
      setExportingDaily(false);
    }
  };

  // ============ PAYSLIP / BREAKDOWN ============
  const openPayslip = (driver) => {
    const recs = payrollDrivers
      .filter((d) => d.sap_id === driver.sap_id)
      .sort((a, b) => a.order_date.localeCompare(b.order_date));
    const weeksMap = {};
    recs.forEach((rec) => {
      const b = bracketFor(rec.sap_id, rec.order_date, rec.total_pay);
      const w = mondayOf(rec.order_date);
      if (!weeksMap[w]) weeksMap[w] = { start: w, rows: [], earnings: 0, basic: 0, ca: 0, total: 0 };
      const wk = weeksMap[w];
      const row = {
        date: rec.order_date, earnings: Number(rec.total_pay || 0), bracket: b?.bracket || 'none',
        basic: Number(b?.basic_rate || 0), ca: Number(b?.charge_ca || 0), 
        total: Number(b?.basic_rate || 0), // CA EXCLUDED
      };
      wk.rows.push(row);
      wk.earnings += row.earnings; wk.basic += row.basic; wk.ca += row.ca; wk.total += row.total;
    });
    setPayslipDriver({ ...driver, weeks: Object.values(weeksMap).sort((a, b) => a.start.localeCompare(b.start)) });
  };

  const breakdownData = useMemo(() => {
    if (!breakdownSap) return null;
    const recs = payrollDrivers
      .filter((d) => String(d.sap_id) === String(breakdownSap))
      .sort((a, b) => a.order_date.localeCompare(b.order_date));
    const dir = dirMap.get(String(breakdownSap).trim()) || {};
    const first = recs[0] || {};
    const totals = { earnings: 0, orders: 0, km: 0, basic: 0, ca: 0, pay: 0, paidDays: 0 };
    const weeksMap = {};
    let running = 0;
    recs.forEach((rec) => {
      const b = bracketFor(rec.sap_id, rec.order_date, rec.total_pay);
      const rowTotal = Number(b?.basic_rate || 0); // CA EXCLUDED
      const row = {
        date: rec.order_date, earnings: Number(rec.total_pay || 0), orders: Number(rec.orders_count || 0),
        km: Number(rec.distance || 0), bracket: b?.bracket || 'none',
        basic: Number(b?.basic_rate || 0), ca: Number(b?.charge_ca || 0), pay: rowTotal,
      };
      running += row.pay;
      row.running = running;
      const w = mondayOf(rec.order_date);
      if (!weeksMap[w]) weeksMap[w] = { start: w, rows: [], earnings: 0, orders: 0, km: 0, basic: 0, ca: 0, pay: 0 };
      const wk = weeksMap[w];
      wk.rows.push(row);
      ['earnings', 'orders', 'km', 'basic', 'ca', 'pay'].forEach((f) => { wk[f] += row[f]; totals[f] += row[f]; });
      if (row.pay > 0) totals.paidDays += 1;
    });
    return {
      sap_id: breakdownSap,
      full_name: first.full_name || dir.full_name || 'Unknown Driver',
      team: first.team || getTeam(breakdownSap),
      plate: first.vehicle_plate || dir.vehicle_plate || '-',
      days: recs.length, totals,
      weeks: Object.values(weeksMap).sort((a, b) => a.start.localeCompare(b.start)),
    };
  }, [breakdownSap, payrollDrivers, brackets, dirMap]);

  const toggleDay = (date) => setCollapsedDays((prev) => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n; });
  const toggleOrder = (id) => setOpenOrders((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const orderTime = (o) => { const t = String(o.order_time || '').trim(); const parts = t.split(' '); return parts.length > 1 ? parts.slice(1).join(' ') : t; };

  const openPayslipFromBreakdown = () => {
    const row = payrollData.find((p) => String(p.sap_id) === String(breakdownSap));
    if (!row) return;
    setBreakdownSap(null);
    openPayslip(row);
  };

  // ============ FILTERS ============
  const filteredDaily = useMemo(() => {
    const q = dailySearch.trim().toLowerCase();
    return drivers.filter((d) => {
      if (statusFilter !== 'All' && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(d.full_name || '').toLowerCase().includes(q) ||
        String(d.sap_id || '').toLowerCase().includes(q) ||
        String(d.vehicle_plate || '').toLowerCase().includes(q)
      );
    });
  }, [drivers, dailySearch, statusFilter]);

  const filteredDirectory = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    if (!q) return combinedDirectory;
    return combinedDirectory.filter((d) =>
      String(d.full_name || '').toLowerCase().includes(q) ||
      String(d.sap_id || '').toLowerCase().includes(q) ||
      String(d.vehicle_plate || '').toLowerCase().includes(q)
    );
  }, [combinedDirectory, dirSearch]);

  const memberChoices = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return combinedDirectory.filter((d) => {
      if (String(d.sap_id) === groupForm.captain) return false;
      if (!q) return true;
      return String(d.full_name || '').toLowerCase().includes(q) || String(d.sap_id || '').toLowerCase().includes(q);
    });
  }, [combinedDirectory, memberSearch, groupForm.captain]);

  // ---------- view helpers ----------
  const rawName = (session?.user?.email || 'there').split('@')[0];
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const pct = (n) => (stats?.totalDrivers ? Math.round((n / stats.totalDrivers) * 100) : 0);

  const RING_R = 62, RING_C = 2 * Math.PI * RING_R;
  const ringSeg = (count) => (stats?.totalDrivers ? (count / stats.totalDrivers) * RING_C : 0);
  const aldrinLen = ringSeg(stats?.aldrinCount);
  const arnilLen = ringSeg(stats?.arnilCount);
  const unassignedLen = ringSeg(stats?.unassignedCount);
  const maxStatus = stats ? Math.max(1, ...Object.values(stats.statusCounts)) : 1;

  const toolbar = (
    <div className="rv-controls">
      {isAdmin && (
        <>
          <input type="file" accept=".csv" onChange={handleFileUpload} ref={fileInputRef} style={{ display: 'none' }} id="csv-upload" />
          <label htmlFor="csv-upload" className={`rv-pill-btn primary ${uploading ? 'disabled' : ''}`}>
            <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload CSV'}
          </label>
        </>
      )}

      <div className="rv-select">
        <Calendar size={16} />
        <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} disabled={availableDates.length === 0} aria-label="Select date">
          {availableDates.length === 0 && <option>No data yet</option>}
          {availableDates.map((d) => (
            <option key={d} value={d}>
              {new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      <div className="rv-controls-end">
        <button onClick={() => fetchDrivers(selectedDate)} className="rv-icon-btn" title="Refresh"><RefreshCw size={17} /></button>
        {isAdmin && (
          <button onClick={clearCurrentDate} className="rv-icon-btn danger" title="Delete this day's records"><Trash2 size={17} /></button>
        )}
      </div>
    </div>
  );

  const editButton = (d, plate) => (
    <button type="button" className="rv-edit-btn" onClick={(e) => { e.stopPropagation(); handleEditClick(d.sap_id, d.full_name, plate); }} title="Edit driver">
      <Edit size={14} />
    </button>
  );

  const bracketCells = (d) => {
    const k = `${d.sap_id}__${d.order_date}`;
    const b = brackets[k];
    const key = b?.bracket || 'none';
    const displayKey = key === 'none' ? (suggestBracket(d.total_pay) || 'none') : key;
    const preset = BRACKETS.find((x) => x.key === displayKey);
    const visualBasic = b ? Number(b.basic_rate || 0) : (preset?.basic || 0);
    const visualCA = b ? Number(b.charge_ca || 0) : (preset?.ca || 0);
    const stop = (e) => e.stopPropagation();

    return (
      <>
        <td onClick={stop}>
          <div className="rv-bracket-cell">
            <select className="rv-mini-select" value={displayKey} onChange={(e) => saveBracket(d.sap_id, d.order_date, e.target.value)} aria-label="Bracket">
              <option value="none">— none —</option>
              {BRACKETS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              <option value="custom">Custom</option>
            </select>
          </div>
        </td>
        <td className="num" onClick={stop}>
          {displayKey === 'custom'
            ? <input type="number" className="rv-mini-input" value={b?.basic_rate ?? 0} onChange={(e) => setCustomLocal(d.sap_id, d.order_date, 'basic_rate', e.target.value)} onBlur={() => commitCustom(d.sap_id, d.order_date)} />
            : displayKey !== 'none' ? peso(visualBasic) : '-'}
        </td>
        <td className="num" onClick={stop}>
          {displayKey === 'custom'
            ? <input type="number" className="rv-mini-input" value={b?.charge_ca ?? 0} onChange={(e) => setCustomLocal(d.sap_id, d.order_date, 'charge_ca', e.target.value)} onBlur={() => commitCustom(d.sap_id, d.order_date)} />
            : displayKey !== 'none' ? peso(visualCA) : '-'}
        </td>
        <td className="num"><strong>{displayKey !== 'none' ? peso(visualBasic) : '-'}</strong></td>
      </>
    );
  };

  return (
    <div className="rv-page">
      <div className="rv-frame">
        {/* ===================== SIDEBAR ===================== */}
        <aside className="rv-side">
          <nav role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                title={t.label}
                aria-label={t.label}
                className={`rv-side-btn ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
              </button>
            ))}
          </nav>
          <button onClick={handleLogout} className="rv-side-btn" title="Logout" aria-label="Logout"><LogOut size={20} /></button>
        </aside>

        <div className="rv-main">
          <header className="rv-top">
            <div className="rv-logo">Nemintsco Depot</div>
            <div className="rv-top-right">
              <span className="rv-user" title={session.user.email}>
                <span className="rv-user-dot">{displayName.charAt(0)}</span>
                <span className="rv-user-email">{session.user.email}</span>
                {isAdmin && <span className="rv-admin">Admin</span>}
              </span>
            </div>
          </header>

          {/* ===================== OVERVIEW ===================== */}
          {activeTab === 'overview' && (
            <>
              <section className="rv-welcome">
                <div className="rv-welcome-left">
                  <h1>Welcome in, {displayName}</h1>
                  {stats && (
                    <div className="rv-pills">
                      {[
                        ['HP', 'High performers', stats.statusCounts.HP, 'p1'],
                        ['MP', 'Mid performers', stats.statusCounts.MP, 'p2'],
                        ['LP', 'Low performers', stats.statusCounts.LP, 'p3'],
                        ['Zombie', 'Zombies 🧟', stats.statusCounts.Zombie, 'p4'],
                      ].map(([key, label, count, cls]) => (
                        <div className="rv-pill-item" key={key}>
                          <span className="rv-pill-label">{label}</span>
                          <span className={`rv-pill-bar ${cls}`} style={{ minWidth: 64 + pct(count) * 1.6 }}>{pct(count)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {stats && (
                  <div className="rv-bignums">
                    <div><strong>{stats.totalDrivers}</strong><span>Drivers</span></div>
                    <div><strong>{stats.totalOrders}</strong><span>Orders</span></div>
                    <div><strong>{Math.round(stats.totalKm)}</strong><span>Kilometers</span></div>
                  </div>
                )}
              </section>

              {toolbar}

              {!stats ? (
                <section className="rv-card">
                  <p className="rv-empty">{loading ? 'Loading...' : selectedDate ? `No data for ${formatDate(selectedDate)}.` : 'No drivers yet. Upload a CSV to begin.'}</p>
                </section>
              ) : (
                <section className="rv-grid">
                  <article className="rv-card rv-earnings">
                    <span className="rv-eyebrow">Total earnings</span>
                    <strong className="rv-money">{peso(stats.totalPay)}</strong>
                    <span className="rv-avg">{peso(stats.avgPay, 0)} avg / driver</span>
                  </article>

                  <article className="rv-card rv-team">
                    <h3>Teams</h3>
                    <div className="rv-ring">
                      <svg viewBox="0 0 160 160">
                        <circle cx="80" cy="80" r={RING_R} className="rv-ring-bg" />
                        <g transform="rotate(-90 80 80)">
                          <circle cx="80" cy="80" r={RING_R} className="rv-ring-seg a" strokeDasharray={`${aldrinLen} ${RING_C}`} strokeDashoffset="0" />
                          <circle cx="80" cy="80" r={RING_R} className="rv-ring-seg b" strokeDasharray={`${arnilLen} ${RING_C}`} strokeDashoffset={-aldrinLen} />
                          <circle cx="80" cy="80" r={RING_R} className="rv-ring-seg c" strokeDasharray={`${unassignedLen} ${RING_C}`} strokeDashoffset={-(aldrinLen + arnilLen)} />
                        </g>
                      </svg>
                      <div className="rv-ring-label"><strong>{stats.totalDrivers}</strong><span>drivers</span></div>
                    </div>
                    <ul className="rv-legend">
                      <li><i className="a" /> Aldrin (OS1) <b>{stats.aldrinCount}</b></li>
                      <li><i className="b" /> Arnil (OS2) <b>{stats.arnilCount}</b></li>
                      {stats.unassignedCount > 0 && <li><i className="c" /> Unassigned <b>{stats.unassignedCount}</b></li>}
                    </ul>
                  </article>

                  <article className="rv-card rv-status">
                    <h3>Performance</h3>
                    <p className="rv-sub">{stats.statusCounts.HP} high · {stats.zombieCount} zombies</p>
                    <div className="rv-bars">
                      {['HP', 'MP', 'LP', 'Zombie'].map((k) => (
                        <div className="rv-bar-col" key={k}>
                          <span className="rv-bar-val">{stats.statusCounts[k]}</span>
                          <div className="rv-bar-track">
                            <div className={`rv-bar-fill ${k.toLowerCase()}`} style={{ height: `${Math.max(6, (stats.statusCounts[k] / maxStatus) * 100)}%` }} />
                          </div>
                          <span className="rv-bar-label">{k === 'Zombie' ? 'ZB' : k}</span>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rv-card rv-top-earners">
                    <div className="rv-card-head"><h3><Trophy size={18} /> Top earners</h3><strong>{stats.topEarners.length}/5</strong></div>
                    {stats.topEarners.length === 0 ? <p className="rv-sub light">No earnings yet.</p> : (
                      <ol>
                        {stats.topEarners.map((d, i) => (
                          <li key={d.sap_id}>
                            <span className="rank">{i + 1}</span>
                            <span className="name"><strong>{d.full_name || d.sap_id}</strong><small>{d.team} · {d.orders_count} orders</small></span>
                            <span className="amount">{peso(d.total_pay)}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>

                  <article className="rv-card rv-low">
                    <div className="rv-card-head"><h3><TrendingDown size={18} /> Lowest earners</h3></div>
                    <ol>
                      {stats.lowEarners.map((d, i) => (
                        <li key={d.sap_id} className={Number(d.total_pay) === 0 ? 'zero' : ''}>
                          <span className="rank">{i + 1}</span>
                          <span className="name"><strong>{d.full_name || d.sap_id}</strong><small>{d.team} · {d.orders_count} orders</small></span>
                          <span className="amount">{peso(d.total_pay)}</span>
                        </li>
                      ))}
                    </ol>
                  </article>
                </section>
              )}
            </>
          )}

          {/* ===================== DAILY BREAKDOWN ===================== */}
          {activeTab === 'daily' && (
            <>
              {toolbar}
              <section className="rv-card rv-table-card">
                <div className="rv-panel-head">
                  <div>
                    <h3>Daily Driver Breakdown</h3>
                    <p className="rv-sub">{selectedDate ? formatDate(selectedDate) : 'No date'} · {filteredDaily.length} of {drivers.length} drivers</p>
                  </div>
                  <div className="rv-panel-tools">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={handleExportDaily}
                        disabled={exportingDaily || availableDates.length === 0}
                        className="rv-pill-btn primary"
                        title={`Export every day from ${formatDate(DAILY_EXPORT_START)} to the latest date`}
                      >
                        <Download size={16} /> {exportingDaily ? 'Exporting...' : `Export from ${shortDate(DAILY_EXPORT_START)}`}
                      </button>
                    )}
                    <input type="search" className="rv-search" placeholder="Search name, SAP ID or plate…" value={dailySearch} onChange={(e) => setDailySearch(e.target.value)} />
                    <div className="rv-filter">
                      {STATUS_FILTERS.map((s) => (
                        <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>{s}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {isAdmin && <p className="rv-note">Brackets are filled in from the day's earnings the first time you open a date. You can still change them with the dropdown, and your changes are kept. <b>Click a driver</b> to see the day-by-day breakdown.</p>}

                {loading ? <p className="rv-empty">Loading...</p> : drivers.length === 0 ? <p className="rv-empty">No data for {selectedDate}.</p> : filteredDaily.length === 0 ? <p className="rv-empty">No drivers match filter.</p> : (
                  <div className="rv-table-scroll">
                    <table className="rv-table">
                      <thead>
                        <tr>
                          <th>Driver Name</th><th>SAP ID</th><th>Team</th><th>Phone</th><th className="num">Orders</th><th className="num">Total Pay</th><th className="num">Distance</th><th>Status</th>
                          {isAdmin && <><th>Bracket</th><th className="num">Basic</th><th className="num">Allowable CA</th><th className="num">Pay</th></>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDaily.map((d) => (
                          <tr key={`${d.sap_id}-${d.order_date}`} className={`${rowClass(d.status)} ${isAdmin ? 'rv-click' : ''}`} onClick={() => isAdmin && setBreakdownSap(d.sap_id)}>
                            <td><div className="rv-driver-cell"><strong>{d.full_name || 'Unknown Driver'}</strong>{isAdmin && editButton(d, d.vehicle_plate)}</div></td>
                            <td>{d.sap_id}</td><td>{d.team}</td><td>{d.phone || '-'}</td>
                            <td className="num">{d.orders_count}</td><td className="num">{peso(d.total_pay)}</td><td className="num">{Number(d.distance).toFixed(1)} km</td>
                            <td><span className={`rv-badge ${String(d.status).toLowerCase()}`}>{d.status}</span></td>
                            {isAdmin && bracketCells(d)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ===================== PAYROLL (admin) ===================== */}
          {activeTab === 'payroll' && isAdmin && (
            <section className="rv-card rv-payroll-section">
              <div className="rv-panel-head">
                <div>
                  <h3><Wallet size={18} /> Payroll</h3>
                  <p className="rv-sub">{dateRangeString} <span className={`rv-period-badge ${periodStatus.toLowerCase()}`}>{periodStatus}</span></p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {periodStatus === 'Draft' && <button onClick={() => setPeriodStatus('Approved')} className="rv-pill-btn" style={{ background: '#eab308', color: 'white', borderColor: '#eab308' }}><CheckCircle size={16} /> Approve</button>}
                  {periodStatus === 'Approved' && <button onClick={() => setPeriodStatus('Paid')} className="rv-pill-btn" style={{ background: '#16a34a', color: 'white', borderColor: '#16a34a' }}><Lock size={16} /> Mark as Paid</button>}
                  {periodStatus === 'Paid' && <button onClick={() => setPeriodStatus('Draft')} className="rv-pill-btn" style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}><Unlock size={16} /> Unlock</button>}
                  <button onClick={handleExportCSV} className="rv-pill-btn primary"><Download size={16} /> Export</button>
                  <button onClick={handleExportPayslipsCSV} className="rv-pill-btn"><Download size={16} /> Export Payslips</button>
                  <button onClick={printAllPayslips} className="rv-pill-btn"><Printer size={16} /> Print All Payslips</button>
                </div>
              </div>

              <div className="rv-payroll-controls">
                <div className="rv-select">
                  <span className="rv-sub" style={{ margin: 0 }}>From</span>
                  <select value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={periodStatus === 'Paid'}>
                    <option value="">Select start date</option>
                    {availableDates.slice().reverse().map((d) => <option key={`start-${d}`} value={d}>{formatDate(d)}</option>)}
                  </select>
                </div>
                <div className="rv-select">
                  <span className="rv-sub" style={{ margin: 0 }}>To</span>
                  <select value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={periodStatus === 'Paid'}>
                    <option value="">Select end date</option>
                    {availableDates.map((d) => <option key={`end-${d}`} value={d}>{formatDate(d)}</option>)}
                  </select>
                </div>
              </div>

              <div className="rv-chips">
                <div className="rv-chip"><span>Drivers</span><strong>{payrollTotals.drivers}</strong></div>
                <div className="rv-chip"><span>Basic</span><strong>{peso(payrollTotals.basic)}</strong></div>
                <div className="rv-chip"><span>Allowable CA</span><strong>{peso(payrollTotals.basicCa)}</strong></div>
                <div className="rv-chip hl"><span>Total Pay</span><strong>{peso(payrollTotals.total)}</strong></div>
                <div className="rv-chip hl" style={{ background: '#16a34a', borderColor: '#16a34a' }}><span>Total Net Pay</span><strong>{peso(payrollTotals.net)}</strong></div>
              </div>

              <p className="rv-note">
                Totals add up the brackets you set in Daily Breakdown. <b>Allowable CA is excluded from Net Pay computations.</b> {unsetDays > 0 ? <b>{unsetDays} driver-days in this period have no bracket yet. </b> : null}
                Deductions = CA charged last period{prevRangeString ? ` (${prevRangeString})` : ''} in full + partial payment of older balance + Coop + SSS + Pag-Ibig + Philhealth + Loans. Click a driver for the day-by-day breakdown.
              </p>

              <div className="rv-table-scroll">
                <table className="rv-table">
                  <thead>
                    <tr>
                      <th>SAP ID</th><th>Name</th><th className="num">#Days</th><th className="num">Earnings</th>
                      <th className="num">Basic</th><th className="num">Allowable CA</th><th className="num">Total Pay</th>
                      <th className="num">Deductions</th><th className="num">Net Pay</th>
                      <th style={{ textAlign: 'center' }}>Slip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollLoading ? <tr><td colSpan="10" className="rv-empty">Calculating totals...</td></tr> : payrollData.length === 0 ? <tr><td colSpan="10" className="rv-empty">No data for this date range.</td></tr> : (
                      payrollData.map((d) => (
                        <tr key={d.sap_id} className="rv-click" onClick={() => setBreakdownSap(d.sap_id)}>
                          <td>{d.sap_id}</td>
                          <td><div className="rv-driver-cell"><strong>{d.full_name}</strong>{editButton(d, d.plate_number)}</div></td>
                          <td className="num"><strong>{d.days_worked}</strong></td>
                          <td className="num">{peso(d.total_earnings)}</td>
                          <td className="num">{peso(d.basic)}</td>
                          <td className="num">{peso(d.basic_ca)}</td>
                          <td className="num"><strong>{peso(d.total_basic)}</strong></td>
                          <td className="num" style={{ color: 'var(--red)' }}>-{peso(d.total_deductions)}</td>
                          <td className="num"><strong className="text-green">{peso(d.net_pay)}</strong></td>
                          <td style={{ textAlign: 'center' }}>
                            <button onClick={(e) => { e.stopPropagation(); openPayslip(d); }} className="rv-edit-btn" style={{ display: 'inline-grid' }} title="View Payslip"><Printer size={14} /></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ===================== INCENTIVES (admin) ===================== */}
          {activeTab === 'incentives' && isAdmin && (
            <>
              <section className="rv-card">
                <div className="rv-panel-head">
                  <div>
                    <h3><Gift size={18} /> Incentives</h3>
                    <p className="rv-sub">{incWeekRange} · Released every Tuesday{incReleaseDate ? ` (${incReleaseDate})` : ''}</p>
                  </div>
                  <button onClick={handleExportIncentives} className="rv-pill-btn primary"><Download size={16} /> Export</button>
                </div>

                <div className="rv-payroll-controls">
                  <div className="rv-select">
                    <span className="rv-sub" style={{ margin: 0 }}>Week (Mon-Sun)</span>
                    <select value={incWeek} onChange={(e) => setIncWeek(e.target.value)} disabled={weekOptions.length === 0}>
                      {weekOptions.length === 0 && <option value="">No data yet</option>}
                      {weekOptions.map((w) => <option key={w} value={w}>{formatDate(w)} - {formatDate(addDays(w, 6))}</option>)}
                    </select>
                  </div>
                </div>

                <div className="rv-chips">
                  <div className="rv-chip hl"><span>Total cash incentives</span><strong>{peso(incentiveTotals.cash)}</strong></div>
                  <div className="rv-chip"><span>Individual</span><strong>{peso(incentiveTotals.individual)}</strong></div>
                  <div className="rv-chip"><span>Captain bonus</span><strong>{peso(incentiveTotals.captain)}</strong></div>
                  <div className="rv-chip"><span>Rice</span><strong>{incentiveTotals.rice} kg</strong></div>
                </div>

                <p className="rv-note">
                  <b>Individual</b> (per day): {IND_TIERS.map((t) => `₱${t.min.toLocaleString()}+ = ${t.rate * 100}%`).join(', ')}.{' '}
                  <b>Captain</b>: ₱{CAPTAIN_PER_MEMBER_DAY} per group member that has a record that day (10 members = ₱100/day, max ₱{CAPTAIN_WEEK_CAP}/week).{' '}
                  <b>Rice</b>: group members' combined earnings reach ₱{RICE_GROUP_TARGET.toLocaleString()} for the week → captain {RICE_CAPTAIN_KG} kg, members {RICE_MEMBER_KG} kg.
                </p>
              </section>

              <section className="rv-card">
                <div className="rv-panel-head">
                  <h3><Users size={18} /> {groupForm.id ? 'Edit group' : 'New group'}</h3>
                  {groupForm.id && <button type="button" onClick={() => setGroupForm(EMPTY_GROUP)} className="rv-link-danger">Cancel edit</button>}
                </div>
                <form onSubmit={handleSaveGroup} className="rv-group-form">
                  <label className="rv-field"><span>Group name</span>
                    <input type="text" placeholder="e.g. Group 1" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} required />
                  </label>
                  <label className="rv-field"><span>Team captain</span>
                    <select className="rv-input-select" value={groupForm.captain} onChange={(e) => setGroupForm({ ...groupForm, captain: e.target.value, members: groupForm.members.filter((m) => m !== e.target.value) })} required>
                      <option value="">Select captain…</option>
                      {combinedDirectory.map((d) => <option key={d.sap_id} value={String(d.sap_id)}>{d.sap_id} · {d.full_name}</option>)}
                    </select>
                  </label>
                  <div className="rv-field rv-members">
                    <span>Members ({groupForm.members.length}/{MAX_MEMBERS})</span>
                    <input type="search" placeholder="Search drivers to add…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                    {groupForm.members.length > 0 && (
                      <div className="rv-sel-chips">
                        {groupForm.members.map((m) => (
                          <button type="button" key={m} className="rv-sel-chip" onClick={() => toggleMember(m)} title="Remove">
                            {combinedDirectory.find((x) => String(x.sap_id) === m)?.full_name || m} <X size={12} />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="rv-member-list">
                      {memberChoices.length === 0 ? <p className="rv-empty" style={{ padding: 12 }}>No drivers found.</p> : memberChoices.map((d) => {
                        const id = String(d.sap_id);
                        return (
                          <label key={id} className={`rv-member-row ${groupForm.members.includes(id) ? 'on' : ''}`}>
                            <input type="checkbox" checked={groupForm.members.includes(id)} onChange={() => toggleMember(id)} />
                            <span>{d.full_name}</span><small>SAP {id}</small>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <button type="submit" className="rv-pill-btn primary rv-form-submit" disabled={savingGroup}>
                    {savingGroup ? 'Saving...' : groupForm.id ? 'Update group' : <><Plus size={16} /> Add group</>}
                  </button>
                </form>
              </section>

              {groupCards.length > 0 && (
                <section className="rv-card">
                  <div className="rv-panel-head"><div><h3>Groups this week</h3><p className="rv-sub">Captain bonus follows who has a record each day · rice target {peso(RICE_GROUP_TARGET, 0)}</p></div></div>
                  <div className="rv-group-grid">
                    {groupCards.map((g) => (
                      <div key={g.id} className={`rv-group ${g.riceOk ? 'ok' : ''}`}>
                        <div className="rv-group-top">
                          <strong>{g.name}</strong>
                          <span>{g.riceOk ? 'Rice qualified' : 'Rice not yet'}</span>
                        </div>
                        <small>Captain: <b>{g.captainName}</b> · {g.members.length} members</small>
                        <div className="rv-days">
                          {weekDays.map((day, i) => (
                            <div key={day} className="rv-day">
                              <small>{weekdayShort(day)}</small>
                              <b>{g.perDay[i]}</b>
                              <small>{peso(g.perDay[i] * CAPTAIN_PER_MEMBER_DAY, 0)}</small>
                            </div>
                          ))}
                        </div>
                        <div className="rv-group-top"><small>Captain bonus</small><strong>{peso(g.bonus)}</strong></div>
                        <div className="rv-progress"><i style={{ width: `${Math.min(100, (g.total / RICE_GROUP_TARGET) * 100)}%` }} /></div>
                        <small>{peso(g.total, 0)} of {peso(RICE_GROUP_TARGET, 0)}</small>
                        <div className="rv-group-actions">
                          <button type="button" className="rv-edit-btn" onClick={() => handleEditGroup(g.raw)} title="Edit group"><Edit size={14} /></button>
                          <button type="button" className="rv-edit-btn danger" onClick={() => handleDeleteGroup(g.raw)} title="Delete group"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {groupCards.length === 0 && (
                <section className="rv-card"><p className="rv-empty">No groups yet. Add a captain and members above to start the group incentives.</p></section>
              )}

              <section className="rv-card rv-table-card">
                <div className="rv-table-scroll">
                  <table className="rv-table">
                    <thead>
                      <tr>
                        <th>SAP ID</th><th>Name</th><th>Group</th>
                        <th className="num">Week Earnings</th><th className="num">Individual</th>
                        <th className="num">Captain</th><th className="num">Rice</th><th className="num">Cash Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incLoading ? <tr><td colSpan="8" className="rv-empty">Calculating...</td></tr> : incentiveRows.length === 0 ? <tr><td colSpan="8" className="rv-empty">No data for this week.</td></tr> : (
                        incentiveRows.map((r) => (
                          <tr key={r.sap_id}>
                            <td>{r.sap_id}</td>
                            <td><div className="rv-driver-cell"><strong>{r.full_name}</strong>{r.role === 'Captain' && <span className="rv-badge hp">Captain</span>}</div></td>
                            <td>{r.group_name || '-'}</td>
                            <td className="num">{peso(r.week_earnings)}</td>
                            <td className="num">{r.individual ? peso(r.individual) : '-'}</td>
                            <td className="num">{r.captain_bonus ? peso(r.captain_bonus) : '-'}</td>
                            <td className="num">{r.rice_kg ? `${r.rice_kg} kg` : '-'}</td>
                            <td className="num"><strong className="text-green">{peso(r.total_cash)}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ===================== DRIVERS (admin) ===================== */}
          {activeTab === 'drivers' && isAdmin && (
            <>
              <section className="rv-card">
                <div className="rv-panel-head">
                  <h3><UserPlus size={18} /> {editingSapId ? 'Edit Driver' : 'Register New Driver'}</h3>
                  {editingSapId && <button type="button" onClick={handleCancelEdit} className="rv-link-danger">Cancel edit</button>}
                </div>
                <form onSubmit={handleSaveDriver} className="rv-form">
                  <label className="rv-field"><span>SAP ID</span><input type="text" placeholder="e.g. 122" value={newDriver.sap_id} onChange={(e) => setNewDriver({ ...newDriver, sap_id: e.target.value })} required disabled={!!editingSapId} /></label>
                  <label className="rv-field wide"><span>Full name</span><input type="text" placeholder="Full name" value={newDriver.full_name} onChange={(e) => setNewDriver({ ...newDriver, full_name: e.target.value })} required /></label>
                  <label className="rv-field"><span>Phone number</span><input type="text" placeholder="09xx xxx xxxx" value={newDriver.phone} onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })} /></label>
                  <label className="rv-field"><span>Plate number</span><input type="text" placeholder="ABC 1234" value={newDriver.vehicle_plate} onChange={(e) => setNewDriver({ ...newDriver, vehicle_plate: e.target.value })} /></label>
                  
                  <label className="rv-field"><span>CA partial payment (₱)</span><input type="number" placeholder="0.00" value={newDriver.cash_advance} onChange={(e) => setNewDriver({ ...newDriver, cash_advance: e.target.value })} /></label>
                  <label className="rv-field"><span>Coop Share (₱)</span><input type="number" placeholder="0.00" value={newDriver.coop_share} onChange={(e) => setNewDriver({ ...newDriver, coop_share: e.target.value })} /></label>
                  
                  <label className="rv-field"><span>SSS (₱)</span><input type="number" placeholder="0.00" value={newDriver.sss} onChange={(e) => setNewDriver({ ...newDriver, sss: e.target.value })} /></label>
                  <label className="rv-field"><span>Pag-Ibig (₱)</span><input type="number" placeholder="0.00" value={newDriver.pagibig} onChange={(e) => setNewDriver({ ...newDriver, pagibig: e.target.value })} /></label>
                  <label className="rv-field"><span>Philhealth (₱)</span><input type="number" placeholder="0.00" value={newDriver.philhealth} onChange={(e) => setNewDriver({ ...newDriver, philhealth: e.target.value })} /></label>
                  <label className="rv-field"><span>SSS Loan (₱)</span><input type="number" placeholder="0.00" value={newDriver.sss_loan} onChange={(e) => setNewDriver({ ...newDriver, sss_loan: e.target.value })} /></label>
                  <label className="rv-field"><span>Pag-Ibig Loan (₱)</span><input type="number" placeholder="0.00" value={newDriver.pagibig_loan} onChange={(e) => setNewDriver({ ...newDriver, pagibig_loan: e.target.value })} /></label>
                  
                  <label className="rv-field"><span>Other Deductions (₱)</span><input type="number" placeholder="0.00" value={newDriver.other_deductions} onChange={(e) => setNewDriver({ ...newDriver, other_deductions: e.target.value })} /></label>
                  
                  <button type="submit" className="rv-pill-btn primary rv-form-submit" disabled={addingDriver}>{addingDriver ? 'Saving...' : (editingSapId ? 'Update Driver' : 'Add Driver')}</button>
                </form>
              </section>

              <section className="rv-card">
                <div className="rv-panel-head">
                  <div><h3>Registered Drivers</h3><p className="rv-sub">{filteredDirectory.length} of {combinedDirectory.length} drivers</p></div>
                  <input type="search" className="rv-search" placeholder="Search name, SAP ID or plate…" value={dirSearch} onChange={(e) => setDirSearch(e.target.value)} />
                </div>
                {filteredDirectory.length === 0 ? <p className="rv-empty">{combinedDirectory.length === 0 ? 'No drivers registered yet.' : 'No drivers match your search.'}</p> : (
                  <div className="rv-dir-grid">
                    {filteredDirectory.map((d) => (
                      <div key={d.sap_id} className={`rv-dir-item ${editingSapId === d.sap_id ? 'editing' : ''}`}>
                        <span className="rv-dir-avatar">{String(d.full_name || d.sap_id).charAt(0).toUpperCase()}</span>
                        <div className="rv-dir-info">
                          <strong>{d.full_name}</strong>
                          <small>SAP {d.sap_id} · {d.vehicle_plate || 'No plate'}</small>
                          <small style={{ color: 'var(--red)' }}>Deductions: ₱{(Number(d.cash_advance) || 0) + (Number(d.coop_share) || 0) + (Number(d.sss) || 0) + (Number(d.pagibig) || 0) + (Number(d.philhealth) || 0) + (Number(d.sss_loan) || 0) + (Number(d.pagibig_loan) || 0) + (Number(d.other_deductions) || 0)}</small>
                        </div>
                        <div className="rv-dir-actions">
                          <button type="button" className="rv-edit-btn" onClick={() => handleEditClick(d.sap_id, d.full_name, d.vehicle_plate)}><Edit size={15} /></button>
                          <button type="button" className="rv-edit-btn danger" onClick={() => handleDeleteDriver(d.sap_id, d.full_name)}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rv-card rv-danger-zone">
                <div className="rv-panel-head">
                  <div><h3><Trash2 size={18} /> Danger zone</h3><p className="rv-sub">Permanently delete every uploaded record and the brackets set on them. This cannot be undone.</p></div>
                </div>
                <label className="rv-check"><input type="checkbox" checked={wipeDirectory} onChange={(e) => setWipeDirectory(e.target.checked)} /><span>Also delete the driver directory ({combinedDirectory.length} drivers)</span></label>
                <div className="rv-danger-row">
                  <label className="rv-field"><span>Type {CONFIRM_PHRASE} to confirm</span><input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={CONFIRM_PHRASE} autoComplete="off" /></label>
                  <button type="button" className="rv-pill-btn rv-danger-btn" onClick={handleDeleteAll} disabled={deletingAll || confirmText.trim().toUpperCase() !== CONFIRM_PHRASE}><Trash2 size={16} /> {deletingAll ? 'Deleting...' : 'Delete all data'}</button>
                </div>
              </section>
            </>
          )}
        </div>{/* /rv-main */}
      </div>{/* /rv-frame */}

      {/* ===================== DRIVER BREAKDOWN MODAL ===================== */}
      {breakdownData && (
        <div className="rv-modal-overlay" onClick={() => setBreakdownSap(null)}>
          <div className="rv-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="rv-modal-head">
              <h2>Driver Breakdown</h2>
              <button onClick={() => setBreakdownSap(null)} className="rv-edit-btn"><X size={18} /></button>
            </div>

            <div className="rv-modal-body">
              <div className="rv-payslip-header">
                <h3>{breakdownData.full_name}</h3>
                <p>SAP ID: {breakdownData.sap_id} · {breakdownData.team} · Plate: {breakdownData.plate}</p>
                <p><strong>Period:</strong> {dateRangeString}</p>
              </div>

              <div className="rv-bd-chips">
                <div className="rv-bd-chip"><span>Days with records</span><strong>{breakdownData.days}</strong></div>
                <div className="rv-bd-chip"><span>Days with pay</span><strong>{breakdownData.totals.paidDays}</strong></div>
                <div className="rv-bd-chip"><span>Total earnings</span><strong>{peso(breakdownData.totals.earnings)}</strong></div>
                <div className="rv-bd-chip hl"><span>Total pay</span><strong>{peso(breakdownData.totals.pay)}</strong></div>
              </div>

              {breakdownData.weeks.length > 0 && (
                <div className="rv-bd-toolbar">
                  <span>Click a day to show or hide its orders</span>
                  <div>
                    <button type="button" className="rv-bd-link" onClick={() => setCollapsedDays(new Set())}>Expand all</button>
                    <button type="button" className="rv-bd-link" onClick={() => setCollapsedDays(new Set(breakdownData.weeks.flatMap((w) => w.rows.map((r) => r.date))))}>Collapse all</button>
                  </div>
                </div>
              )}

              {breakdownData.weeks.length === 0 ? <p className="rv-empty">No records for this driver in the selected period.</p> : (
                <div className="rv-table-scroll">
                  <table className="rv-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Date</th><th className="num">Orders</th><th className="num">Km</th>
                        <th className="num">Earnings</th><th>Bracket</th>
                        <th className="num">Basic</th><th className="num">Allowable CA</th>
                        <th className="num">Pay</th><th className="num">Running total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownData.weeks.map((wk) => (
                        <Fragment key={wk.start}>
                          {wk.rows.map((r) => {
                            const list = breakdownOrders[r.date] || [];
                            const open = !collapsedDays.has(r.date);
                            const listPay = list.reduce((sum, o) => sum + Number(o.total_pay || 0), 0);
                            const listKm = list.reduce((sum, o) => sum + Number(o.distance || 0), 0);
                            return (
                              <Fragment key={r.date}>
                                <tr className={`rv-click ${r.date === selectedDate ? 'sel' : ''}`} onClick={() => toggleDay(r.date)}>
                                  <td><span className="rv-chev">{open ? '▾' : '▸'}</span> {weekdayShort(r.date)}, {formatDate(r.date)}</td>
                                  <td className="num">{r.orders}</td>
                                  <td className="num">{r.km.toFixed(1)}</td>
                                  <td className="num">{peso(r.earnings)}</td>
                                  <td>{bracketLabel(r.bracket)}</td>
                                  <td className="num">{r.pay ? peso(r.basic) : '-'}</td>
                                  <td className="num">{r.ca ? peso(r.ca) : '-'}</td>
                                  <td className="num"><strong>{r.pay ? peso(r.pay) : '-'}</strong></td>
                                  <td className="num">{peso(r.running)}</td>
                                </tr>
                                {open && (
                                  <tr className="rv-orders-row">
                                    <td colSpan="9">
                                      {ordersLoading ? <p className="rv-orders-empty">Loading orders…</p>
                                        : ordersError ? <p className="rv-orders-empty">Could not load orders: {ordersError}</p>
                                        : list.length === 0 ? <p className="rv-orders-empty">No order details stored for this day. Re-upload that day's CSV to see each order.</p>
                                        : (
                                          <table className="rv-orders-table">
                                            <thead>
                                              <tr><th>#</th><th>Time</th><th>Order</th><th className="num">Km</th><th className="num">Pay</th></tr>
                                            </thead>
                                            <tbody>
                                              {list.map((o) => {
                                                const raw = o.raw && typeof o.raw === 'object' ? Object.entries(o.raw).filter(([, v]) => String(v ?? '').trim() !== '') : [];
                                                return (
                                                  <Fragment key={o.id}>
                                                    <tr className="rv-click" onClick={() => toggleOrder(o.id)} title="Click for all CSV fields">
                                                      <td>{o.seq}</td>
                                                      <td>{orderTime(o) || '-'}</td>
                                                      <td>{o.order_ref || '-'}</td>
                                                      <td className="num">{Number(o.distance || 0).toFixed(1)}</td>
                                                      <td className="num">{peso(o.total_pay)}</td>
                                                    </tr>
                                                    {openOrders.has(o.id) && (
                                                      <tr className="rv-order-raw">
                                                        <td colSpan="5">
                                                          <div className="rv-raw-grid">
                                                            {raw.map(([k, v]) => <div key={k}><small>{k}</small><span>{String(v)}</span></div>)}
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    )}
                                                  </Fragment>
                                                );
                                              })}
                                              <tr className="rv-orders-total">
                                                <td colSpan="3">{list.length} order{list.length === 1 ? '' : 's'} = day earnings</td>
                                                <td className="num">{listKm.toFixed(1)}</td>
                                                <td className="num">{peso(listPay)}</td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        )}
                                      {!ordersLoading && !ordersError && list.length > 0 && list.length !== r.orders && (
                                        <p className="rv-orders-empty">Only {list.length} of {r.orders} orders are stored for this day. Re-upload its CSV to refresh.</p>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      ))}
                      <tr className="rv-week-row rv-total-row">
                        <td>Period total</td>
                        <td className="num">{breakdownData.totals.orders}</td>
                        <td className="num">{breakdownData.totals.km.toFixed(1)}</td>
                        <td className="num">{peso(breakdownData.totals.earnings)}</td>
                        <td />
                        <td className="num">{peso(breakdownData.totals.basic)}</td>
                        <td className="num">{peso(breakdownData.totals.ca)}</td>
                        <td className="num">{peso(breakdownData.totals.pay)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <p className="rv-note" style={{ marginTop: 14 }}>
                Total pay <b>{peso(breakdownData.totals.pay)}</b> = Basic <b>{peso(breakdownData.totals.basic)}</b> (Allowable CA excluded), from <b>{breakdownData.totals.paidDays}</b> day(s) with a bracket. Days showing "—" have no bracket yet.
              </p>
            </div>

            <div className="rv-modal-foot" style={{ gap: 10 }}>
              <button onClick={openPayslipFromBreakdown} className="rv-pill-btn"><Wallet size={16} /> Open payslip</button>
              <button onClick={() => window.print()} className="rv-pill-btn primary"><Printer size={16} /> Print</button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== PAYSLIP MODAL ===================== */}
      {payslipDriver && (
        <div className="rv-modal-overlay" onClick={() => setPayslipDriver(null)}>
          <div className="rv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rv-modal-head">
              <h2>Driver Payslip</h2>
              <button onClick={() => setPayslipDriver(null)} className="rv-edit-btn"><X size={18} /></button>
            </div>

            <div className="rv-modal-body" id="print-area">
              <div className="rv-payslip-header">
                <p><strong>NEMINTSCO - GSM</strong></p>
                <h3>{payslipDriver.full_name}</h3>
                <p>SAP ID: {payslipDriver.sap_id} · Plate: {payslipDriver.plate_number}</p>
                <p><strong>Period:</strong> {dateRangeString}</p>
                <p><strong>Status:</strong> {periodStatus}</p>
              </div>

              <div style={{ display: 'flex', gap: '20px', margin: '20px 0' }}>
                <div style={{ flex: 1, background: '#f3f4f6', padding: '12px', borderRadius: '8px' }}>
                  <small style={{ color: '#555' }}>Basic</small>
                  <h3 style={{ margin: 0 }}>{peso(payslipDriver.basic)}</h3>
                </div>
                <div style={{ flex: 1, background: '#f3f4f6', padding: '12px', borderRadius: '8px' }}>
                  <small style={{ color: '#555' }}>Allowable CA</small>
                  <h3 style={{ margin: 0 }}>{peso(payslipDriver.basic_ca)}</h3>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#666', marginTop: '-10px', marginBottom: '20px' }}>Note: Basic CA is not included in Net pay computations.</p>

              <table className="rv-table" style={{ fontSize: '12px', marginTop: '20px' }}>
                <thead>
                  <tr>
                    <th>Date</th><th className="num">Total Earnings</th><th>Bracket</th>
                    <th className="num">Basic Rate</th><th className="num">Allowable CA</th><th className="num">Total Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {payslipDriver.weeks.map((wk) => (
                    <Fragment key={wk.start}>
                      {wk.rows.map((r) => (
                        <tr key={r.date}>
                          <td>{formatDate(r.date)}</td>
                          <td className="num">{peso(r.earnings)}</td>
                          <td>{bracketLabel(r.bracket)}</td>
                          <td className="num">{r.total ? peso(r.basic) : '-'}</td>
                          <td className="num">{r.ca ? peso(r.ca) : '-'}</td>
                          <td className="num">{r.total ? peso(r.total) : '-'}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>

              <div className="rv-payslip-summary" style={{ marginTop: '30px' }}>
                <h4 style={{ borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>Adjustments:</h4>
                <p style={{ minHeight: '30px', color: '#888', fontStyle: 'italic', fontSize: '12px' }}>None</p>

                <h4 style={{ borderBottom: '1px solid #ddd', paddingBottom: '5px', marginTop: '20px' }}>Deductions:</h4>
                <div className="rv-payslip-row"><span>Cash Balance (Prev CA + Partial)</span><strong>-{peso(payslipDriver.prev_ca + payslipDriver.partial_ca)}</strong></div>
                {payslipDriver.sss > 0 && <div className="rv-payslip-row"><span>SSS</span><strong>-{peso(payslipDriver.sss)}</strong></div>}
                {payslipDriver.pagibig > 0 && <div className="rv-payslip-row"><span>Pag-Ibig</span><strong>-{peso(payslipDriver.pagibig)}</strong></div>}
                {payslipDriver.philhealth > 0 && <div className="rv-payslip-row"><span>Philhealth</span><strong>-{peso(payslipDriver.philhealth)}</strong></div>}
                {payslipDriver.sss_loan > 0 && <div className="rv-payslip-row"><span>SSS Loan</span><strong>-{peso(payslipDriver.sss_loan)}</strong></div>}
                {payslipDriver.pagibig_loan > 0 && <div className="rv-payslip-row"><span>Pag-Ibig Loan</span><strong>-{peso(payslipDriver.pagibig_loan)}</strong></div>}
                {payslipDriver.coop_share > 0 && <div className="rv-payslip-row"><span>Coop Share</span><strong>-{peso(payslipDriver.coop_share)}</strong></div>}
                {payslipDriver.other_deductions > 0 && <div className="rv-payslip-row"><span>Other Deductions</span><strong>-{peso(payslipDriver.other_deductions)}</strong></div>}

                <div className="rv-payslip-row" style={{ fontWeight: 'bold', marginTop: '10px', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
                  <span>Total Deductions</span>
                  <strong style={{ color: 'var(--red)' }}>-{peso(payslipDriver.total_deductions)}</strong>
                </div>

                <div className="rv-payslip-row total" style={{ marginTop: '10px', background: '#e6f4ea', padding: '15px', borderRadius: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>Net Pay</span>
                  <strong className="text-green" style={{ fontSize: '18px' }}>{peso(payslipDriver.net_pay)}</strong>
                </div>
              </div>
            </div>

            <div className="rv-modal-foot">
              <button onClick={() => window.print()} className="rv-pill-btn primary">
                <Printer size={16} /> Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}