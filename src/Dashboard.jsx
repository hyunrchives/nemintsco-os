import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import Papa from 'papaparse';
import { Upload, LogOut, Trash2, RefreshCw, Calendar, Trophy, TrendingDown } from 'lucide-react';

export default function Dashboard({ session }) {
  const [drivers, setDrivers] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // 🔒 CHECK IF LOGGED IN USER IS ADMIN (ELEN)
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

  // ============ FETCH DRIVERS FOR DATE ============
  const fetchDrivers = async (date) => {
    if (!date) {
      setDrivers([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('drivers')
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
          Object.keys(row).forEach(key => {
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
      alert("Access Denied. Only Admin (Elen) can delete records.");
      return;
    }
    if (!selectedDate) return;
    if (!window.confirm(`⚠️ WARNING: Are you sure you want to DELETE ALL records for ${selectedDate}?`)) return;
    
    await supabase.from('drivers').delete().eq('order_date', selectedDate);
    await fetchAvailableDates();
    setDrivers([]);
    alert("Data deleted.");
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
    const zombieCount = drivers.filter((d) => d.status === 'Zombie').length;

    const sorted = [...drivers].sort((a, b) => Number(b.total_pay) - Number(a.total_pay));
    const topEarners = sorted.filter((d) => Number(d.total_pay) > 0).slice(0, 5);
    
    const lowEarners = [...drivers]
      .sort((a, b) => Number(a.total_pay) - Number(b.total_pay))
      .slice(0, 5);

    return {
      totalDrivers, totalOrders, totalKm, totalPay,
      aldrinCount, arnilCount, zombieCount,
      topEarners, lowEarners,
    };
  }, [drivers]);

  return (
    <div className="dashboard">
      <header className="top-bar">
        <div>
          <h1>Nemintsco Depot</h1>
          <p className="muted">
            Logged in: {session.user.email} 
            {isAdmin && <span style={{ color: 'blue', fontWeight: 'bold', marginLeft: '10px' }}>(Admin)</span>}
          </p>
        </div>
        <button onClick={handleLogout} className="btn-logout">
          <LogOut size={16} /> Logout
        </button>
      </header>

      <div className="control-bar">
        <div className="controls-left">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            ref={fileInputRef}
            style={{ display: 'none' }}
            id="csv-upload"
          />
          <label htmlFor="csv-upload" className={`btn-upload ${uploading ? 'disabled' : ''}`}>
            <Upload size={18} />
            {uploading ? 'Uploading...' : 'Upload CSV'}
          </label>

          <div className="date-picker">
            <Calendar size={18} />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={availableDates.length === 0}
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
        </div>

        <div className="actions">
          <button onClick={() => fetchDrivers(selectedDate)} className="btn-icon" title="Refresh">
            <RefreshCw size={18} />
          </button>
          
          {isAdmin && (
            <button onClick={clearCurrentDate} className="btn-icon danger" title="Delete this day's records">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {stats && (
        <div className="totals-grid">
          <div className="total-card">
            <h3>Drivers</h3>
            <p>{stats.totalDrivers}</p>
          </div>
          <div className="total-card">
            <h3>Total Orders</h3>
            <p>{stats.totalOrders}</p>
          </div>
          <div className="total-card">
            <h3>Total Distance</h3>
            <p>{stats.totalKm.toFixed(1)} km</p>
          </div>
          <div className="total-card highlight">
            <h3>Total Earnings</h3>
            <p>₱{stats.totalPay.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {stats && (
        <div className="stat-grid">
          <div className="stat-card blue">
            <h3>Aldrin (OS1)</h3>
            <p>{stats.aldrinCount} drivers</p>
          </div>
          <div className="stat-card purple">
            <h3>Arnil (OS2)</h3>
            <p>{stats.arnilCount} drivers</p>
          </div>
          <div className="stat-card red">
            <h3>Zombies 🧟</h3>
            <p>{stats.zombieCount} drivers</p>
          </div>
        </div>
      )}

      {stats && stats.topEarners.length > 0 && (
        <div className="leaderboard-grid">
          <div className="leaderboard top">
            <h2><Trophy size={20} /> Top Earners</h2>
            <ol>
              {stats.topEarners.map((d, i) => (
                <li key={d.sap_id}>
                  <span className="rank">#{i + 1}</span>
                  <span className="name">
                    <strong>{d.sap_id}</strong>
                    <small>{d.team} · {d.orders_count} orders</small>
                  </span>
                  <span className="amount">₱{Number(d.total_pay).toFixed(2)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="leaderboard low">
            <h2><TrendingDown size={20} /> Lowest Earners</h2>
            <ol>
              {stats.lowEarners.map((d, i) => (
                <li key={d.sap_id} className={Number(d.total_pay) === 0 ? 'zero' : ''}>
                  <span className="rank">#{i + 1}</span>
                  <span className="name">
                    <strong>{d.sap_id}</strong>
                    <small>{d.team} · {d.orders_count} orders</small>
                  </span>
                  <span className="amount">₱{Number(d.total_pay).toFixed(2)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <div className="table-wrap">
        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : drivers.length === 0 ? (
          <p className="empty-state">
            {selectedDate ? `No data for ${selectedDate}.` : 'No drivers yet. Upload a CSV to begin.'}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SAP ID</th>
                <th>Team</th>
                <th>Phone</th>
                <th>Vehicle</th>
                <th>Orders</th>
                <th>Total Pay</th>
                <th>Distance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={`${d.sap_id}-${d.order_date}`} className={rowClass(d.status)}>
                  <td><strong>{d.sap_id}</strong></td>
                  <td>{d.team}</td>
                  <td>{d.phone || '-'}</td>
                  <td>{d.vehicle_plate || '-'}</td>
                  <td>{d.orders_count}</td>
                  <td>₱{Number(d.total_pay).toFixed(2)}</td>
                  <td>{Number(d.distance).toFixed(1)} km</td>
                  <td><span className={`badge ${d.status.toLowerCase()}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}