// ============================================================
//  CCTV System - Frontend Logic v3.0
//  แก้ไข URL ด้านล่างให้ตรงกับ Web App URL ของคุณ
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbzep1ikgwf0cHUvL6T37BjzWTFJJZIo7MhC8WTX68L7LVGViNyLWnqHITqvMzm6SWtP/exec';

// ============================================================
//  State
// ============================================================
let cctvData       = [];
let jobData        = [];
let adminSheet     = 'cctv';
let editRow        = null;
let isLoggedIn     = false;
let cctvChart      = null;
let cctvZoneChart  = null;
let jobStatusChart = null;
let jobTypeChart   = null;

// ============================================================
//  Page & Navigation
// ============================================================
const pageHeaders = {
  cctv      : '📷 แบบบันทึกความผิดปกติ CCTV',
  job       : '📋 ทะเบียนรับแจ้งงาน',
  dashboard : '📊 Dashboard',
  admin     : '🔐 Admin'
};

function switchPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('headerTitle').textContent = pageHeaders[name] || '';
  if (name === 'dashboard') renderDashboard();
  if (name === 'admin' && isLoggedIn) fetchAdminData();
}

// ============================================================
//  Utilities
// ============================================================
function todayStr()      { return new Date().toISOString().split('T')[0]; }
function toDisplayDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

// แปลง dd-mm-yyyy → yyyy-mm-dd (ใช้เฉพาะตั้งค่า date picker)
function dmyToISO(str) {
  if (!str || str.length !== 10) return '';
  const p = str.split('-');
  if (p.length !== 3) return '';
  return `${p[2]}-${p[1]}-${p[0]}`;
}

// ส่งวันที่ไป backend ตรงๆ แบบ dd-mm-yyyy (ไม่แปลง)
function passDate(str) {
  return (str && str.length === 10) ? str : '';
}

// แสดงวันที่ — รองรับทุก format
function formatDate(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  const s = String(dateStr).trim();

  // dd-mm-yyyy → คืนเลย (format ที่เราต้องการ)
  if (s.length === 10 && s[2] === '-' && s[5] === '-') return s;

  // yyyy-mm-dd → แปลง
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return `${s.slice(8,10)}-${s.slice(5,7)}-${s.slice(0,4)}`;
  }

  // Date string เช่น "Mon Jun 22 2026 00:00:00 GMT+0700..."
  // หรือ ISO string → ใช้ Date parse แบบ UTC เพื่อกัน timezone shift
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    // ใช้ UTC เพื่อกัน timezone
    const day = String(d.getUTCDate()).padStart(2,'0');
    const mon = String(d.getUTCMonth()+1).padStart(2,'0');
    const yr  = d.getUTCFullYear();
    return `${day}-${mon}-${yr}`;
  }

  return s;
}

function statusBadge(s) {
  return `<span class="badge badge-${(s||'').replace(/\s/g,'')}">${s||'-'}</span>`;
}

function thumbImg(url) {
  if (!url) return '-';
  return `<img class="thumb" src="${url}" alt="รูป" onclick="openImgModal('${url}')" />`;
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `msg-box ${type}`;
  if (type !== 'error') setTimeout(() => { el.className = 'msg-box'; }, 5000);
}

// วันค้างกี่วัน (นับจากวันที่บันทึก)
function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ============================================================
//  Date Picker — Generic
// ============================================================
function openPicker(displayId, pickerId) {
  const picker  = document.getElementById(pickerId);
  const display = document.getElementById(displayId).value;
  if (display && display.length === 10) picker.value = dmyToISO(display);
  try { picker.showPicker(); } catch(e) { picker.click(); }
}

function setupPicker(displayId, pickerId) {
  const picker  = document.getElementById(pickerId);
  const display = document.getElementById(displayId);
  if (!picker || !display) return;
  picker.addEventListener('change', () => {
    if (picker.value) {
      const [y,m,d] = picker.value.split('-');
      display.value = `${d}-${m}-${y}`;
    }
  });
}

