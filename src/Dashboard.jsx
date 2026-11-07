import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import Papa from 'papaparse';
import { Upload, LogOut, Trash2, RefreshCw, Calendar, Trophy, TrendingDown } from 'lucide-react';
import './Dashboard.css';

const peso = (n, d = 2) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export default function Dashboard({ session }) {
  const [drivers, setDrivers] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // 🔒 CHECK IF LOGGED IN USER IS ADMIN
  const isAdmin = session?.user?.email === 'elen@nemintsco.com';

  // ============ FETCH AVAILABLE DATES ============
  const fetchAvailableDates = async () => {
    const { data, error } = await supabase
      .from('drivers')
      .select('order_date');

    if (!error && data) {
      const unique = [...new Set(data.map((r) => r.order_date))].sort().reverse();
      setAvailableDates(unique);

      if (!selectedDate && unique.length > 0) {
        setSelectedDate(unique[0]);
      }
    }
  };

  // ============ FETCH DRIVERS FOR DATE (From the new VIEW) ============
  const fetchDrivers = async (date) => {
    if (!date) {
      setDrivers([]);
      return;
    }
    setLoading(true);
    // Changed from 'drivers' to 'daily_driver_stats' to get the names!
    const { data, error } = await supabase
      .from('daily_driver_stats')
      .select('*')
      .eq('order_date', date)
      .order('total_pay', { ascending: false });

    if (!error) setDrivers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAvailableDates();
  }, []);

  useEffect(() => {
    if (selectedDate) fetchDrivers(selectedDate);
  }, [selectedDate]);

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

    setUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        const grouped = {};

        let skippedCount = 0;
        let missingSapCount = 0;
        let badDateCount = 0;

        rows.forEach((row) => {
          const cleanRow = {};
          Object.keys(row).forEach((key) => {
            const cleanKey = key.replace(/^\uFEFF/, '').replace(/\?/g, '').trim();
            cleanRow[cleanKey] = row[key];
          });

          const sapId = cleanRow['Sap Profile Id']?.trim();
          if (!sapId) {
            missingSapCount++;
            return;
          }

          let createTime = cleanRow['Create Time']?.trim();
          if (!createTime) {
            skippedCount++;
            return;
          }

          if (createTime.includes('#')) {
            badDateCount++;
            return;
          }

          const datePart = createTime.split(' ')[0];
          const parts = datePart.split('/');

          if (parts.length !== 3) {
            badDateCount++;
            return;
          }

          const mm = parts[0].padStart(2, '0');
          const dd = parts[1].padStart(2, '0');
          const yyyy = parts[2];
          const orderDate = `${yyyy}-${mm}-${dd}`;

          const key = `${orderDate}__${sapId}`;

          let phoneStr = cleanRow['Driver Phone Number'] || '';
          if (phoneStr.includes('E+') || phoneStr.includes('e+')) {
            phoneStr = 'Invalid (Excel E+11)';
          }

          const payStr = cleanRow['Total Pay Display'] || cleanRow['Total Pay'] || 0;
          const distStr = cleanRow['Distance'] || 0;

          const pay = parseFloat(payStr.toString().replace(/,/g, '')) || 0;
          const dist = parseFloat(distStr.toString().replace(/,/g, '')) || 0;

          if (!grouped[key]) {
            grouped[key] = {
              sap_id: sapId,
              order_date: orderDate,
              phone: phoneStr,
              vehicle_plate: cleanRow['Driver Vehicle Plate'] || '',
              distance: 0,
              total_pay: 0,
              orders_count: 0,
            };
          }

          grouped[key].distance += dist;
          grouped[key].total_pay += pay;
          grouped[key].orders_count += 1;
        });

        const records = Object.values(grouped).map((d) => ({
          ...d,
          team: getTeam(d.sap_id),
          status: calculateStatus(d.total_pay, d.orders_count),
          last_updated: new Date().toISOString(),
        }));

        if (records.length === 0) {
          alert(
            `❌ No valid rows found.\n\n` +
            `Missing SAP ID in ${missingSapCount} rows.\n` +
            `Missing Create Time in ${skippedCount} rows.\n` +
            `Excel '#' Error in ${badDateCount} rows.\n`
          );
          setUploading(false);
          return;
        }

        const { error } = await supabase
          .from('drivers')
          .upsert(records, { onConflict: 'sap_id,order_date' });

        if (error) {
          alert('Upload failed: ' + error.message);
        } else {
          const dates = [...new Set(records.map((r) => r.order_date))].sort();
          alert(`✅ Uploaded ${records.length} records.`);
          setSelectedDate(dates[dates.length - 1]);
          await fetchAvailableDates();
        }

        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        alert('CSV error: ' + err.message);
        setUploading(false);
      },
    });
  };

  // ============ DELETE CURRENT DATE ============
  const clearCurrentDate = async () => {
    if (!isAdmin) {
      alert('Access Denied. Only Admin (Elen) can delete records.');
      return;
    }
    if (!selectedDate) return;
    if (!window.confirm(`⚠️ WARNING: Are you sure you want to DELETE ALL records for ${selectedDate}?`)) return;

    await supabase.from('drivers').delete().eq('order_date', selectedDate);
    await fetchAvailableDates();
    setDrivers([]);
    alert('Data deleted.');
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

  // ============ STATS COMPUTATION ============
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

    const lowEarners = [...drivers]
      .sort((a, b) => Number(a.total_pay) - Number(b.total_pay))
      .slice(0, 5);

    return {
      totalDrivers, totalOrders, totalKm, totalPay,
      aldrinCount, arnilCount, unassignedCount, zombieCount,
      statusCounts, topEarners, lowEarners,
      avgPay: totalPay / totalDrivers,
    };
  }, [drivers]);

  // ---------- view helpers ----------
  const rawName = (session?.user?.email || 'there').split('@')[0];
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const pct = (n) => (stats?.totalDrivers ? Math.round((n / stats.totalDrivers) * 100) : 0);

  const RING_R = 62;
  const RING_C = 2 * Math.PI * RING_R;
  const ringSeg = (count) => (stats?.totalDrivers ? (count / stats.totalDrivers) * RING_C : 0);
  const aldrinLen = ringSeg(stats?.aldrinCount);
  const arnilLen = ringSeg(stats?.arnilCount);
  const unassignedLen = ringSeg(stats?.unassignedCount);

  const maxStatus = stats ? Math.max(1, ...Object.values(stats.statusCounts)) : 1;

  return (
    <div className="rv-page">
      <div className="rv-frame">
        {/* ---------- Top bar ---------- */}
        <header className="rv-top">
          <div className="rv-logo">Nemintsco Depot</div>

          <nav className="rv-nav" aria-label="Main">
            <span className="rv-nav-pill active" aria-current="page">Revenue</span>
          </nav>

          <div className="rv-top-right">
            <span className="rv-user" title={session.user.email}>
              <span className="rv-user-dot" aria-hidden="true">{displayName.charAt(0)}</span>
              <span className="rv-user-email">{session.user.email}</span>
              {isAdmin && <span className="rv-admin">Admin</span>}
            </span>
            <button onClick={handleLogout} className="rv-pill-btn">
              <LogOut size={16} /> <span>Logout</span>
            </button>
          </div>
        </header>

        {/* ---------- Welcome + headline numbers ---------- */}
        <section className="rv-welcome">
          <div className="rv-welcome-left">
            <h1>Welcome in, {displayName}</h1>

            {stats && (
              <div className="rv-pills" aria-label="Driver status mix">
                {[
                  ['HP', 'High performers', stats.statusCounts.HP, 'p1'],
                  ['MP', 'Mid performers', stats.statusCounts.MP, 'p2'],
                  ['LP', 'Low performers', stats.statusCounts.LP, 'p3'],
                  ['Zombie', 'Zombies 🧟', stats.statusCounts.Zombie, 'p4'],
                ].map(([key, label, count, cls]) => (
                  <div className="rv-pill-item" key={key}>
                    <span className="rv-pill-label">{label}</span>
                    <span className={`rv-pill-bar ${cls}`} style={{ minWidth: 64 + pct(count) * 1.6 }}>
                      {pct(count)}%
                    </span>
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

        {/* ---------- Controls ---------- */}
        <div className="rv-controls">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            ref={fileInputRef}
            style={{ display: 'none' }}
            id="csv-upload"
          />
          <label htmlFor="csv-upload" className={`rv-pill-btn primary ${uploading ? 'disabled' : ''}`}>
            <Upload size={16} />
            {uploading ? 'Uploading...' : 'Upload CSV'}
          </label>

          <div className="rv-select">
            <Calendar size={16} />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={availableDates.length === 0}
              aria-label="Select date"
            >
              {availableDates.length === 0 && <option>No data yet</option>}
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </option>
              ))}
            </select>
          </div>

          <div className="rv-controls-end">
            <button onClick={() => fetchDrivers(selectedDate)} className="rv-icon-btn" title="Refresh" aria-label="Refresh">
              <RefreshCw size={17} />
            </button>
            {isAdmin && (
              <button onClick={clearCurrentDate} className="rv-icon-btn danger" title="Delete this day's records" aria-label="Delete this day's records">
                <Trash2 size={17} />
              </button>
            )}
          </div>
        </div>

        {/* ---------- Cards ---------- */}
        {stats && (
          <section className="rv-grid">
            {/* Earnings hero */}
            <article className="rv-card rv-earnings">
              <span className="rv-eyebrow">Total earnings</span>
              <strong className="rv-money">{peso(stats.totalPay)}</strong>
              <span className="rv-avg">{peso(stats.avgPay, 0)} avg / driver</span>
            </article>

            {/* Team ring */}
            <article className="rv-card rv-team">
              <h3>Teams</h3>
              <div className="rv-ring">
                <svg viewBox="0 0 160 160" role="img" aria-label="Drivers by team">
                  <circle cx="80" cy="80" r={RING_R} className="rv-ring-bg" />
                  <g transform="rotate(-90 80 80)">
                    <circle cx="80" cy="80" r={RING_R} className="rv-ring-seg a"
                      strokeDasharray={`${aldrinLen} ${RING_C}`} strokeDashoffset="0" />
                    <circle cx="80" cy="80" r={RING_R} className="rv-ring-seg b"
                      strokeDasharray={`${arnilLen} ${RING_C}`} strokeDashoffset={-aldrinLen} />
                    <circle cx="80" cy="80" r={RING_R} className="rv-ring-seg c"
                      strokeDasharray={`${unassignedLen} ${RING_C}`} strokeDashoffset={-(aldrinLen + arnilLen)} />
                  </g>
                </svg>
                <div className="rv-ring-label">
                  <strong>{stats.totalDrivers}</strong>
                  <span>drivers</span>
                </div>
              </div>
              <ul className="rv-legend">
                <li><i className="a" /> Aldrin (OS1) <b>{stats.aldrinCount}</b></li>
                <li><i className="b" /> Arnil (OS2) <b>{stats.arnilCount}</b></li>
                {stats.unassignedCount > 0 && <li><i className="c" /> Unassigned <b>{stats.unassignedCount}</b></li>}
              </ul>
            </article>

            {/* Status bars */}
            <article className="rv-card rv-status">
              <h3>Performance</h3>
              <p className="rv-sub">{stats.statusCounts.HP} high · {stats.zombieCount} zombies</p>
              <div className="rv-bars" role="img" aria-label="Drivers by status">
                {['HP', 'MP', 'LP', 'Zombie'].map((k) => (
                  <div className="rv-bar-col" key={k}>
                    <span className="rv-bar-val">{stats.statusCounts[k]}</span>
                    <div className="rv-bar-track">
                      <div
                        className={`rv-bar-fill ${k.toLowerCase()}`}
                        style={{ height: `${Math.max(6, (stats.statusCounts[k] / maxStatus) * 100)}%` }}
                      />
                    </div>
                    <span className="rv-bar-label">{k === 'Zombie' ? 'ZB' : k}</span>
                  </div>
                ))}
              </div>
            </article>

            {/* Top earners (dark) */}
            <article className="rv-card rv-top-earners">
              <div className="rv-card-head">
                <h3><Trophy size={18} /> Top earners</h3>
                <strong>{stats.topEarners.length}/5</strong>
              </div>
              {stats.topEarners.length === 0 ? (
                <p className="rv-sub light">No earnings yet.</p>
              ) : (
                <ol>
                  {stats.topEarners.map((d, i) => (
                    <li key={d.sap_id}>
                      <span className="rank">{i + 1}</span>
                      <span className="name">
                        <strong>{d.full_name || d.sap_id}</strong>
                        <small>{d.team} · {d.orders_count} orders</small>
                      </span>
                      <span className="amount">{peso(d.total_pay)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </article>

            {/* Lowest earners */}
            <article className="rv-card rv-low">
              <div className="rv-card-head">
                <h3><TrendingDown size={18} /> Lowest earners</h3>
              </div>
              <ol>
                {stats.lowEarners.map((d, i) => (
                  <li key={d.sap_id} className={Number(d.total_pay) === 0 ? 'zero' : ''}>
                    <span className="rank">{i + 1}</span>
                    <span className="name">
                      <strong>{d.full_name || d.sap_id}</strong>
                      <small>{d.team} · {d.orders_count} orders</small>
                    </span>
                    <span className="amount">{peso(d.total_pay)}</span>
                  </li>
                ))}
              </ol>
            </article>
          </section>
        )}

        {/* ---------- Table ---------- */}
        <section className="rv-card rv-table-card">
          <div className="rv-card-head">
            <h3>Driver breakdown</h3>
            {selectedDate && <span className="rv-sub">{drivers.length} drivers</span>}
          </div>

          {loading ? (
            <p className="rv-empty">Loading...</p>
          ) : drivers.length === 0 ? (
            <p className="rv-empty">
              {selectedDate ? `No data for ${selectedDate}.` : 'No drivers yet. Upload a CSV to begin.'}
            </p>
          ) : (
            <div className="rv-table-scroll">
              <table className="rv-table">
                <thead>
                  <tr>
                    <th>Driver Name</th>
                    <th>SAP ID</th>
                    <th>Team</th>
                    <th>Phone</th>
                    <th>Orders</th>
                    <th>Total Pay</th>
                    <th>Distance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={`${d.sap_id}-${d.order_date}`} className={rowClass(d.status)}>
                      <td><strong>{d.full_name || 'Unknown Driver'}</strong></td>
                      <td>{d.sap_id}</td>
                      <td>{d.team}</td>
                      <td>{d.phone || '-'}</td>
                      <td>{d.orders_count}</td>
                      <td>{peso(d.total_pay)}</td>
                      <td>{Number(d.distance).toFixed(1)} km</td>
                      <td><span className={`rv-badge ${d.status.toLowerCase()}`}>{d.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}