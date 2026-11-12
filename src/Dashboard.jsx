import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import Papa from 'papaparse';
import { Upload, LogOut, Trash2, RefreshCw, Calendar, Trophy, TrendingDown, Download, Wallet, UserPlus, Edit, Printer, CheckCircle, Lock, Unlock, Clock, X } from 'lucide-react';
import './Dashboard.css';
import './DashboardTabs.css';

const peso = (n, d = 2) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

const STATUS_FILTERS = ['All', 'HP', 'MP', 'LP', 'Zombie'];

export default function Dashboard({ session }) {
  const [rawDrivers, setDrivers] = useState([]);
  const [rawPayrollDrivers, setPayrollDrivers] = useState([]);
  const [directory, setDirectory] = useState([]);

  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Tabs + table filters
  const [tab, setTab] = useState('overview');
  const [dailySearch, setDailySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dirSearch, setDirSearch] = useState('');

  // Driver Form State
  const [newDriver, setNewDriver] = useState({ 
    sap_id: '', full_name: '', phone: '', vehicle_plate: '', 
    cash_advance: 0, coop_share: 0, other_deductions: 0 
  });
  const [editingSapId, setEditingSapId] = useState(null);
  const [addingDriver, setAddingDriver] = useState(false);

  // Danger zone
  const [deletingAll, setDeletingAll] = useState(false);
  const [wipeDirectory, setWipeDirectory] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const CONFIRM_PHRASE = 'DELETE ALL';

  // Payroll Period & Payslip States
  const [periodStatus, setPeriodStatus] = useState('Draft');
  const [payslipDriver, setPayslipDriver] = useState(null); 

  const isAdmin = session?.user?.email === 'elen@nemintsco.com';

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'daily', label: 'Daily Breakdown' },
    ...(isAdmin ? [{ id: 'payroll', label: 'Payroll' }, { id: 'drivers', label: 'Drivers' }] : []),
  ];
  const activeTab = TABS.some((t) => t.id === tab) ? tab : 'overview';

  const dirMap = useMemo(
    () => new Map(directory.map((d) => [String(d.sap_id).trim(), d])),
    [directory]
  );
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
      };
    });
  const drivers = useMemo(() => withDirectory(rawDrivers), [rawDrivers, dirMap]); 
  const payrollDrivers = useMemo(() => withDirectory(rawPayrollDrivers), [rawPayrollDrivers, dirMap]); 

  // ============ FETCH DATA ============
  const fetchDirectory = async () => {
    const { data } = await supabase.from('driver_directory').select('*').order('sap_id', { ascending: true });
    if (data) setDirectory(data);
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
      }
    }
  };

  const fetchDrivers = async (date) => {
    if (!date) { setDrivers([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('daily_driver_stats')
      .select('*')
      .eq('order_date', date)
      .order('total_pay', { ascending: false });
    if (!error) setDrivers(data || []);
    setLoading(false);
  };

  const fetchPayrollDrivers = async (start, end) => {
    if (!start || !end) return;
    setPayrollLoading(true);
    const { data, error } = await supabase
      .from('daily_driver_stats')
      .select('*')
      .gte('order_date', start)
      .lte('order_date', end);
    if (!error) setPayrollDrivers(data || []);
    setPayrollLoading(false);
  };

  useEffect(() => {
    fetchAvailableDates();
    fetchDirectory();
  }, []);

  useEffect(() => { if (selectedDate) fetchDrivers(selectedDate); }, [selectedDate]);
  useEffect(() => { if (isAdmin && startDate && endDate) fetchPayrollDrivers(startDate, endDate); }, [startDate, endDate, isAdmin]);

  // ============ PAY PERIOD PRESETS ============
  const setPeriodPreset = (type) => {
    if (periodStatus === 'Paid') return alert('🔒 This period is locked because it is marked as PAID.');
    if (availableDates.length === 0) return;

    const latestDateStr = availableDates[0];
    const latestDate = new Date(latestDateStr + 'T00:00:00');
    
    if (type === '1st-15th') {
      const y = latestDate.getFullYear();
      const m = String(latestDate.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(`${y}-${m}-15`);
    } else if (type === '16th-End') {
      const y = latestDate.getFullYear();
      const m = latestDate.getMonth();
      const lastDay = new Date(y, m + 1, 0).getDate();
      const mStr = String(m + 1).padStart(2, '0');
      setStartDate(`${y}-${mStr}-16`);
      setEndDate(`${y}-${mStr}-${lastDay}`);
    } else if (type === 'Last 7 Days') {
      const pastDate = new Date(latestDate);
      pastDate.setDate(pastDate.getDate() - 6);
      const pY = pastDate.getFullYear();
      const pM = String(pastDate.getMonth() + 1).padStart(2, '0');
      const pD = String(pastDate.getDate()).padStart(2, '0');
      setStartDate(`${pY}-${pM}-${pD}`);
      setEndDate(latestDateStr);
    }
  };

  // ============ ADD / EDIT DRIVER ============
  const handleSaveDriver = async (e) => {
    e.preventDefault();
    setAddingDriver(true);

    const sapId = newDriver.sap_id.trim();
    const fullName = newDriver.full_name.trim();
    const phone = newDriver.phone.trim();
    const plate = newDriver.vehicle_plate.trim();
    const ca = Number(newDriver.cash_advance) || 0;
    const cs = Number(newDriver.coop_share) || 0;
    const od = Number(newDriver.other_deductions) || 0;

    // ONLY save to driver_directory. We completely ignore updating daily_driver_stats.
    const res = await supabase
      .from('driver_directory')
      .upsert([{ 
        sap_id: sapId, 
        full_name: fullName, 
        phone, 
        vehicle_plate: plate,
        cash_advance: ca,
        coop_share: cs,
        other_deductions: od
      }], { onConflict: 'sap_id' });

    if (res.error) {
      alert('Error saving driver: ' + res.error.message);
    } else {
      alert(editingSapId ? '✅ Driver updated!' : '✅ Driver added!');
      setNewDriver({ sap_id: '', full_name: '', phone: '', vehicle_plate: '', cash_advance: 0, coop_share: 0, other_deductions: 0 });
      setEditingSapId(null);
      
      await fetchDirectory();

      if (selectedDate) fetchDrivers(selectedDate);
      if (isAdmin && startDate && endDate) fetchPayrollDrivers(startDate, endDate);
    }
    setAddingDriver(false);
  };

  const handleEditClick = (sapId, existingName = '', existingPlate = '') => {
    const dirEntry = directory.find((d) => d.sap_id === sapId);
    setNewDriver({
      sap_id: sapId,
      full_name: dirEntry ? dirEntry.full_name : (existingName === 'Unknown Driver' ? '' : existingName),
      phone: dirEntry ? (dirEntry.phone || '') : '',
      vehicle_plate: dirEntry ? (dirEntry.vehicle_plate || '') : existingPlate,
      cash_advance: dirEntry ? (dirEntry.cash_advance || 0) : 0,
      coop_share: dirEntry ? (dirEntry.coop_share || 0) : 0,
      other_deductions: dirEntry ? (dirEntry.other_deductions || 0) : 0,
    });
    setEditingSapId(sapId);
    setTab('drivers');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setNewDriver({ sap_id: '', full_name: '', phone: '', vehicle_plate: '', cash_advance: 0, coop_share: 0, other_deductions: 0 });
    setEditingSapId(null);
  };

  const handleDeleteDriver = async (sapId, name) => {
    if (!window.confirm(`Delete ${name} (SAP ID: ${sapId}) from the directory?`)) return;
    const { error } = await supabase.from('driver_directory').delete().eq('sap_id', sapId);
    if (error) alert('Error deleting driver: ' + error.message);
    else await fetchDirectory();
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
    if (wipeDirectory) await supabase.from('driver_directory').delete().not('sap_id', 'is', null);

    setDrivers([]);
    setPayrollDrivers([]);
    setAvailableDates([]);
    setSelectedDate('');
    setStartDate('');
    setEndDate('');
    handleCancelEdit();
    await fetchDirectory();
    setConfirmText('');
    setWipeDirectory(false);
    setDeletingAll(false);
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
      if (!window.confirm("⚠️ WARNING: You are uploading data for a period marked as PAID. This will alter payroll history. Continue?")) {
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
            grouped[key] = {
              sap_id: sapId, order_date: orderDate, phone: phoneStr, vehicle_plate: plateStr,
              distance: 0, total_pay: 0, orders_count: 0,
            };
          }
          grouped[key].distance += dist;
          grouped[key].total_pay += pay;
          grouped[key].orders_count += 1;
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
          alert(`✅ Uploaded ${records.length} records.`);
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
  const payrollData = useMemo(() => {
    if (!payrollDrivers.length) return [];
    const grouped = {};
    payrollDrivers.forEach((d) => {
      if (!grouped[d.sap_id]) {
        grouped[d.sap_id] = {
          sap_id: d.sap_id, full_name: d.full_name || 'Unknown Driver', team: d.team,
          plate_number: d.vehicle_plate || '-', total_km: 0, total_earnings: 0, total_orders: 0, days_worked: new Set(),
          cash_advance: d.cash_advance || 0,
          coop_share: d.coop_share || 0,
          other_deductions: d.other_deductions || 0,
        };
      }
      grouped[d.sap_id].total_km += Number(d.distance || 0);
      grouped[d.sap_id].total_earnings += Number(d.total_pay || 0);
      grouped[d.sap_id].total_orders += Number(d.orders_count || 0);
      if (d.vehicle_plate) grouped[d.sap_id].plate_number = d.vehicle_plate;
      if (d.order_date) grouped[d.sap_id].days_worked.add(d.order_date);
    });
    
    return Object.values(grouped).map((d) => {
      const totalDeductions = Number(d.cash_advance) + Number(d.coop_share) + Number(d.other_deductions);
      return { 
        ...d, 
        days_worked: d.days_worked.size,
        total_deductions: totalDeductions,
        net_pay: Number(d.total_earnings) - totalDeductions
      };
    }).sort((a, b) => b.total_km - a.total_km);
  }, [payrollDrivers]);

  const payrollTotals = useMemo(() => ({
    drivers: payrollData.length,
    km: payrollData.reduce((s, d) => s + d.total_km, 0),
    earnings: payrollData.reduce((s, d) => s + d.total_earnings, 0),
    net: payrollData.reduce((s, d) => s + d.net_pay, 0),
  }), [payrollData]);

  const dateRangeString = startDate && endDate ? `${formatDate(startDate)} - ${formatDate(endDate)}` : 'Select Dates';

  // ============ EXPORT ============
  const handleExportCSV = () => {
    if (!isAdmin) return;
    if (payrollData.length === 0) return alert('No data to export.');

    const csvData = payrollData.map((d) => ({
      'Date Range': dateRangeString,
      'SAP ID': d.sap_id,
      'Driver Name': d.full_name,
      'Team': d.team,
      'Plate Number': d.plate_number,
      'Days Worked': d.days_worked,
      'Total KM': d.total_km.toFixed(1),
      'Gross Earnings': d.total_earnings.toFixed(2),
      'Cash Advance': d.cash_advance.toFixed(2),
      'Coop Share': d.coop_share.toFixed(2),
      'Other Deductions': d.other_deductions.toFixed(2),
      'Total Deductions': d.total_deductions.toFixed(2),
      'Net Pay': d.net_pay.toFixed(2),
      'Status': periodStatus,
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Payroll_${periodStatus}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ============ OPEN PAYSLIP ============
  const openPayslip = (driver) => {
    const dailyRecords = payrollDrivers
      .filter((d) => d.sap_id === driver.sap_id)
      .sort((a, b) => new Date(a.order_date) - new Date(b.order_date));
    setPayslipDriver({ ...driver, dailyRecords });
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
    if (!q) return directory;
    return directory.filter((d) =>
      String(d.full_name || '').toLowerCase().includes(q) ||
      String(d.sap_id || '').toLowerCase().includes(q) ||
      String(d.vehicle_plate || '').toLowerCase().includes(q)
    );
  }, [directory, dirSearch]);

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
    <button type="button" className="rv-edit-btn" onClick={() => handleEditClick(d.sap_id, d.full_name, plate)} title="Edit driver">
      <Edit size={14} />
    </button>
  );

  return (
    <div className="rv-page">
      <div className="rv-frame">
        <header className="rv-top">
          <div className="rv-logo">Nemintsco Depot</div>
          <nav className="rv-nav" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" className={`rv-nav-pill ${activeTab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="rv-top-right">
            <span className="rv-user" title={session.user.email}>
              <span className="rv-user-dot">{displayName.charAt(0)}</span>
              <span className="rv-user-email">{session.user.email}</span>
              {isAdmin && <span className="rv-admin">Admin</span>}
            </span>
            <button onClick={handleLogout} className="rv-pill-btn"><LogOut size={16} /> <span>Logout</span></button>
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
                  <input type="search" className="rv-search" placeholder="Search name, SAP ID or plate…" value={dailySearch} onChange={(e) => setDailySearch(e.target.value)} />
                  <div className="rv-filter">
                    {STATUS_FILTERS.map((s) => (
                      <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>

              {loading ? <p className="rv-empty">Loading...</p> : drivers.length === 0 ? <p className="rv-empty">No data for {selectedDate}.</p> : filteredDaily.length === 0 ? <p className="rv-empty">No drivers match filter.</p> : (
                <div className="rv-table-scroll">
                  <table className="rv-table">
                    <thead>
                      <tr><th>Driver Name</th><th>SAP ID</th><th>Team</th><th>Phone</th><th className="num">Orders</th><th className="num">Total Pay</th><th className="num">Distance</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {filteredDaily.map((d) => (
                        <tr key={`${d.sap_id}-${d.order_date}`} className={rowClass(d.status)}>
                          <td><div className="rv-driver-cell"><strong>{d.full_name || 'Unknown Driver'}</strong>{isAdmin && editButton(d, d.vehicle_plate)}</div></td>
                          <td>{d.sap_id}</td><td>{d.team}</td><td>{d.phone || '-'}</td>
                          <td className="num">{d.orders_count}</td><td className="num">{peso(d.total_pay)}</td><td className="num">{Number(d.distance).toFixed(1)} km</td>
                          <td><span className={`rv-badge ${String(d.status).toLowerCase()}`}>{d.status}</span></td>
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
                <h3><Wallet size={18} /> Payroll Export</h3>
                <p className="rv-sub">{dateRangeString} <span className={`rv-period-badge ${periodStatus.toLowerCase()}`}>{periodStatus}</span></p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {periodStatus === 'Draft' && <button onClick={() => setPeriodStatus('Approved')} className="rv-pill-btn" style={{ background: '#eab308', color: 'white', borderColor: '#eab308' }}><CheckCircle size={16} /> Approve</button>}
                {periodStatus === 'Approved' && <button onClick={() => setPeriodStatus('Paid')} className="rv-pill-btn" style={{ background: '#16a34a', color: 'white', borderColor: '#16a34a' }}><Lock size={16} /> Mark as Paid</button>}
                {periodStatus === 'Paid' && <button onClick={() => setPeriodStatus('Draft')} className="rv-pill-btn" style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}><Unlock size={16} /> Unlock</button>}
                <button onClick={handleExportCSV} className="rv-pill-btn primary"><Download size={16} /> Export</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <button onClick={() => setPeriodPreset('1st-15th')} className="rv-filter-btn"><Clock size={14} /> 1st - 15th</button>
              <button onClick={() => setPeriodPreset('16th-End')} className="rv-filter-btn"><Clock size={14} /> 16th - End</button>
              <button onClick={() => setPeriodPreset('Last 7 Days')} className="rv-filter-btn"><Clock size={14} /> Last 7 Days</button>
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
              <div className="rv-chip"><span>Total KM</span><strong>{payrollTotals.km.toFixed(1)}</strong></div>
              <div className="rv-chip hl"><span>Total Gross</span><strong>{peso(payrollTotals.earnings)}</strong></div>
              <div className="rv-chip hl" style={{ background: '#16a34a', borderColor: '#16a34a' }}><span>Total Net Pay</span><strong>{peso(payrollTotals.net)}</strong></div>
            </div>

            <div className="rv-table-scroll">
              <table className="rv-table">
                <thead>
                  <tr>
                    <th>Driver Name</th><th>SAP ID</th><th>Team</th><th>Plate Number</th>
                    <th className="num">Days</th><th className="num">Total KM</th><th className="num">Gross Pay</th>
                    <th className="num">Deductions</th><th className="num">Net Pay</th>
                    <th style={{ textAlign: 'center' }}>Payslip</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollLoading ? <tr><td colSpan="10" className="rv-empty">Calculating totals...</td></tr> : payrollData.length === 0 ? <tr><td colSpan="10" className="rv-empty">No data for this date range.</td></tr> : (
                    payrollData.map((d) => (
                      <tr key={d.sap_id}>
                        <td><div className="rv-driver-cell"><strong>{d.full_name}</strong>{editButton(d, d.plate_number)}</div></td>
                        <td>{d.sap_id}</td><td>{d.team}</td><td>{d.plate_number}</td>
                        <td className="num"><strong>{d.days_worked}</strong></td>
                        <td className="num">{d.total_km.toFixed(1)} km</td>
                        <td className="num">{peso(d.total_earnings)}</td>
                        <td className="num" style={{ color: 'var(--red)' }}>-{peso(d.total_deductions)}</td>
                        <td className="num"><strong className="text-green">{peso(d.net_pay)}</strong></td>
                        <td style={{ textAlign: 'center' }}>
                          <button onClick={() => openPayslip(d)} className="rv-edit-btn" style={{ display: 'inline-grid' }} title="View Payslip"><Printer size={14} /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
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
                
                {/* Deductions Row */}
                <label className="rv-field"><span>Cash Advance (₱)</span><input type="number" placeholder="0.00" value={newDriver.cash_advance} onChange={(e) => setNewDriver({ ...newDriver, cash_advance: e.target.value })} /></label>
                <label className="rv-field"><span>Coop Share (₱)</span><input type="number" placeholder="0.00" value={newDriver.coop_share} onChange={(e) => setNewDriver({ ...newDriver, coop_share: e.target.value })} /></label>
                <label className="rv-field"><span>Other Deductions (₱)</span><input type="number" placeholder="0.00" value={newDriver.other_deductions} onChange={(e) => setNewDriver({ ...newDriver, other_deductions: e.target.value })} /></label>
                
                <button type="submit" className="rv-pill-btn primary rv-form-submit" disabled={addingDriver}>{addingDriver ? 'Saving...' : (editingSapId ? 'Update Driver' : 'Add Driver')}</button>
              </form>
            </section>

            <section className="rv-card">
              <div className="rv-panel-head">
                <div><h3>Registered Drivers</h3><p className="rv-sub">{filteredDirectory.length} of {directory.length} drivers</p></div>
                <input type="search" className="rv-search" placeholder="Search name, SAP ID or plate…" value={dirSearch} onChange={(e) => setDirSearch(e.target.value)} />
              </div>
              {filteredDirectory.length === 0 ? <p className="rv-empty">{directory.length === 0 ? 'No drivers registered yet.' : 'No drivers match your search.'}</p> : (
                <div className="rv-dir-grid">
                  {filteredDirectory.map((d) => (
                    <div key={d.sap_id} className={`rv-dir-item ${editingSapId === d.sap_id ? 'editing' : ''}`}>
                      <span className="rv-dir-avatar">{String(d.full_name || d.sap_id).charAt(0).toUpperCase()}</span>
                      <div className="rv-dir-info">
                        <strong>{d.full_name}</strong>
                        <small>SAP {d.sap_id} · {d.vehicle_plate || 'No plate'}</small>
                        <small style={{ color: 'var(--red)' }}>Deductions: ₱{(Number(d.cash_advance)||0) + (Number(d.coop_share)||0) + (Number(d.other_deductions)||0)}</small>
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
                <div><h3><Trash2 size={18} /> Danger zone</h3><p className="rv-sub">Permanently delete every uploaded record. This cannot be undone.</p></div>
              </div>
              <label className="rv-check"><input type="checkbox" checked={wipeDirectory} onChange={(e) => setWipeDirectory(e.target.checked)} /><span>Also delete the driver directory ({directory.length} drivers)</span></label>
              <div className="rv-danger-row">
                <label className="rv-field"><span>Type {CONFIRM_PHRASE} to confirm</span><input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={CONFIRM_PHRASE} autoComplete="off" /></label>
                <button type="button" className="rv-pill-btn rv-danger-btn" onClick={handleDeleteAll} disabled={deletingAll || confirmText.trim().toUpperCase() !== CONFIRM_PHRASE}><Trash2 size={16} /> {deletingAll ? 'Deleting...' : 'Delete all data'}</button>
              </div>
            </section>
          </>
        )}
      </div>

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
                <h3>{payslipDriver.full_name}</h3>
                <p>SAP ID: {payslipDriver.sap_id} · Plate: {payslipDriver.plate_number}</p>
                <p><strong>Period:</strong> {dateRangeString}</p>
                <p><strong>Status:</strong> {periodStatus}</p>
              </div>

              <table className="rv-table" style={{ fontSize: '12px', marginTop: '20px' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Orders</th>
                    <th className="num">Distance</th>
                    <th className="num">Daily Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {payslipDriver.dailyRecords.map((rec) => (
                    <tr key={rec.order_date}>
                      <td>{formatDate(rec.order_date)}</td>
                      <td className="num">{rec.orders_count}</td>
                      <td className="num">{Number(rec.distance).toFixed(1)} km</td>
                      <td className="num">{peso(rec.total_pay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="rv-payslip-summary">
                <div className="rv-payslip-row">
                  <span>Gross Earnings ({payslipDriver.days_worked} days)</span>
                  <strong>{peso(payslipDriver.total_earnings)}</strong>
                </div>
                
                {/* Detailed Deductions */}
                <div style={{ borderTop: '1px solid #e5e7eb', margin: '10px 0', paddingTop: '10px' }}>
                  <div className="rv-payslip-row"><span>Cash Advance</span><strong>-{peso(payslipDriver.cash_advance)}</strong></div>
                  <div className="rv-payslip-row"><span>Coop Share</span><strong>-{peso(payslipDriver.coop_share)}</strong></div>
                  <div className="rv-payslip-row"><span>Other Deductions</span><strong>-{peso(payslipDriver.other_deductions)}</strong></div>
                </div>

                <div className="rv-payslip-row" style={{ fontWeight: 'bold' }}>
                  <span>Total Deductions</span>
                  <strong style={{ color: 'var(--red)' }}>-{peso(payslipDriver.total_deductions)}</strong>
                </div>
                
                <div className="rv-payslip-row total">
                  <span>Net Pay</span>
                  <strong className="text-green">{peso(payslipDriver.net_pay)}</strong>
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