// ============================================================
//  Image Utilities
// ============================================================
function fileToWebP(file) {
  return new Promise(resolve => {
    if (!file) { resolve(''); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; } }
        else        { if (h > MAX) { w = Math.round(w*MAX/h); h = MAX; } }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/webp', 0.8));
      };
      img.onerror = () => resolve('');
      img.src = e.target.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function setupImagePreview(inputId, previewId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById(previewId);
    preview.innerHTML = '';
    const reader = new FileReader();
    reader.onload = ev => {
      const img = document.createElement('img');
      img.src = ev.target.result;
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

function setupCameraSync(camInputId, mainInputId, previewId) {
  const el = document.getElementById(camInputId);
  if (!el) return;
  el.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    // sync ไปยัง main input
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById(mainInputId).files = dt.files;
    // preview
    const preview = document.getElementById(previewId);
    preview.innerHTML = '';
    const reader = new FileReader();
    reader.onload = ev => {
      const img = document.createElement('img');
      img.src = ev.target.result;
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

function openImgModal(src) {
  document.getElementById('modalImg').src = src;
  document.getElementById('imgModal').style.display = 'block';
}

// ============================================================
//  Checkbox helpers
// ============================================================
function applyNoVideoText() {
  const cb    = document.getElementById('c_novideo');
  const issue = document.getElementById('c_issue');
  const txt   = 'No Video';
  if (cb.checked) {
    issue.value = issue.value ? issue.value + (issue.value.endsWith('\n') ? '' : '\n') + txt : txt;
  } else {
    issue.value = issue.value.replace('\n' + txt, '').replace(txt, '').trim();
  }
}

function applyRestartText() {
  const cb     = document.getElementById('c_restart');
  const action = document.getElementById('c_action');
  const txt    = 'สั่ง Restart ผ่าน Web UI';
  if (cb.checked) {
    action.value = action.value ? action.value + (action.value.endsWith('\n') ? '' : '\n') + txt : txt;
  } else {
    action.value = action.value.replace('\n' + txt, '').replace(txt, '').trim();
  }
}

// ============================================================
//  PAGE 1 — CCTV Report
// ============================================================
document.getElementById('cctvForm').addEventListener('submit', async e => {
  e.preventDefault();
  showMsg('cctvMsg', '⏳ กำลังบันทึก...', 'loading');

  const data = {
    action    : 'add',
    sheet     : 'cctv',
    date      : passDate(document.getElementById('c_date').value),
    camId     : document.getElementById('c_camId').value.trim(),
    zone      : document.getElementById('c_zone').value.trim(),
    issue     : document.getElementById('c_issue').value.trim(),
    actionTxt : document.getElementById('c_action').value.trim(),
    status    : document.getElementById('c_status').value,
    doneDate  : passDate(document.getElementById('c_doneDate').value),
    note      : document.getElementById('c_note').value.trim(),
    image1    : await fileToWebP(document.getElementById('c_image1').files[0]
                               || document.getElementById('c_image1_cam').files[0]),
    image2    : await fileToWebP(document.getElementById('c_image2').files[0]
                               || document.getElementById('c_image2_cam').files[0])
  };

  try {
    await fetch(API_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    showMsg('cctvMsg', '✅ บันทึกสำเร็จ!', 'success');
    resetCctvForm();
  } catch(err) {
    showMsg('cctvMsg', '❌ เกิดข้อผิดพลาด โปรดลองอีกครั้ง', 'error');
  }
});

function resetCctvForm() {
  document.getElementById('cctvForm').reset();
  document.getElementById('c_date').value      = toDisplayDate();
  document.getElementById('c_doneDate').value  = '';
  document.getElementById('c_novideo').checked = false;
  document.getElementById('c_restart').checked = false;
  document.getElementById('preview1').innerHTML = '';
  document.getElementById('preview2').innerHTML = '';
}

// ============================================================
//  PAGE 2 — Job Request
// ============================================================
document.getElementById('jobForm').addEventListener('submit', async e => {
  e.preventDefault();
  showMsg('jobMsg', '⏳ กำลังบันทึก...', 'loading');

  const data = {
    action      : 'add',
    sheet       : 'job',
    date        : passDate(document.getElementById('j_date').value),
    reporter    : document.getElementById('j_reporter').value.trim(),
    position    : document.getElementById('j_position').value.trim(),
    department  : document.getElementById('j_department').value.trim(),
    unit        : document.getElementById('j_unit').value.trim(),
    floor       : document.getElementById('j_floor').value.trim(),
    phone       : document.getElementById('j_phone').value.trim(),
    jobType     : document.getElementById('j_jobType').value,
    detail      : document.getElementById('j_detail').value.trim(),
    coordinator : document.getElementById('j_coordinator').value.trim(),
    note        : document.getElementById('j_note').value.trim(),
    image       : await fileToWebP(document.getElementById('j_image').files[0]
                                || document.getElementById('j_image_cam').files[0])
  };

  try {
    fetch(API_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }).catch(()=>{});
    showMsg('jobMsg', '✅ บันทึกสำเร็จ! สถานะเริ่มต้น: รอดำเนินการ', 'success');
    resetJobForm();
  } catch(err) {
    showMsg('jobMsg', '❌ เกิดข้อผิดพลาด โปรดลองอีกครั้ง', 'error');
  }
});

function resetJobForm() {
  document.getElementById('jobForm').reset();
  document.getElementById('j_date').value = toDisplayDate();
  document.getElementById('j_preview').innerHTML = '';
}

// ============================================================
//  PAGE 3 — Dashboard (Need to Decide)
// ============================================================
function switchDash(type, btn) {
  document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('dash-cctv').style.display = type === 'cctv' ? '' : 'none';
  document.getElementById('dash-job').style.display  = type === 'job'  ? '' : 'none';
}

async function renderDashboard() {
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${API_URL}?action=list&sheet=cctv`),
      fetch(`${API_URL}?action=list&sheet=job`)
    ]);
    const d1 = await r1.json();
    const d2 = await r2.json();
    if (Array.isArray(d1)) cctvData = d1;
    if (Array.isArray(d2)) jobData  = d2;
  } catch(e) {
    console.warn('Dashboard fetch error (using cached data):', e);
  }
  populateYearFilter('cctv');
  populateYearFilter('job');
  selectCurrentYear('cctv');
  selectCurrentYear('job');
  applyDashFilter('cctv');
  applyDashFilter('job');
}

function populateYearFilter(type) {
  const data  = type === 'cctv' ? cctvData : jobData;
  const sel   = document.getElementById(`dash_${type}_year`);

  const yearsFromData = [...new Set(
    data.map(r => getYearMonth(r.date).year).filter(y => y && /^\d{4}$/.test(y))
  )].sort().reverse();

  // ปีปัจจุบันต้องมีเสมอ
  const currentYear = String(new Date().getFullYear());
  const years = yearsFromData.includes(currentYear)
    ? yearsFromData
    : [currentYear, ...yearsFromData];

  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
}

function selectCurrentYear(type) {
  const sel         = document.getElementById(`dash_${type}_year`);
  const currentYear = String(new Date().getFullYear()); // ค.ศ. ตรงๆ เช่น "2026"
  const years       = [...sel.options].map(o => o.value);

  if (years.includes(currentYear)) {
    sel.value = currentYear;
  } else if (years.length) {
    sel.value = years[0]; // ถ้าไม่มีปีนี้ ใช้ปีล่าสุด
  }
  // เดือน unlock เสมอ (มีปีถูกเลือกอยู่แล้ว)
  lockMonthFilter(type, false);
}

function lockMonthFilter(type, lock) {
  const el = document.getElementById(`dash_${type}_month`);
  if (!el) return;
  el.disabled          = lock;
  el.style.opacity     = lock ? '0.45' : '1';
  el.style.cursor      = lock ? 'not-allowed' : 'pointer';
}

function onYearChange(type) {
  // ปีมีตัวเลือกอยู่เสมอ เดือนจึง unlock เสมอ
  lockMonthFilter(type, false);
  applyDashFilter(type);
}

function clearDashFilter(type) {
  // reset เดือนกลับ "ทุกเดือน" แต่ปียังคงเลือกอยู่
  document.getElementById(`dash_${type}_month`).value = '';
  applyDashFilter(type);
}

function getYearMonth(dateStr) {
  if (!dateStr) return { year: '', month: '' };
  const s = String(dateStr).trim();

  // dd-mm-yyyy
  if (s.length === 10 && s[2] === '-' && s[5] === '-') {
    return { year: s.slice(6,10), month: s.slice(3,5) };
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return { year: s.slice(0,4), month: s.slice(5,7) };
  }
  // Date string เช่น "Mon Jun 22 2026 00:00:00 GMT+0700"
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return {
      year  : String(d.getUTCFullYear()),
      month : String(d.getUTCMonth()+1).padStart(2,'0')
    };
  }
  return { year: '', month: '' };
}

function getFilteredData(type) {
  const data  = type === 'cctv' ? cctvData : jobData;
  const year  = document.getElementById(`dash_${type}_year`).value;
  const month = document.getElementById(`dash_${type}_month`).value;
  return data.filter(r => {
    const ym = getYearMonth(r.date);
    if (year  && ym.year  !== year)  return false;
    if (month && ym.month !== month) return false;
    return true;
  });
}

function applyDashFilter(type) {
  const filtered = getFilteredData(type);
  const countEl  = document.getElementById(`dash_${type}_count`);
  if (countEl) countEl.textContent = `แสดง ${filtered.length} รายการ`;
  if (type === 'cctv') renderCctvDash(filtered);
  else                  renderJobDash(filtered);
}

const STATUS_COLORS = {
  'รอดำเนินการ'   : '#fbbf24',
  'กำลังดำเนินการ': '#60a5fa',
  'เสร็จสิ้น'     : '#34d399'
};
function colorArr(keys) { return keys.map(k => STATUS_COLORS[k] || '#a78bfa'); }
function countByKey(arr, key) {
  return arr.reduce((acc, r) => { const k = r[key]||'ไม่ระบุ'; acc[k]=(acc[k]||0)+1; return acc; }, {});
}

function kpiCard(num, label, color, sub) {
  return `<div class="kpi-card">
    <div class="kpi-num" style="color:${color}">${num}</div>
    <div class="kpi-label">${label}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}

function renderCctvDash(data) {
  const total   = data.length;
  const pending = data.filter(r => r.status === 'รอดำเนินการ').length;
  const inprog  = data.filter(r => r.status === 'กำลังดำเนินการ').length;
  const done    = data.filter(r => r.status === 'เสร็จสิ้น').length;
  const overdue = data.filter(r => r.status !== 'เสร็จสิ้น' && (daysSince(r.date)||0) > 3).length;

  document.getElementById('cctv_kpi').innerHTML =
    kpiCard(total,   '📋 รายการทั้งหมด', '#1a6dd4') +
    kpiCard(pending, '⏳ รอดำเนินการ',   '#d97706') +
    kpiCard(inprog,  '🔄 กำลังดำเนินการ','#2563eb') +
    kpiCard(done,    '✅ เสร็จสิ้น',      '#16a34a') +
    kpiCard(overdue, '🔴 ค้างเกิน 3 วัน', '#dc2626', 'ต้องติดตามด่วน');

  // Doughnut status
  const sc = countByKey(data, 'status');
  if (cctvChart) cctvChart.destroy();
  cctvChart = new Chart(document.getElementById('cctvStatusChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels: Object.keys(sc), datasets:[{ data: Object.values(sc), backgroundColor: colorArr(Object.keys(sc)), borderWidth:2 }] },
    options: { plugins:{ legend:{ position:'bottom', labels:{ font:{size:11} } } }, cutout:'60%' }
  });

  // Bar top 5 zones
  const zc    = countByKey(data, 'zone');
  const top5z = Object.entries(zc).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if (cctvZoneChart) cctvZoneChart.destroy();
  cctvZoneChart = new Chart(document.getElementById('cctvZoneChart').getContext('2d'), {
    type: 'bar',
    data: { labels: top5z.map(e=>e[0]), datasets:[{ data: top5z.map(e=>e[1]), backgroundColor:'#60a5fa', borderRadius:6 }] },
    options: { indexAxis:'y', plugins:{ legend:{ display:false } }, scales:{ x:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
  });

  // Urgent table
  const urgent = data
    .filter(r => r.status !== 'เสร็จสิ้น')
    .map(r => ({ ...r, days: daysSince(r.date) ?? 0 }))
    .sort((a,b) => b.days - a.days);

  document.getElementById('cctv_urgent_body').innerHTML = urgent.length
    ? urgent.map((r,i) => `<tr>
        <td>${i+1}</td>
        <td style="white-space:nowrap">${formatDate(r.date)}</td>
        <td><strong>${r.camId||'-'}</strong></td>
        <td>${r.zone||'-'}</td>
        <td>${(r.issue||'-').substring(0,50)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.days > 3
          ? `<span class="badge" style="background:#fee2e2;color:#991b1b">⚠️ ${r.days} วัน</span>`
          : `<span class="badge" style="background:#f3f4f6;color:#374151">${r.days} วัน</span>`}</td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="tbl-loading">✅ ไม่มีงานค้าง</td></tr>`;
}

function renderJobDash(data) {
  const total   = data.length;
  const pending = data.filter(r => r.status === 'รอดำเนินการ').length;
  const inprog  = data.filter(r => r.status === 'กำลังดำเนินการ').length;
  const done    = data.filter(r => r.status === 'เสร็จสิ้น').length;
  const overdue = data.filter(r => r.status !== 'เสร็จสิ้น' && (daysSince(r.date)||0) > 3).length;

  document.getElementById('job_kpi').innerHTML =
    kpiCard(total,   '📋 รายการทั้งหมด', '#1a6dd4') +
    kpiCard(pending, '⏳ รอดำเนินการ',   '#d97706') +
    kpiCard(inprog,  '🔄 กำลังดำเนินการ','#2563eb') +
    kpiCard(done,    '✅ เสร็จสิ้น',      '#16a34a') +
    kpiCard(overdue, '🔴 ค้างเกิน 3 วัน', '#dc2626', 'ต้องติดตามด่วน');

  // Doughnut status
  const sc = countByKey(data, 'status');
  if (jobStatusChart) jobStatusChart.destroy();
  jobStatusChart = new Chart(document.getElementById('jobStatusChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels: Object.keys(sc), datasets:[{ data: Object.values(sc), backgroundColor: colorArr(Object.keys(sc)), borderWidth:2 }] },
    options: { plugins:{ legend:{ position:'bottom', labels:{ font:{size:11} } } }, cutout:'60%' }
  });

  // Bar job type
  const tc = countByKey(data, 'jobType');
  if (jobTypeChart) jobTypeChart.destroy();
  jobTypeChart = new Chart(document.getElementById('jobTypeChart').getContext('2d'), {
    type: 'bar',
    data: { labels: Object.keys(tc), datasets:[{ data: Object.values(tc), backgroundColor:['#818cf8','#f472b6','#fb923c'], borderRadius:6 }] },
    options: { plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } } }
  });

  // Urgent table
  const urgent = data
    .filter(r => r.status !== 'เสร็จสิ้น')
    .map(r => ({ ...r, days: daysSince(r.date) ?? 0 }))
    .sort((a,b) => b.days - a.days);

  document.getElementById('job_urgent_body').innerHTML = urgent.length
    ? urgent.map((r,i) => `<tr>
        <td>${i+1}</td>
        <td style="white-space:nowrap">${formatDate(r.date)}</td>
        <td><strong>${r.jobNo||'-'}</strong></td>
        <td><span class="badge badge-${(r.jobType||'').replace(/\s/g,'')}">${r.jobType||'-'}</span></td>
        <td>${r.location||'-'}</td>
        <td>${(r.detail||'-').substring(0,40)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.days > 3
          ? `<span class="badge" style="background:#fee2e2;color:#991b1b">⚠️ ${r.days} วัน</span>`
          : `<span class="badge" style="background:#f3f4f6;color:#374151">${r.days} วัน</span>`}</td>
      </tr>`).join('')
    : `<tr><td colspan="8" class="tbl-loading">✅ ไม่มีงานค้าง</td></tr>`;
}

// ============================================================
//  PAGE 4 — Admin
// ============================================================
async function doLogin() {
  const user = document.getElementById('adminUser').value.trim();
  const pass = document.getElementById('adminPass').value;
  if (!user || !pass) { showMsg('loginMsg','⚠️ กรุณากรอก username และ password','error'); return; }
  showMsg('loginMsg','⏳ กำลังตรวจสอบ...','loading');
  try {
    const res  = await fetch(`${API_URL}?action=login&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`);
    const data = await res.json();
    if (data.success) {
      isLoggedIn = true;
      document.getElementById('loginPanel').style.display = 'none';
      document.getElementById('adminPanel').style.display = '';
      fetchAdminData();
    } else {
      showMsg('loginMsg','❌ username หรือ password ไม่ถูกต้อง','error');
    }
  } catch(e) {
    showMsg('loginMsg','❌ ไม่สามารถเชื่อมต่อได้','error');
  }
}

function doLogout() {
  isLoggedIn = false;
  document.getElementById('loginPanel').style.display = '';
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('adminUser').value = '';
  document.getElementById('adminPass').value = '';
}

function switchAdminSheet(type, btn) {
  adminSheet = type;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('adminTableTitle').textContent = type === 'cctv' ? '📷 CCTV Report' : '📋 Job Request';
  // reset filter เมื่อเปลี่ยน sheet
  clearAdminFilter(false);
  fetchAdminData();
}

// ============================================================
//  Admin Filter
// ============================================================
function populateAdminYearFilter() {
  const data = adminSheet === 'cctv' ? cctvData : jobData;
  const sel  = document.getElementById('admin_year');
  const years = [...new Set(
    data.map(r => getYearMonth(r.date).year).filter(y => y && /^\d{4}$/.test(y))
  )].sort().reverse();
  sel.innerHTML = `<option value="">ทุกปี</option>` +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
}

function applyAdminFilter() {
  const data   = adminSheet === 'cctv' ? cctvData : jobData;
  const year   = document.getElementById('admin_year').value;
  const month  = document.getElementById('admin_month').value;
  const status = document.getElementById('admin_status').value;

  const filtered = data.filter(r => {
    const ym = getYearMonth(r.date);
    if (year   && ym.year  !== year)              return false;
    if (month  && ym.month !== month)             return false;
    if (status && (r.status||'') !== status)      return false;
    return true;
  });

  const countEl = document.getElementById('admin_filter_count');
  if (countEl) countEl.textContent = `แสดง ${filtered.length} / ${data.length} รายการ`;

  if (adminSheet === 'cctv') renderAdminCctv(filtered);
  else                        renderAdminJob(filtered);
}

function clearAdminFilter(reRender = true) {
  const y = document.getElementById('admin_year');
  const m = document.getElementById('admin_month');
  const s = document.getElementById('admin_status');
  if (y) y.value = '';
  if (m) m.value = '';
  if (s) s.value = '';
  const countEl = document.getElementById('admin_filter_count');
  if (countEl) countEl.textContent = '';
  if (reRender) applyAdminFilter();
}

async function fetchAdminData() {
  document.getElementById('adminBody').innerHTML = `<tr><td colspan="13" class="tbl-loading">⏳ กำลังโหลด...</td></tr>`;
  try {
    const res  = await fetch(`${API_URL}?action=list&sheet=${adminSheet}`);
    const data = await res.json();
    if (adminSheet === 'cctv') cctvData = data;
    else                        jobData  = data;
    populateAdminYearFilter();
    applyAdminFilter();
  } catch(e) {
    document.getElementById('adminBody').innerHTML = `<tr><td class="tbl-loading" style="color:#991b1b" colspan="13">❌ โหลดข้อมูลไม่สำเร็จ</td></tr>`;
  }
}

function renderAdminCctv(data) {
  document.getElementById('adminThead').innerHTML = `<tr>
    <th>#</th><th>วันที่</th><th>Cam ID</th><th>โซน</th><th>อาการ</th>
    <th>รูปก่อน</th><th>การแก้ไข</th><th>สถานะ</th><th>วันที่เสร็จ</th>
    <th>รูปหลัง</th><th>หมายเหตุ</th><th colspan="2">จัดการ</th>
  </tr>`;
  if (!data.length) {
    document.getElementById('adminBody').innerHTML = `<tr><td colspan="13" class="tbl-loading">📭 ยังไม่มีข้อมูล</td></tr>`;
    return;
  }
  document.getElementById('adminBody').innerHTML = data.map((r,i) => `
    <tr>
      <td>${i+1}</td>
      <td style="white-space:nowrap">${formatDate(r.date)}</td>
      <td><strong>${r.camId||'-'}</strong></td>
      <td>${r.zone||'-'}</td>
      <td>${r.issue||'-'}</td>
      <td>${thumbImg(r.image1)}</td>
      <td>${r.action||r.actionTxt||'-'}</td>
      <td>${statusBadge(r.status)}</td>
      <td style="white-space:nowrap">${formatDate(r.doneDate)||'-'}</td>
      <td>${thumbImg(r.image2)}</td>
      <td>${r.note||'-'}</td>
      <td><button class="btn btn-sm btn-edit" onclick="openEditCctv(${i})">✏️ แก้ไข</button></td>
      <td><button class="btn btn-sm btn-del"  onclick="deleteRow(${r.rowIndex})">🗑️ ลบ</button></td>
    </tr>`).join('');
}

function renderAdminJob(data) {
  document.getElementById('adminThead').innerHTML = `<tr>
    <th>#</th><th>วันที่</th><th>ผู้แจ้ง</th><th>ตำแหน่ง</th><th>แผนก</th>
    <th>โทรศัพท์</th><th>ประเภท</th><th>รายละเอียด</th><th>ประสานงาน</th>
    <th>รูปภาพ</th><th>สถานะ</th><th>สรุปผล</th>
    <th>วันที่เสร็จ</th><th>หมายเหตุ</th><th colspan="3">จัดการ</th>
  </tr>`;
  if (!data.length) {
    document.getElementById('adminBody').innerHTML = `<tr><td colspan="17" class="tbl-loading">📭 ยังไม่มีข้อมูล</td></tr>`;
    return;
  }
  document.getElementById('adminBody').innerHTML = data.map((r,i) => `
    <tr>
      <td>${i+1}</td>
      <td style="white-space:nowrap">${formatDate(r.date)}</td>
      <td><strong>${r.reporter||'-'}</strong></td>
      <td>${r.position||'-'}</td>
      <td>${r.department||'-'}</td>
      <td>${r.phone||'-'}</td>
      <td><span class="badge badge-${(r.jobType||'').replace(/\s/g,'')}">${r.jobType||'-'}</span></td>
      <td>${(r.detail||'-').substring(0,40)}</td>
      <td>${r.coordinator||'-'}</td>
      <td>${thumbImg(r.image||'')}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${(r.summary||'-').substring(0,40)}</td>
      <td style="white-space:nowrap">${formatDate(r.doneDate)||'-'}</td>
      <td>${r.note||'-'}</td>
      <td><button class="btn btn-sm btn-edit"  onclick="openEditJob(${i})">✏️ แก้ไข</button></td>
      <td><button class="btn btn-sm btn-print" onclick="printJobForm(${i})">🖨️ พิมพ์</button></td>
      <td><button class="btn btn-sm btn-del"   onclick="deleteRow(${r.rowIndex})">🗑️ ลบ</button></td>
    </tr>`).join('');
}

// ---- Edit Job Modal (schema v4) ----
function openEditJob(idx) {
  const r = jobData[idx];
  editRow = { ...r };

  document.getElementById('editModalTitle').textContent = `✏️ แก้ไขใบแจ้งงาน — ${r.reporter||''}`;
  document.getElementById('editModalBody').innerHTML = `
    <div class="form-section-divider">ส่วนที่ 1 — ข้อมูลผู้แจ้ง</div>
    <div class="form-row two-col">
      <div class="form-group">
        <label>📅 วันที่</label>
        <div class="date-wrapper">
          <input type="text" id="e_date" placeholder="dd-mm-yyyy" maxlength="10" readonly style="cursor:pointer;"
            value="${formatDate(r.date)||''}" onclick="openPicker('e_date','e_date_p')" />
          <input type="date" id="e_date_p" style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;" />
          <span class="date-cal-icon" onclick="openPicker('e_date','e_date_p')">📅</span>
        </div>
      </div>
      <div class="form-group">
        <label>👤 ชื่อผู้แจ้งงาน</label>
        <input type="text" id="e_reporter" value="${r.reporter||''}" />
      </div>
    </div>
    <div class="form-row three-col">
      <div class="form-group"><label>💼 ตำแหน่ง</label><input type="text" id="e_position" value="${r.position||''}" /></div>
      <div class="form-group"><label>🏢 แผนก</label><input type="text" id="e_department" value="${r.department||''}" /></div>
      <div class="form-group"><label>🏬 หน่วยงาน</label><input type="text" id="e_unit" value="${r.unit||''}" /></div>
    </div>
    <div class="form-row two-col">
      <div class="form-group"><label>🔢 ชั้น</label><input type="text" id="e_floor" value="${r.floor||''}" /></div>
      <div class="form-group"><label>📞 โทรศัพท์</label><input type="text" id="e_phone" value="${r.phone||''}" /></div>
    </div>
    <div class="form-section-divider">ส่วนที่ 1 — แจ้งความประสงค์</div>
    <div class="form-group">
      <label>🏷️ ประเภทงาน</label>
      <select id="e_jobType">
        ${['กล้องวงจรปิด','Access Control','อื่นๆ'].map(t=>`<option ${r.jobType===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>📄 รายละเอียดของงาน</label>
      <textarea id="e_detail" rows="3">${r.detail||''}</textarea>
    </div>
    <div class="form-group">
      <label>🤝 โดยประสานงานกับ</label>
      <input type="text" id="e_coordinator" value="${r.coordinator||''}" />
    </div>
    <div class="form-group">
      <label>🖼️ รูปภาพ</label>
      <div id="e_jimg_wrap" class="edit-img-wrap" ${r.image?'':'style="display:none"'}>
        <img src="${r.image||''}" class="edit-thumb" onclick="openImgModal('${r.image||''}')" />
        <button type="button" class="btn btn-sm btn-del" onclick="clearEditImg('e_jimg_wrap','e_jimg_preview','e_jimg','e_jimg_cam','jimg')">🗑️ ลบรูป</button>
      </div>
      <div id="e_jimg_preview" class="preview-container" style="margin-top:6px"></div>
      <input type="file" id="e_jimg"     accept="image/*"                    hidden />
      <input type="file" id="e_jimg_cam" accept="image/*" capture="environment" hidden />
      <div class="upload-btn-row" style="margin-top:8px">
        <button type="button" class="btn btn-upload" onclick="document.getElementById('e_jimg').click()">🖼️ เปลี่ยนรูป</button>
        <button type="button" class="btn btn-upload" onclick="document.getElementById('e_jimg_cam').click()">📷 ถ่ายใหม่</button>
      </div>
    </div>
    <div class="form-section-divider">ส่วนที่ 2 — สำหรับเจ้าหน้าที่</div>
    <div class="form-group">
      <label>📋 สรุปผล</label>
      <textarea id="e_summary" rows="3" placeholder="สรุปผลการปฏิบัติงาน...">${r.summary||''}</textarea>
    </div>
    <div class="form-row two-col">
      <div class="form-group">
        <label>📊 สถานะ</label>
        <select id="e_status">
          ${['รอดำเนินการ','กำลังดำเนินการ','เสร็จสิ้น'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>📅 วันที่ดำเนินการแล้วเสร็จ</label>
        <div class="date-wrapper">
          <input type="text" id="e_doneDate" placeholder="dd-mm-yyyy" maxlength="10" readonly style="cursor:pointer;"
            value="${formatDate(r.doneDate)||''}" onclick="openPicker('e_doneDate','e_doneDate_p')" />
          <input type="date" id="e_doneDate_p" style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;" />
          <span class="date-cal-icon" onclick="openPicker('e_doneDate','e_doneDate_p')">📅</span>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>📝 หมายเหตุ</label>
      <input type="text" id="e_note" value="${r.note||''}" />
    </div>
  `;

  setupPicker('e_date',     'e_date_p');
  setupPicker('e_doneDate', 'e_doneDate_p');
  setupEditImgPreview('e_jimg',     'e_jimg_preview', 'jimg');
  setupEditImgPreview('e_jimg_cam', 'e_jimg_preview', 'jimg');
  document.getElementById('editModal').style.display = 'block';
}

// ---- Print Job Form ----
function printJobForm(idx) {
  const r = jobData[idx];

  function toSlash(d) {
    if (!d) return '';
    return d.replace(/-/g, '/');
  }

  const pdfB64 = window.FM_BD_009_PDF || '';

  const rJ   = JSON.stringify(r.reporter    || '');
  const poJ  = JSON.stringify(r.position    || '');
  const dpJ  = JSON.stringify(r.department  || '');
  const unJ  = JSON.stringify(r.unit        || '');
  const flJ  = JSON.stringify(r.floor       || '');
  const phJ  = JSON.stringify(r.phone       || '');
  const jtJ  = JSON.stringify(r.jobType     || '');
  const deJ  = JSON.stringify(r.detail      || '');
  const coJ  = JSON.stringify(r.coordinator || '');
  const suJ  = JSON.stringify(r.summary     || '');
  const daJ  = JSON.stringify(toSlash(r.date)     || '');
  const ddJ  = JSON.stringify(toSlash(r.doneDate) || '');

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<title>FM-BD-009</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#606060;font-family:'Sarabun',sans-serif;}
.no-print{background:#333;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;position:sticky;top:0;z-index:99;}
.no-print button{padding:6px 20px;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;}
.btn-p{background:#1a6dd4;color:#fff;}
.btn-c{background:#666;color:#fff;}
/* wrapper จำลอง A4 */
.a4-wrap{
  width:210mm;
  margin:16px auto;
  background:#fff;
  position:relative;
  box-shadow:0 4px 24px rgba(0,0,0,.5);
}
.a4-wrap img.bg{
  width:100%;
  display:block;
}
/* overlay สำหรับวาง text */
.overlay{
  position:absolute;
  top:0;left:0;right:0;bottom:0;
  pointer-events:none;
}
/* text items — ใช้ position:absolute + % */
.f{
  position:absolute;
  font-family:'Sarabun',sans-serif;
  font-size:clamp(8px, 1.55vw, 12px);
  color:#000;
  white-space:nowrap;
  line-height:1;
}
.tick{
  position:absolute;
  font-size:clamp(10px, 1.8vw, 14px);
  color:#000;
  font-weight:bold;
  transform:translate(-50%,-50%);
}
.f-wrap{
  position:absolute;
  font-family:'Sarabun',sans-serif;
  font-size:clamp(8px, 1.55vw, 12px);
  color:#000;
  line-height:1.5;
  word-break:break-all;
}
@media print{
  @page{size:A4 portrait;margin:0;}
  body{background:#fff;}
  .no-print{display:none!important;}
  .a4-wrap{
    width:210mm;
    margin:0;
    box-shadow:none;
    page-break-inside:avoid;
  }
  .f, .tick, .f-wrap{
    font-size:10.5pt;
  }
}
</style>
</head>
<body>
<div class="no-print">
  <span style="font-size:15px;font-weight:700;">📄 FM-BD-009 — ${r.reporter||''}</span>
  <button class="btn-p" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>
  <button class="btn-c" onclick="window.close()">✕ ปิด</button>
  <span style="font-size:12px;opacity:.7;">💡 ตั้งค่า: กระดาษ A4 | Scale 100% | Margin: None</span>
</div>

<div class="a4-wrap" id="a4">
  <img class="bg" id="bgImg" src="" alt="form"/>
  <div class="overlay" id="ov"></div>
</div>

<script>
const DATA = {
  reporter   : ${rJ},
  position   : ${poJ},
  department : ${dpJ},
  unit       : ${unJ},
  floor      : ${flJ},
  phone      : ${phJ},
  jobType    : ${jtJ},
  detail     : ${deJ},
  coordinator: ${coJ},
  summary    : ${suJ},
  date       : ${daJ},
  doneDate   : ${ddJ}
};

const PDF_B64 = "${pdfB64}";

// แปลง PDF → PNG แล้วใส่เป็น bg image
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function init() {
  // โหลด PDF แล้ว render เป็น PNG
  const bytes = Uint8Array.from(atob(PDF_B64), c => c.charCodeAt(0));
  const pdf   = await pdfjsLib.getDocument({data: bytes}).promise;
  const page  = await pdf.getPage(1);
  const SCALE = 2.0;
  const vp    = page.getViewport({scale: SCALE});

  const offscreen = document.createElement('canvas');
  offscreen.width  = vp.width;
  offscreen.height = vp.height;
  await page.render({canvasContext: offscreen.getContext('2d'), viewport: vp}).promise;

  // ใส่เป็น background image
  const dataURL = offscreen.toDataURL('image/png');
  document.getElementById('bgImg').src = dataURL;

  // รอ image โหลดแล้ว render overlay
  document.getElementById('bgImg').onload = renderOverlay;
}

function renderOverlay() {
  const ov  = document.getElementById('ov');
  const a4  = document.getElementById('a4');
  ov.innerHTML = '';

  // helper: สร้าง element ที่ตำแหน่ง % ของ a4
  function place(xPct, yPct, text, cls='f') {
    if (!text) return;
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    el.style.left = xPct + '%';
    el.style.top  = yPct + '%';
    ov.appendChild(el);
  }

  function placeTick(xPct, yPct) {
    const el = document.createElement('span');
    el.className = 'tick';
    el.textContent = '✓';
    el.style.left = xPct + '%';
    el.style.top  = yPct + '%';
    ov.appendChild(el);
  }

  // ── ส่วนที่ 1: ข้อมูลผู้แจ้ง ──
  place(17.16, 34.72, DATA.reporter);
  place(49.96, 34.72, DATA.position);
  place(76.55, 34.72, DATA.department);

  place(18.94, 38.31, DATA.unit);
  place(55.20, 38.31, DATA.floor);
  place(72.12, 38.31, DATA.phone);

  // ── Checkbox ประเภทงาน ──
  if (DATA.jobType === 'กล้องวงจรปิด')  placeTick(18.78, 49.03);
  if (DATA.jobType === 'Access Control') placeTick(41.18, 49.03);
  if (DATA.jobType === 'อื่นๆ')          placeTick(59.15, 49.03);

  // ── รายละเอียดของงาน (wrap ยาว → แบ่ง 3 บรรทัด) ──
  const dLines = splitLines(DATA.detail, 78);
  place( 7.33, 54.28, dLines[0] || '');
  place( 7.33, 58.27, dLines[1] || '');
  place( 7.33, 62.14, dLines[2] || '');

  // ── โดยประสานงานกับ ──
  place(26.59, 65.85, DATA.coordinator);

  // ── Signature ผู้แจ้ง ──
  // ชื่อ (center-align)
  const nameEl = document.createElement('span');
  nameEl.className = 'f';
  nameEl.textContent = DATA.reporter;
  nameEl.style.left = '69.62%';
  nameEl.style.top  = '75.14%';
  nameEl.style.transform = 'translateX(-50%)';
  ov.appendChild(nameEl);

  place(58.82, 77.82, DATA.position);
  place(58.82, 79.82, DATA.date);

  // ── ส่วนที่ 2: สรุปผล ──
  const sLines = splitLines(DATA.summary, 78);
  place( 7.33, 84.95, sLines[0] || '');
  place( 7.33, 88.83, sLines[1] || '');
  place( 7.33, 92.13, sLines[2] || '');

  // วันที่เสร็จ
  place(58.82, 96.69, DATA.doneDate);
}

// แบ่งข้อความเป็น chunks ตามความยาว char (ประมาณ)
function splitLines(text, charsPerLine) {
  if (!text) return ['', '', ''];
  const lines = [];
  let i = 0;
  while (i < text.length && lines.length < 3) {
    lines.push(text.slice(i, i + charsPerLine));
    i += charsPerLine;
  }
  while (lines.length < 3) lines.push('');
  return lines;
}

// load pdf.js แล้ว init
const s = document.createElement('script');
s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
s.onload = () => document.fonts.ready.then(init);
document.head.appendChild(s);
<\/script>
</body>
</html>`;


  const w = window.open('', '_blank', 'width=960,height=1100');
  w.document.write(html);
  w.document.close();
}



// ---- Edit Modal helpers ----
function setupEditImgPreview(inputId, previewId, storeKey) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById(previewId);
    preview.innerHTML = '';
    const reader = new FileReader();
    reader.onload = ev => {
      const img = document.createElement('img');
      img.src = ev.target.result;
      preview.appendChild(img);
      editRow[`_new_${storeKey}`] = ev.target.result;  // เก็บ base64 ใหม่
    };
    reader.readAsDataURL(file);
  });
}

function clearEditImg(wrapId, previewId, inputId, camInputId, storeKey) {
  // ซ่อน existing image wrap
  const wrap = document.getElementById(wrapId);
  if (wrap) wrap.style.display = 'none';
  // ล้าง preview ใหม่
  const prev = document.getElementById(previewId);
  if (prev) prev.innerHTML = '';
  // reset file inputs
  const inp = document.getElementById(inputId);
  if (inp) inp.value = '';
  const cam = document.getElementById(camInputId);
  if (cam) cam.value = '';
  // flag ว่าให้ลบ URL เดิม
  editRow[`_new_${storeKey}`] = '';
}

async function saveEdit() {
  if (!editRow) return;
  const saveBtn = document.getElementById('editSaveBtn');
  if (saveBtn) { saveBtn.textContent = '⏳ กำลังบันทึก...'; saveBtn.disabled = true; }

  let data = { action:'update', sheet: adminSheet, rowIndex: editRow.rowIndex };

  try {
    if (adminSheet === 'cctv') {
      const img1Raw = '_new_img1' in editRow ? editRow._new_img1 : editRow.image1;
      const img2Raw = '_new_img2' in editRow ? editRow._new_img2 : editRow.image2;
      const img1 = img1Raw && img1Raw.startsWith('data:image') ? await fileToWebP(dataURLtoFile(img1Raw,'img1')) : (img1Raw||'');
      const img2 = img2Raw && img2Raw.startsWith('data:image') ? await fileToWebP(dataURLtoFile(img2Raw,'img2')) : (img2Raw||'');
      data = { ...data,
        date     : passDate(document.getElementById('e_date').value),
        camId    : document.getElementById('e_camId').value,
        zone     : document.getElementById('e_zone').value,
        issue    : document.getElementById('e_issue').value,
        actionTxt: document.getElementById('e_action').value,
        status   : document.getElementById('e_status').value,
        doneDate : passDate(document.getElementById('e_doneDate').value),
        note     : document.getElementById('e_note').value,
        image1   : img1,
        image2   : img2
      };
    } else {
      const imgRaw = '_new_jimg' in editRow ? editRow._new_jimg : editRow.image;
      const img    = imgRaw && imgRaw.startsWith('data:image') ? await fileToWebP(dataURLtoFile(imgRaw,'jimg')) : (imgRaw||'');
      data = { ...data,
        date        : passDate(document.getElementById('e_date').value),
        reporter    : document.getElementById('e_reporter').value,
        position    : document.getElementById('e_position').value,
        department  : document.getElementById('e_department').value,
        unit        : document.getElementById('e_unit').value,
        floor       : document.getElementById('e_floor').value,
        phone       : document.getElementById('e_phone').value,
        jobType     : document.getElementById('e_jobType').value,
        detail      : document.getElementById('e_detail').value,
        coordinator : document.getElementById('e_coordinator').value,
        image       : img,
        summary     : document.getElementById('e_summary').value,
        status      : document.getElementById('e_status').value,
        doneDate    : passDate(document.getElementById('e_doneDate').value),
        note        : document.getElementById('e_note').value
      };
    }
  } catch(e) {
    alert('❌ เกิดข้อผิดพลาดในการเตรียมข้อมูล');
    closeEditModal();
    return;
  }

  // fire-and-forget — no-cors ไม่มี response กลับ ปิด modal ทันที
  fetch(API_URL, {
    method : 'POST',
    mode   : 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(data)
  }).catch(() => {});

  closeEditModal();                       // ปิด + reset ปุ่มทันที
  setTimeout(fetchAdminData, 3000);       // refresh หลัง 3 วิ
}

// แปลง dataURL → File object (สำหรับส่งเข้า fileToWebP)
function dataURLtoFile(dataURL, filename) {
  const arr  = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new File([u8], filename, { type: mime });
}

async function deleteRow(rowIndex) {
  if (!confirm('⚠️ ยืนยันการลบรายการนี้?')) return;
  try {
    await fetch(API_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete', sheet: adminSheet, rowIndex }) });
    setTimeout(fetchAdminData, 1000);
  } catch(e) {
    alert('❌ ลบไม่สำเร็จ โปรดลองอีกครั้ง');
  }
}

function closeEditModal() {
  // reset ปุ่มบันทึกก่อนปิดเสมอ
  const saveBtn = document.getElementById('editSaveBtn');
  if (saveBtn) { saveBtn.textContent = '💾 บันทึก'; saveBtn.disabled = false; }
  document.getElementById('editModal').style.display = 'none';
  editRow = null;
}

// ============================================================
//  Keyboard Shortcuts
// ============================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('imgModal').style.display  = 'none';
    document.getElementById('editModal').style.display = 'none';
    editRow = null;
  }
});

// ============================================================
//  Init
// ============================================================
(function init() {
  // วันที่เริ่มต้น
  document.getElementById('c_date').value = toDisplayDate();
  document.getElementById('j_date').value = toDisplayDate();

  // Date pickers
  setupPicker('c_date',          'c_date_picker');
  setupPicker('c_doneDate',      'c_doneDate_picker');
  setupPicker('j_date', 'j_date_picker');

  // Image preview — CCTV
  setupImagePreview('c_image1', 'preview1');
  setupImagePreview('c_image2', 'preview2');
  setupCameraSync('c_image1_cam', 'c_image1', 'preview1');
  setupCameraSync('c_image2_cam', 'c_image2', 'preview2');

  // Image preview — Job
  setupImagePreview('j_image', 'j_preview');
  setupCameraSync('j_image_cam', 'j_image', 'j_preview');
})();
