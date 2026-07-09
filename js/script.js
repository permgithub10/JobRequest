// ============================================================
//  CCTV System - Frontend Logic v3.0
//  แก้ไข URL ด้านล่างให้ตรงกับ Web App URL ของคุณ
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbzMjiqCx1_4xyHMiIy5T_sjQ2TXXh02mAtfFHI9w1YtvbrBPXz6DtivD0oEneqqbEPz/exec';

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
    if (!d) return '............/............/............';
    return d.replace(/-/g, '/');
  }

  const pdfB64 = 'JVBERi0xLjcNCiW1tbW1DQoxIDAgb2JqDQo8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvTGFuZyh0aC1USCkgL01ldGFkYXRhIDU1IDAgUi9WaWV3ZXJQcmVmZXJlbmNlcyA1NiAwIFI+Pg0KZW5kb2JqDQoyIDAgb2JqDQo8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1sgMyAwIFJdID4+DQplbmRvYmoNCjMgMCBvYmoNCjw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSL0YyIDEyIDAgUi9GMyAxNCAwIFIvRjQgMTYgMCBSL0Y1IDE4IDAgUi9GNiAyMCAwIFIvRjcgMjUgMCBSL0Y4IDI3IDAgUi9GOSAyOSAwIFI+Pi9FeHRHU3RhdGU8PC9HUzEwIDEwIDAgUi9HUzExIDExIDAgUj4+L1hPYmplY3Q8PC9JbWFnZTM0IDM0IDAgUj4+L1Byb2NTZXRbL1BERi9UZXh0L0ltYWdlQi9JbWFnZUMvSW1hZ2VJXSA+Pi9NZWRpYUJveFsgMCAwIDU5NS4zMiA4NDEuOTJdIC9Db250ZW50cyA0IDAgUi9Hcm91cDw8L1R5cGUvR3JvdXAvUy9UcmFuc3BhcmVuY3kvQ1MvRGV2aWNlUkdCPj4vVGFicy9TPj4NCmVuZG9iag0KNCAwIG9iag0KPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCA1Njk1Pj4NCnN0cmVhbQ0KeJztPUtv5LjRdwPzH3S0A1jh+xEYBjy2O/gWyGGxg+QQ5BAsNgMEyS6SDZC//1WRlNQtFtXqJtVtTzwDv1qkqlisF4vF4r8+3bCe4T/nLO9Yp73upeic4r0X3b9/+nTzp990P3+6+fzl081vd7zzvTfdl799usHGrOOd4L00HXc9F92Xf0Kj3//AWff1V3hx9zX+ydOfv/900yE0Z1T35cc/PzC+Y2u/Hv/Sffnu080roPH9p5t/VaOtNCI8oR2QDSgCXmznHu8F4MfYo8YfBj7aPd6rh2pURI6Kdr12isbl9nd3+rbb3d1zdvuHu8aALUwdKwG+bw5N9srQ0Lp7eLdSHrni9vNLa8iO9/py43SyN0vjZFqLMFDGWoP2rPdFTvLNoaneFsnatYbGte95gax7SuW2O+VfFZKUMtSml7asVp6jLnl9fbyX8Pfrc/jJ2RPj3MNPgc/g5wu0Nant06PDJn4L1SOc6YUu86qWOhD1d+0p5eAjmlIHUgJU4gK/WhsA4W3Pi1O1gcUR3veqzBswz8HU4NQ/RVPDLGMvPrJCe3ykYL2k5z5QXT6C0cFfgAk5YMJdFQaSwECq3vtNFAhl8aUGO3tUgZzklVzEU7GspPj+PLooQW0YHnnm9XlSKYBPUDUgROF3zuGPl5dHM/CXeZRxyLUyRkyw5gxsfuMJPh0zIJ4C/4JwW53w2K8t74FM8QI4JnptLgbOOtbcLnOdSTEDYL6zWvWyuRQTE6csGg4L0swpE/sCfP0a5IHtLMiEQh6PvL5zIBNgTHYymF71kDd5FSgZICDJEGMvHa0v51GSdq9BairJmI1LAv1MYVyVZDQEOK5ZbxUsAUzvMo6st380SImwiiBxal538WunooYSYS2GhhFnaVdHdhIp8GK1XUYKuAF1K3t5Dl/AFUnlNsdGCN0LX8QG2XT0DoK2FxGr3XNk2+fIusDoDCYQFbu2jx5x9UnNV6FsKZRhdcVKKN8+393L+O3LH3El25yPJXO9kMvztwNbyHQ0comb4M+B10CwgWp2MJ9VBHIUhgaUfpFAdctPkiJG95aXKQI8E/mm3quk+EE6HcwBPdynH+/u1S18E7c/3ZnbX/GX8K274yIyyi8/w4P//PuXf1RRhkJNadEzUUKt2jIWfAzjXa8bQyMFMUJzwVvc3oBo20unCvDQTO7CygHXvMEYz5zS6JM2V6DO9V6VsdrCrHlgKnNhkOAjLNGe+eSqoHaLbgxnUfmZFM5ExYcfhXVDmqadDT5RMnFqGxMHhhzotYD7U3PXihvbK7FSNMKjgbmtB0J3kqPXDksZF8D97TdnrI2K8mp4b11CaiOXeRjNHNRDtH0Y7FYxCoX+cGCJtJQNppKlAPjzHseklebLc2ySejERvIwUt0Amcg/JG9k93gef6fPYGl1wsxf8Am2Angq6NzJZaGDIGIZPPXbyMcVFEibYA1o25xghZS9488lZYAPNcaXcDJLodIkLGkNaGJO0vVbbQhoGdQFQXm4CihJYjmEJl4N62HdUR3EI/uvL9DHbBanBJcDCV1jCHGmy95ogyZdofmLP7Jlpjmfr2ZVCYuCVmt3Xp8lgY8Ru30Lj4u4Ipm+BdM3JpSTuj1Lkqg+2EtCgaQFaWEryaIlezHvm9FrCkZoYVDG/jNJP5gWWcUpcxnOag3qgnOe5O3RkcmpUUvPmj/ZhE+HlTmB0aE7A7nCHbz2hNkFSMN8rTc3ycfq2R0ZYDEjSyMymazskoCmXR5CoUEjtEbawxMv5LHhMu7hoMKDBn0qCmWZ5O5Xc3otQFsOKx6doxitHFURzRGERLXKGXqUC2iPjRe9JUec87gr5YcX6kpa9MsaucP/hynpKwdJtacZn3NsevpEYDjlbmbdHCFiLiTbWJUz8JZo2D1ZobfqcCJQ7JFxvXKed6yV0A786ZECihzPBWdlsYf9B9tBSY3aYP+TS80LCddgYDVQh0aGc4EpYsFBRF4JlecgypMicor/51iWmEk0e6s4khkxBYYy3xRzX1DrE8kDtIfJDnGEnY+PnvYQ1H58Oy1YerGAIB/qY6qYf9vfgh6DiCPg5vSdCMSxt+5q0IxzzWxBb9hTeVUdMaotOaI/eQ0bMuQgNrA0/ZIgKw18HYeHvAyYgjMz0Nj46eH7sIYwhPsUhgBY4eK6Nnfpa791JjwPoRKDwYI8+Q/fpceg/azGSWTqPLmois4fvhlIgy83Ky7tEZcyjlWv02Ro4RDzUqR5TvtbAORUa6XnEUZmQBHioFkvsfDYoXwTlQrj8PopzENSdDooY165qXLs2RshCb5FjFBI9JbxjKe2uMSrekKhM8KPu3E37H81RAMpj6g01PzG/Yz+3I2YpPQ+xhZTeER12RFLbx3sbEzwaY2kE7pbRhGoOS1OwSP5oDRoM6dVAhwzk1VLRGrwzFPg0wcnQ7knBBigIxjHd6YimGhN1quCT23xC946AH9JU5O2PP+H3X3+tMzyUu2ExKJaDbQ7IMBrQ8526/QUH9/OdpnNtKgF7cI7kImvfFs9gVBo/rjGP8hoCLQWnQI9JV9FpRvMa7G+ealZHdIkbJa3ZypOhJ04BSuc2+EBj+dz6K2z37/3Zdvo0E7jbT2mj+nBfnUushe/XzWwDxzh5qtohMzdiowWPWKlec0L52+Tk4KLxKfqmeszCjgKVpwrVYWRg9aRylDCexHWKJoUMmdbOlrUxckDQAjf8mUiJWSFGEn+MSTcpchJS1OX+kh7QZFNyj045Xy+MSrGqdCVUYE8C+6XoenMnUvaSpuEGsMDICJJRFgOPG3iQTC8Q/gD2ifsAm21DtnYitcJcrcK8v5tReB9s6hqOau22MNXzY1z0Zrhn++bZs/YpRW+1eWHojR1VdC14rj038zCEPE1Lr/m62HbRZZu2g9JaP3LbW5nNZbOMBEJYWo8A/BNcjG85ggaokytLZsK+yhz1276/c/At/sNjPG0+CL+ZDV/cONwBCo0gzkbaDFap0n9os29hmBtpmFM4pDUKVgRnfIZCnS/Z2t3lvdVHUDwHzbfkyH24vJVDb+/y5hy3kYVQjmPCXZ7cNpwKtGmo01HodDxrzFw+2AxOyRsmbsQAaUINka3n7xvn4A1Uv/HU1Lehz0ZoY+jByAW03/u8SJgXrbebl29cSi4z9NabNbhzkk/5VtrecDxNRmWy0Fv4enGDv93T1rFuFsL764ab5/DUDG65w0WJepGnG4+39aY7fGQLfHEEwcZREiUwSpJhspXgKyrN+INHr45zY88OZlvKwmx/g0RtLCpJJmfUu0g2kHIU6E0SKKXmBVhDPY0xeSCdhhsT+FtjYjnmqGQEbxGlPOXraqG+xvRUnmOxKnJmh1SYVJDl8LzHXsZIfVI3nZNk8DRYhtlW5g5eIuU3Zu5a+8hAKu1WkorIc38D6v/Dh9jINMx44iIWUNteyeuANpICvY3xNaYAC5PyzrFda8r3FNpcc9OiJq2QWlAp6OdETtjmefLJwuC5nMOITYc1S6dvd/dr/2yLn7e9ECSC28EEdyLEW5ZhLlFh9uBECp7/Zx3c1pzle+6XqdjaXUoKfw7yoba81Lkq6/pB5sZqyUs8J0DN6RaOr8SCAB+O7xrHdx2pPhzftz/eTRzROXtc0BElOHPvNqBZLdTmIRmP16xcZfROU6ALBxTifTOnGBoeaka0sRbBTPF0Xcq6N+4X82sbXFFYyJpQaHMb8/1Y2MFiTYpSUYn0uFRVYupdqBuRhhHrRkyjGPpPj2PdiMMWkRhKdUIEfx6xAJzShV7zwhHH2w0l0CVlLJ3BPIhjRnktkEQrCo7GiiGLcLgPcMADZCaUR4Q55tL2PhuzBwrjUV0N6Fi8XwVr+eSkOdpsoSgPfOLC1QBuftZuRVEeSXF3BTZ4esooCp2CCqqB5cBZy2Gl682OKr8KyFb3TJCjXFugnfMYs3+JZbBTgd8jVz7FY35mbzY/x8ISLza6PkNxiXDD3Gss0f0U7rQZbx0DPDCOgJrtVaVCPsNbn+Lfh/VCgiIk1/8rCUiW5VEG+2UEzMryJOZWvdN7ZXmCLjqszAOApTUouaOmhJnf13XHW+CAYgvUHSxvEzTi+I5Ro57YJOESSRcV70i48RXj06h3DxqM5EcNZMxIfu5pDbTcrHxaOBJfazyecUzvrgRDb6cFOEpgxYaZBkvC5NL1eSwWthnuayqx5bmYGBZOCROolHXIOuISsCQJa387jbqcsXKAPiougtZvdYV/tQrLbSkvmMa6q2XKn5lL2xhLkEWdY3nyHu/HoY8WetEpDPetF9a1nP2mI3rXThttPIlYwpM2blWgSodvoUMGayuDLcxh1OHjuNrHMBe7ttaPPMQ25ny45cHh6zYvjKUxWfE2ZScKZG0Oy/W8TpMU2LM1osZiWZh1vPamjhe2Z5qS7cGFxZw+VbaHrlAWbA/zhw5qdYGyWQGyIx//b72tOa/YXuRzWMcronM0qwgPD46f3q92h4QT8135N70P97+273jx8TZemXuFAUGCy47ngQ+4nuvFHUlaq3epTjSY7RBorNmU1pjSPZ+kg5jeWLbED1VLGnsqLlzTRTLKYVp5IEG+CZAu5vTBsTqaZr4SUzLNXIaL6jNMt1LQRuHVix8K+t2Pt7FmBXfE8ePssT1Rm6+PNcYP6YE1h+UuB0vwC8JSBVhXyAAv2LurWc/Tm9ds2NHJNOEa52x6tjIhykz3jH+YkDeB1Xsc70YKkeTOjRTiZWCF5M7LwAJnlIZVzuZsp+sPkxPn1SrP0++h28qsR73ldji5UjIhyJyRm86CxDwJPeUpzjOAUuqOHhMyWd4mJNXog2RG4jUpq0+ny7+4YHgLYd6Amf0kInVai0Q2TB3cTzM6TACa0IgJQIeYDC0ilL0so/wlC032skwxz5OVM6OONkgJscUWHm+QTi2QWdL1alnm1PgOMnMK2E7yHuwwZ5hDK5TCPCt0PWfXlK1otZBRaZCXsSytMmszKjPxqMLAMJAKlaGQZTYyrhoDjvccEmOnNO5qULZ8zWEGinDdqoZkVcgSpaaTNZ42i8nRNPUYm98pnk7xh+swwlVIeXilChkebw0l2VjGoI6fElD3UkNf3RTyeWLxxtzhhrJ0cYcb7l0OdQPTIPRDuoI5d/JXD4TMFY1XSR1llEFsTb+UKoqWyxoMOA34eBA2TimRVe0W1AiobK9P1CNBzkJmts4tbiU+WmAZ45WyfQIwSroxa9TIVdJdPSyHRV8L8h3jnSxd+JyuSGWHGdaHJTHj/TM2htL9KJ6R53Hm2OvnKZ16Pns83ueCN/0Nd5zt7J6Mo/ANrx8RgZamkGW9njaU6Gghgpd1VHQGVh1kx1CiAw/S6QqpaEdsVQt0f2ILVAXS5n4YDBoFfnoN+gBUKyRNehWQRkjS65veQ3p9K5qkYcVJGG9YNRnCUwNE+LBNADM2GC9hNZlvoy3eoDBoSS0xsJH7Nsutlg6tBT/d47WddXEMUsefi5ZRPcczNDleyQYlUXoerskcrE9bNLwKZoNCY9g7May4G7IaNH0on2HNnQx08SKwFmzgGJ7mentskON1FTYgyANmOR49MMgK8ShNQ86gL5UF5VSYq8aQwFzQkPCC8GCp9m4Hn66tRXvWFhGNCyCSD16C3/R48nnS68W86fBJFX2wR7AwOX1OGu/5WFHBeAGrR6dzrEorukrlZcCV+Mg+PnmIbQXVebxpeDYXW1/Qdm2RLDG/zCmxEe8ricHBD+b/RobZ1pUcWHHGJFvxohSY87RcfGIbd1E5CoE1iRutnlbMW3bcFsugK2I4G00brD7fVLZqW7sUS8rng9xPlgxriSxb8my9klcOOdaUfHbx8ynDPCwV1l+e0WL+Up2T62Qv9MmM2vaCgGs9XVuBvMpQKC6xnv2cwhspHMawQs0b0jgr8jIqF+4iKHRy4K1B6cuBcliQjQDVKCPuXaez1TluChYPNiftNgLpOH5/o/LY2BvwKB35gK9UNvOibNo68sR6oylSNl/F4DF2nkHaRhbwjrWriELjwDUHr1fNRlNckLUWMoYu9ww2gHZWLdfiqgRrULapCdxEiWSAFtID96a8UlvERD76Pa0jehx75MM8WQ+Fpsv5h5cJS0uNwfLZiIhEw2m/PYFK2+3EHuyqdktLG9BqMtvsOxrGK+UHnI2HDzcQ0dvB7YGZSwLzYWlD7eSOu4YhdSP+bcldxBOQoEuEM7xAZc2ebiWkgaFmWy/7qv+2w3/NAcOkEoArh1iaUU/sLj2kjJ3nVCLxNcRzuF2nVjc5kHOGM/eOFj3nNm8t4ho+UmLlJmgb+tYMgb5P1IcStReQnqQgPjZN390wW8uNQkVKb9kS0tteannIcyqBX5C+s4W3sc3DWjeYHnR8q7eR0H7s9n4zw9xKnOZ7ve9RnlbsVzcSqGM7xm9gK2JtYPQk2uclng04IHbVnnMj0r+1bedNbrypI5UEUuGkUKRqD0vRsBarCj3euwf6htlK14SpsMY7xKbpDbMbafnWhHDQvQkdSuURp4+bq3OheyHW7Co3UinvYGO55ml7kbdB5MtkW3WNVnOWB0/G8wyt9bsXtfDxDJRau4VeDUzhwWx6E709sKBMCFivr+nkZ56/XwtThaMEBMzBkJjh1/1P8Kxcmt4QxeMx4T/cTPKS7sE2qXgZUZaydmFczmwoHs07W0syHjLUVuz1t4kN5xuprS/wbK3f8fZdTe01E9qzkPXVGiPoAaqTwIix8YjpvXlYccZ0PGMdz5iycLgpHK5Od568ft4/YXqwrchFMN/JQ+NMBwk20/vxhHcCt3/ItDULg4zzPK1iM0N/tU3692zmT9ivjl79hFRFiGCMMpx9617tG3WzsAsZuOcSfdzje8rT0WG9eCA6NDhyHnp8CVs4Dh1ftHAaenjLwknnSJV40Hmiyd5z05vpfPdBSZk1DWC8scE03sMSOXG8ExY43hkiQ5sRUKJJ9iKc5AhspElWJmeEFI9lH0IKDQYwxUo7yy2A4XDtBv+cs8hDGm9/FJ1TgRqrshg4HhYHgtkjuvYUQORBZKlx+M0gpbZdbA32UOpiWyuRN+F/+EUYrN4CPpnofgQ8fvt///zr15/AZ3r5pfse8f366UZx3TtoLbERN4AzvBRDCAPlGdaG+O+wluDdd91ynx8Ctoob5BUrLaDBQcq97YCX/PzmxlXtlhzzcOLDMYEVFyKtv85O3aKRR132Eq4CDLbitOJjb/EYXqaOTyAkRhbySsJ4mRpNSGQ8zvVe7eWMkWuhY0pSATrAvOMMAd/di9stgIf7hQqwc5ltw7HWKozYZxw7Dxrup9rM3A45uR2tccSrEws4tgyhbdu0uYioUMGUnrkZk7bnUYXWsQB7MyZVBqutEEw6L4M+cSney6oGxj2sdbDeix3/vvo1MLkTX8NWdAaLRGNKkppwh6HPdx10+3t3IxSaZoMXSosOOmor8LhX+uAfwRQr2ytM4gMUMYCFGOK3wbgHew6v/Hvnuj8sNcZXhWu6rQ8nY7M3LTz+Aesb4g3fwLxk1+LT2BNHyYGiRhQ6FxtAf/CT8Hpd40KmU9594Tn05i6QVJsU8M26LzWA/jJux5TBLzWA/v8PTAhqnQ0KZW5kc3RyZWFtDQplbmRvYmoNCjUgMCBvYmoNCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUwL0Jhc2VGb250L0JDREVFRStUSFNhcmFidW5QU0svRW5jb2RpbmcvSWRlbnRpdHktSC9EZXNjZW5kYW50Rm9udHMgNiAwIFIvVG9Vbmljb2RlIDM3IDAgUj4+DQplbmRvYmoNCjYgMCBvYmoNClsgNyAwIFJdIA0KZW5kb2JqDQo3IDAgb2JqDQo8PC9CYXNlRm9udC9CQ0RFRUUrVEhTYXJhYnVuUFNLL1N1YnR5cGUvQ0lERm9udFR5cGUyL1R5cGUvRm9udC9DSURUb0dJRE1hcC9JZGVudGl0eS9EVyAxMDAwL0NJRFN5c3RlbUluZm8gOCAwIFIvRm9udERlc2NyaXB0b3IgOSAwIFIvVyAzOSAwIFI+Pg0KZW5kb2JqDQo4IDAgb2JqDQo8PC9PcmRlcmluZyhJZGVudGl0eSkgL1JlZ2lzdHJ5KEFkb2JlKSAvU3VwcGxlbWVudCAwPj4NCmVuZG9iag0KOSAwIG9iag0KPDwvVHlwZS9Gb250RGVzY3JpcHRvci9Gb250TmFtZS9CQ0RFRUUrVEhTYXJhYnVuUFNLL0ZsYWdzIDMyL0l0YWxpY0FuZ2xlIDAvQXNjZW50IDg1MC9EZXNjZW50IC0yNTAvQ2FwSGVpZ2h0IDg1MC9BdmdXaWR0aCAzNzQvTWF4V2lkdGggMTM3NC9Gb250V2VpZ2h0IDQwMC9YSGVpZ2h0IDI1MC9TdGVtViAzNy9Gb250QkJveFsgLTQyNyAtMjUwIDk0NyA4NTBdIC9Gb250RmlsZTIgMzggMCBSPj4NCmVuZG9iag0KMTAgMCBvYmoNCjw8L1R5cGUvRXh0R1N0YXRlL0JNL05vcm1hbC9jYSAxPj4NCmVuZG9iag0KMTEgMCBvYmoNCjw8L1R5cGUvRXh0R1N0YXRlL0JNL05vcm1hbC9DQSAxPj4NCmVuZG9iag0KMTIgMCBvYmoNCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1RydWVUeXBlL05hbWUvRjIvQmFzZUZvbnQvQkNERkVFK1RIU2FyYWJ1blBTSy9FbmNvZGluZy9XaW5BbnNpRW5jb2RpbmcvRm9udERlc2NyaXB0b3IgMTMgMCBSL0ZpcnN0Q2hhciAzMi9MYXN0Q2hhciAxMTYvV2lkdGhzIDQ0IDAgUj4+DQplbmRvYmoNCjEzIDAgb2JqDQo8PC9UeXBlL0ZvbnREZXNjcmlwdG9yL0ZvbnROYW1lL0JDREZFRStUSFNhcmFidW5QU0svRmxhZ3MgMzIvSXRhbGljQW5nbGUgMC9Bc2NlbnQgODUwL0Rlc2NlbnQgLTI1MC9DYXBIZWlnaHQgODUwL0F2Z1dpZHRoIDM3NC9NYXhXaWR0aCAxMzc0L0ZvbnRXZWlnaHQgNDAwL1hIZWlnaHQgMjUwL1N0ZW1WIDM3L0ZvbnRCQm94WyAtNDI3IC0yNTAgOTQ3IDg1MF0gL0ZvbnRGaWxlMiA0MiAwIFI+Pg0KZW5kb2JqDQoxNCAwIG9iag0KPDwvVHlwZS9Gb250L1N1YnR5cGUvVHJ1ZVR5cGUvTmFtZS9GMy9CYXNlRm9udC9CQ0RHRUUrVEhTYXJhYnVuUFNLL0VuY29kaW5nL1dpbkFuc2lFbmNvZGluZy9Gb250RGVzY3JpcHRvciAxNSAwIFIvRmlyc3RDaGFyIDMyL0xhc3RDaGFyIDMyL1dpZHRocyA0MCAwIFI+Pg0KZW5kb2JqDQoxNSAwIG9iag0KPDwvVHlwZS9Gb250RGVzY3JpcHRvci9Gb250TmFtZS9CQ0RHRUUrVEhTYXJhYnVuUFNLL0ZsYWdzIDMyL0l0YWxpY0FuZ2xlIDAvQXNjZW50IDg1MC9EZXNjZW50IC0yNTAvQ2FwSGVpZ2h0IDg1MC9BdmdXaWR0aCAzNzQvTWF4V2lkdGggMTM3NC9Gb250V2VpZ2h0IDQwMC9YSGVpZ2h0IDI1MC9TdGVtViAzNy9Gb250QkJveFsgLTQyNyAtMjUwIDk0NyA4NTBdIC9Gb250RmlsZTIgMzggMCBSPj4NCmVuZG9iag0KMTYgMCBvYmoNCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1RydWVUeXBlL05hbWUvRjQvQmFzZUZvbnQvQkNESEVFK0NvcmRpYU5ldy9FbmNvZGluZy9XaW5BbnNpRW5jb2RpbmcvRm9udERlc2NyaXB0b3IgMTcgMCBSL0ZpcnN0Q2hhciAzMi9MYXN0Q2hhciAzMi9XaWR0aHMgNDUgMCBSPj4NCmVuZG9iag0KMTcgMCBvYmoNCjw8L1R5cGUvRm9udERlc2NyaXB0b3IvRm9udE5hbWUvQkNESEVFK0NvcmRpYU5ldy9GbGFncyAzMi9JdGFsaWNBbmdsZSAwL0FzY2VudCA4OTMvRGVzY2VudCAtMjU0L0NhcEhlaWdodCA4OTMvQXZnV2lkdGggMjkzL01heFdpZHRoIDEyMjkvRm9udFdlaWdodCA0MDAvWEhlaWdodCAyNTAvU3RlbVYgMjkvRm9udEJCb3hbIC00NTIgLTI1NCA3NzcgODkzXSAvRm9udEZpbGUyIDQ2IDAgUj4+DQplbmRvYmoNCjE4IDAgb2JqDQo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UcnVlVHlwZS9OYW1lL0Y1L0Jhc2VGb250L0JDRElFRStDYWxpYnJpL0VuY29kaW5nL1dpbkFuc2lFbmNvZGluZy9Gb250RGVzY3JpcHRvciAxOSAwIFIvRmlyc3RDaGFyIDMyL0xhc3RDaGFyIDMyL1dpZHRocyA0NyAwIFI+Pg0KZW5kb2JqDQoxOSAwIG9iag0KPDwvVHlwZS9Gb250RGVzY3JpcHRvci9Gb250TmFtZS9CQ0RJRUUrQ2FsaWJyaS9GbGFncyAzMi9JdGFsaWNBbmdsZSAwL0FzY2VudCA3NTAvRGVzY2VudCAtMjUwL0NhcEhlaWdodCA3NTAvQXZnV2lkdGggNTIxL01heFdpZHRoIDE3NDMvRm9udFdlaWdodCA0MDAvWEhlaWdodCAyNTAvU3RlbVYgNTIvRm9udEJCb3hbIC01MDMgLTI1MCAxMjQwIDc1MF0gL0ZvbnRGaWxlMiA0OCAwIFI+Pg0KZW5kb2JqDQoyMCAwIG9iag0KPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTAvQmFzZUZvbnQvQkNESkVFK1RIU2FyYWJ1blBTSy1Cb2xkL0VuY29kaW5nL0lkZW50aXR5LUgvRGVzY2VuZGFudEZvbnRzIDIxIDAgUi9Ub1VuaWNvZGUgNDkgMCBSPj4NCmVuZG9iag0KMjEgMCBvYmoNClsgMjIgMCBSXSANCmVuZG9iag0KMjIgMCBvYmoNCjw8L0Jhc2VGb250L0JDREpFRStUSFNhcmFidW5QU0stQm9sZC9TdWJ0eXBlL0NJREZvbnRUeXBlMi9UeXBlL0ZvbnQvQ0lEVG9HSURNYXAvSWRlbnRpdHkvRFcgMTAwMC9DSURTeXN0ZW1JbmZvIDIzIDAgUi9Gb250RGVzY3JpcHRvciAyNCAwIFIvVyA1MSAwIFI+Pg0KZW5kb2JqDQoyMyAwIG9iag0KPDwvT3JkZXJpbmcoSWRlbnRpdHkpIC9SZWdpc3RyeShBZG9iZSkgL1N1cHBsZW1lbnQgMD4+DQplbmRvYmoNCjI0IDAgb2JqDQo8PC9UeXBlL0ZvbnREZXNjcmlwdG9yL0ZvbnROYW1lL0JDREpFRStUSFNhcmFidW5QU0stQm9sZC9GbGFncyAzMi9JdGFsaWNBbmdsZSAwL0FzY2VudCA4NTAvRGVzY2VudCAtMjUwL0NhcEhlaWdodCA4NTAvQXZnV2lkdGggMzk2L01heFdpZHRoIDE0MTMvRm9udFdlaWdodCA3MDAvWEhlaWdodCAyNTAvU3RlbVYgMzkvRm9udEJCb3hbIC00NjYgLTI1MCA5NDcgODUwXSAvRm9udEZpbGUyIDUwIDAgUj4+DQplbmRvYmoNCjI1IDAgb2JqDQo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UcnVlVHlwZS9OYW1lL0Y3L0Jhc2VGb250L0JDREtFRStUSFNhcmFidW5QU0stQm9sZC9FbmNvZGluZy9XaW5BbnNpRW5jb2RpbmcvRm9udERlc2NyaXB0b3IgMjYgMCBSL0ZpcnN0Q2hhciAzMi9MYXN0Q2hhciAxMTYvV2lkdGhzIDUzIDAgUj4+DQplbmRvYmoNCjI2IDAgb2JqDQo8PC9UeXBlL0ZvbnREZXNjcmlwdG9yL0ZvbnROYW1lL0JDREtFRStUSFNhcmFidW5QU0stQm9sZC9GbGFncyAzMi9JdGFsaWNBbmdsZSAwL0FzY2VudCA4NTAvRGVzY2VudCAtMjUwL0NhcEhlaWdodCA4NTAvQXZnV2lkdGggMzk2L01heFdpZHRoIDE0MTMvRm9udFdlaWdodCA3MDAvWEhlaWdodCAyNTAvU3RlbVYgMzkvRm9udEJCb3hbIC00NjYgLTI1MCA5NDcgODUwXSAvRm9udEZpbGUyIDU0IDAgUj4+DQplbmRvYmoNCjI3IDAgb2JqDQo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UcnVlVHlwZS9OYW1lL0Y4L0Jhc2VGb250L0JDRExFRStUSFNhcmFidW5QU0stQm9sZC9FbmNvZGluZy9XaW5BbnNpRW5jb2RpbmcvRm9udERlc2NyaXB0b3IgMjggMCBSL0ZpcnN0Q2hhciAzMi9MYXN0Q2hhciA0NS9XaWR0aHMgNTIgMCBSPj4NCmVuZG9iag0KMjggMCBvYmoNCjw8L1R5cGUvRm9udERlc2NyaXB0b3IvRm9udE5hbWUvQkNETEVFK1RIU2FyYWJ1blBTSy1Cb2xkL0ZsYWdzIDMyL0l0YWxpY0FuZ2xlIDAvQXNjZW50IDg1MC9EZXNjZW50IC0yNTAvQ2FwSGVpZ2h0IDg1MC9BdmdXaWR0aCAzOTYvTWF4V2lkdGggMTQxMy9Gb250V2VpZ2h0IDcwMC9YSGVpZ2h0IDI1MC9TdGVtViAzOS9Gb250QkJveFsgLTQ2NiAtMjUwIDk0NyA4NTBdIC9Gb250RmlsZTIgNTAgMCBSPj4NCmVuZG9iag0KMjkgMCBvYmoNCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUwL0Jhc2VGb250L0JDRE1FRStUSFNhcmFidW5QU0svRW5jb2RpbmcvSWRlbnRpdHktSC9EZXNjZW5kYW50Rm9udHMgMzAgMCBSL1RvVW5pY29kZSA0MSAwIFI+Pg0KZW5kb2JqDQozMCAwIG9iag0KWyAzMSAwIFJdIA0KZW5kb2JqDQozMSAwIG9iag0KPDwvQmFzZUZvbnQvQkNETUVFK1RIU2FyYWJ1blBTSy9TdWJ0eXBlL0NJREZvbnRUeXBlMi9UeXBlL0ZvbnQvQ0lEVG9HSURNYXAvSWRlbnRpdHkvRFcgMTAwMC9DSURTeXN0ZW1JbmZvIDMyIDAgUi9Gb250RGVzY3JpcHRvciAzMyAwIFIvVyA0MyAwIFI+Pg0KZW5kb2JqDQozMiAwIG9iag0KPDwvT3JkZXJpbmcoSWRlbnRpdHkpIC9SZWdpc3RyeShBZG9iZSkgL1N1cHBsZW1lbnQgMD4+DQplbmRvYmoNCjMzIDAgb2JqDQo8PC9UeXBlL0ZvbnREZXNjcmlwdG9yL0ZvbnROYW1lL0JDRE1FRStUSFNhcmFidW5QU0svRmxhZ3MgMzIvSXRhbGljQW5nbGUgMC9Bc2NlbnQgODUwL0Rlc2NlbnQgLTI1MC9DYXBIZWlnaHQgODUwL0F2Z1dpZHRoIDM3NC9NYXhXaWR0aCAxMzc0L0ZvbnRX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bnMjIj4KPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgIHhtbG5zOnBkZj0iaHR0cDovL25zLmFkb2JlLmNvbS9wZGYvMS4zLyI+CjxwZGY6UHJvZHVjZXI+TWljcm9zb2Z0wq4gV29yZCAyMDE5PC9wZGY6UHJvZHVjZXI+PC9yZGY6RGVzY3JpcHRpb24+CjxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiICB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iPgo8ZGM6Y3JlYXRvcj48cmRmOlNlcT48cmRmOmxpPuC4k+C4seC4kOC4nuC4pSDguKvguKXguIfguKrguKfguLLguKrguJTguLTguYw8L3JkZjpsaT48L3JkZjpTZXE+PC9kYzpjcmVhdG9yPjwvcmRmOkRlc2NyaXB0aW9uPgo8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIj4KPHhtcDpDcmVhdG9yVG9vbD5NaWNyb3NvZnTCriBXb3JkIDIwMTk8L3htcDpDcmVhdG9yVG9vbD48eG1wOkNyZWF0ZURhdGU+MjAyNC0xMC0yNVQxNDowNjo1NCswNzowMDwveG1wOkNyZWF0ZURhdGU+PHhtcDpNb2RpZnlEYXRlPjIwMjQtMTAtMjVUMTQ6MDY6NTQrMDc6MDA8L3htcDpNb2RpZnlEYXRlPjwvcmRmOkRlc2NyaXB0aW9uPgo8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiAgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iPgo8eG1wTU06RG9jdW1lbnRJRD51dWlkOjYzRDQyRDRCLTVEOEYtNDlDQS04MjdGLTNDQkFFQUJFNTdBODwveG1wTU06RG9jdW1lbnRJRD48eG1wTU06SW5zdGFuY2VJRD51dWlkOjYzRDQyRDRCLTVEOEYtNDlDQS04MjdGLTNDQkFFQUJFNTdBODwveG1wTU06SW5zdGFuY2VJRD48L3JkZjpEZXNjcmlwdGlvbj4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCjwvcmRmOlJERj48L3g6eG1wbWV0YT48P3hwYWNrZXQgZW5kPSJ3Ij8+DQplbmRzdHJlYW0NCmVuZG9iag0KNTYgMCBvYmoNCjw8L0Rpc3BsYXlEb2NUaXRsZSB0cnVlPj4NCmVuZG9iag0KNTcgMCBvYmoNCjw8L1R5cGUvWFJlZi9TaXplIDU3L1dbIDEgNCAyXSAvUm9vdCAxIDAgUi9JbmZvIDM2IDAgUi9JRFs8NEIyREQ0NjM4RjVEQ0E0OTgyN0YzQ0JBRUFCRTU3QTg+PDRCMkRENDYzOEY1RENBNDk4MjdGM0NCQUVBQkU1N0E4Pl0gL0ZpbHRlci9GbGF0ZURlY29kZS9MZW5ndGggMjAyPj4NCnN0cmVhbQ0KeJwlzjFLAnEcxvH/OQgNgYKDmZfp3aUmNonQ4BGKgwQtbWFTvoHEEOeW1M2rqc3htmj2PfQCmpwCBzcpGk/9Pr/h+SwPPD9jdhdF1i6TxuwZik+IZSEdwlFVdMQaMjU4Lop7EUC2CXZd/MDJN+Se4XQAeRsKh+JdLMB5EB/g6hfvDs5uoRgXEZRehJrla/EG52O49KHRA78LV0/wmIb+l1jBIAWzJQRzeJ0KDYUJUYFNC37be6zCCJx/cC/AO4DmBG7+jNkChu8oqQ0KZW5kc3RyZWFtDQplbmRvYmoNCnhyZWYNCjAgNTgNCjAwMDAwMDAwMDAgNjU1MzUgZg0KMDAwMDAwMDAxNyAwMDAwMCBuDQowMDAwMDAwMTE5IDAwMDAwIG4NCjAwMDAwMDAxNzUgMDAwMDAgbg0KMDAwMDAwMDU0MCAwMDAwMCBuDQowMDAwMDA2MzEwIDAwMDAwIG4NCjAwMDAwMDY0NDUgMDAwMDAgbg0KMDAwMDAwNjQ3MyAwMDAwMCBuDQowMDAwMDA2NjM1IDAwMDAwIG4NCjAwMDAwMDY3MDggMDAwMDAgbg0KMDAwMDAwNjk1MSAwMDAwMCBuDQowMDAwMDA3MDA1IDAwMDAwIG4NCjAwMDAwMDcwNTkgMDAwMDAgbg0KMDAwMDAwNzIzNCAwMDAwMCBuDQowMDAwMDA3NDc4IDAwMDAwIG4NCjAwMDAwMDc2NTIgMDAwMDAgbg0KMDAwMDAwNzg5NiAwMDAwMCBuDQowMDAwMDA4MDY3IDAwMDAwIG4NCjAwMDAwMDgzMDggMDAwMDAgbg0KMDAwMDAwODQ3NyAwMDAwMCBuDQowMDAwMDA4NzE3IDAwMDAwIG4NCjAwMDAwMDg4NTkgMDAwMDAgbg0KMDAwMDAwODg4OSAwMDAwMCBuDQowMDAwMDA5MDU5IDAwMDAwIG4NCjAwMDAwMDkxMzMgMDAwMDAgbg0KMDAwMDAwOTM4MiAwMDAwMCBuDQowMDAwMDA5NTYyIDAwMDAwIG4NCjAwMDAwMDk4MTEgMDAwMDAgbg0KMDAwMDAwOTk5MCAwMDAwMCBuDQowMDAwMDEwMjM5IDAwMDAwIG4NCjAwMDAwMTAzNzYgMDAwMDAgbg0KMDAwMDAxMDQwNiAwMDAwMCBuDQowMDAwMDEwNTcxIDAwMDAwIG4NCjAwMDAwMTA2NDUgMDAwMDAgbg0KMDAwMDAxMDg4OSAwMDAwMCBuDQowMDAwMDE0NjU0IDAwMDAwIG4NCjAwMDAwMTU3MTYgMDAwMDAgbg0KMDAwMDAxNTk2NCAwMDAwMCBuDQowMDAwMDE2NTAxIDAwMDAwIG4NCjAwMDAwMjg5NTIgMDAwMDAgbg0KMDAwMDAyOTM4OCAwMDAwMCBuDQowMDAwMDI5NDE1IDAwMDAwIG4NCjAwMDAwMjk3MTYgMDAwMDAgbg0KMDAwMDAzNzU5OCAwMDAwMCBuDQowMDAwMDM3Nzk0IDAwMDAwIG4NCjAwMDAwMzgwMjcgMDAwMDAgbg0KMDAwMDAzODA1NCAwMDAwMCBuDQowMDAwMDQyNTEyIDAwMDAwIG4NCjAwMDAwNDI1MzkgMDAwMDAgbg0KMDAwMDA2MjAxOSAwMDAwMCBuDQowMDAwMDYyNTMzIDAwMDAwIG4NCjAwMDAwNzQzNjEgMDAwMDAgbg0KMDAwMDA3NDc0MyAwMDAwMCBuDQowMDAwMDc0Nzk4IDAwMDAwIG4NCjAwMDAwNzUwMTcgMDAwMDAgbg0KMDAwMDA4MjU3MCAwMDAwMCBuDQowMDAwMDg1NzQ5IDAwMDAwIG4NCjAwMDAwODU3OTQgMDAwMDAgbg0KdHJhaWxlcg0KPDwvU2l6ZSA1OC9Sb290IDEgMCBSL0luZm8gMzYgMCBSL0lEWzw0QjJERDQ2MzhGNURDQTQ5ODI3RjNDQkFFQUJFNTdBOD48NEIyREQ0NjM4RjVEQ0E0OTgyN0YzQ0JBRUFCRTU3QTg+XSA+Pg0Kc3RhcnR4cmVmDQo4NjE5Nw0KJSVFT0YNCnhyZWYNCjAgMA0KdHJhaWxlcg0KPDwvU2l6ZSA1OC9Sb290IDEgMCBSL0luZm8gMzYgMCBSL0lEWzw0QjJERDQ2MzhGNURDQTQ5ODI3RjNDQkFFQUJFNTdBOD48NEIyREQ0NjM4RjVEQ0E0OTgyN0YzQ0JBRUFCRTU3QTg+XSAvUHJldiA4NjE5Ny9YUmVmU3RtIDg1Nzk0Pj4NCnN0YXJ0eHJlZg0KODc1MTQNCiUlRU9G';

  const reporterJ    = JSON.stringify(r.reporter    || '');
  const positionJ    = JSON.stringify(r.position    || '');
  const departmentJ  = JSON.stringify(r.department  || '');
  const unitJ        = JSON.stringify(r.unit        || '');
  const floorJ       = JSON.stringify(r.floor       || '');
  const phoneJ       = JSON.stringify(r.phone       || '');
  const jobTypeJ     = JSON.stringify(r.jobType     || '');
  const detailJ      = JSON.stringify(r.detail      || '');
  const coordinatorJ = JSON.stringify(r.coordinator || '');
  const summaryJ     = JSON.stringify(r.summary     || '');
  const dateJ        = JSON.stringify(toSlash(r.date)     || '');
  const doneDateJ    = JSON.stringify(toSlash(r.doneDate) || '');

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<title>FM-BD-009</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#888;display:flex;flex-direction:column;align-items:center;}
  .toolbar{width:100%;background:#333;color:#fff;padding:8px 16px;display:flex;gap:12px;align-items:center;position:sticky;top:0;z-index:100;}
  .toolbar button{padding:6px 18px;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;}
  .btn-print{background:#1a6dd4;color:#fff;}
  .btn-close{background:#555;color:#fff;}
  .page-wrap{position:relative;margin:16px 0;box-shadow:0 4px 20px rgba(0,0,0,.4);}
  canvas#bgCanvas{display:block;}
  canvas#txCanvas{position:absolute;top:0;left:0;pointer-events:none;}
  @media print{.toolbar{display:none!important;}body{background:#fff;}.page-wrap{margin:0;box-shadow:none;}}
</style>
</head>
<body>
<div class="toolbar">
  <span style="font-size:15px;font-weight:600;">🖨️ FM-BD-009</span>
  <button class="btn-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>
  <button class="btn-close" onclick="window.close()">✕ ปิด</button>
</div>
<div class="page-wrap">
  <canvas id="bgCanvas"></canvas>
  <canvas id="txCanvas"></canvas>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const DATA = {
  reporter   : ${reporterJ},
  position   : ${positionJ},
  department : ${departmentJ},
  unit       : ${unitJ},
  floor      : ${floorJ},
  phone      : ${phoneJ},
  jobType    : ${jobTypeJ},
  detail     : ${detailJ},
  coordinator: ${coordinatorJ},
  summary    : ${summaryJ},
  date       : ${dateJ},
  doneDate   : ${doneDateJ}
};

const PDF_B64 = window._pdfB64;
const SCALE   = 2.0;

async function render() {
  const bytes = Uint8Array.from(atob(PDF_B64), c => c.charCodeAt(0));
  const pdf   = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page  = await pdf.getPage(1);
  const vp    = page.getViewport({ scale: SCALE });

  const bg = document.getElementById('bgCanvas');
  bg.width = vp.width; bg.height = vp.height;
  const tx = document.getElementById('txCanvas');
  tx.width = vp.width; tx.height = vp.height;

  await page.render({ canvasContext: bg.getContext('2d'), viewport: vp }).promise;
  drawOverlay(tx.getContext('2d'), vp.width, vp.height);
}

function fs(H, ratio) { return Math.round(H * ratio) + "px 'Sarabun',sans-serif"; }

function drawOverlay(ctx, W, H) {
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';

  // ── แถว 1: ข้าพเจ้า / ตำแหน่ง / แผนก ──
  ctx.font = fs(H, 0.0155);
  const y1 = H * 0.347;
  ctx.fillText(DATA.reporter,   W * 0.170, y1);
  ctx.fillText(DATA.position,   W * 0.505, y1);
  ctx.fillText(DATA.department, W * 0.764, y1);

  // ── แถว 2: หน่วยงาน / ชั้น / โทรศัพท์ ──
  const y2 = H * 0.383;
  ctx.fillText(DATA.unit,  W * 0.193, y2);
  ctx.fillText(DATA.floor, W * 0.565, y2);
  ctx.fillText(DATA.phone, W * 0.735, y2);

  // ── Checkbox ประเภทงาน ──
  const yCk = H * 0.489;
  const ck  = W * 0.018;
  if (DATA.jobType === 'กล้องวงจรปิด')  drawTick(ctx, W * 0.191, yCk, ck);
  if (DATA.jobType === 'Access Control') drawTick(ctx, W * 0.416, yCk, ck);
  if (DATA.jobType === 'อื่นๆ')          drawTick(ctx, W * 0.597, yCk, ck);

  // ── รายละเอียดของงาน (max 3 lines) ──
  ctx.font = fs(H, 0.014);
  const dLines = wrapTh(ctx, DATA.detail, W * 0.83);
  [H*0.546, H*0.591, H*0.635].forEach((y, i) => {
    if (dLines[i]) ctx.fillText(dLines[i], W * 0.073, y);
  });

  // ── โดยประสานงานกับ ──
  ctx.font = fs(H, 0.0155);
  ctx.fillText(DATA.coordinator, W * 0.270, H * 0.678);

  // ── Signature ผู้แจ้ง ──
  ctx.textAlign = 'center';
  ctx.fillText(DATA.reporter, W * 0.700, H * 0.752);
  ctx.textAlign = 'left';
  ctx.fillText(DATA.position, W * 0.595, H * 0.775);
  ctx.fillText(DATA.date,     W * 0.595, H * 0.800);

  // ── ส่วนที่ 2 สรุปผล ──
  ctx.font = fs(H, 0.014);
  const sLines = wrapTh(ctx, DATA.summary, W * 0.83);
  [H*0.858, H*0.893, H*0.922].forEach((y, i) => {
    if (sLines[i]) ctx.fillText(sLines[i], W * 0.073, y);
  });

  // ── วันที่เสร็จ ──
  ctx.font = fs(H, 0.0155);
  ctx.fillText(DATA.doneDate, W * 0.596, H * 0.972);
}

function drawTick(ctx, cx, cy, size) {
  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(1.5, size * 0.1);
  ctx.beginPath();
  ctx.moveTo(cx - size*0.05, cy + size*0.05);
  ctx.lineTo(cx + size*0.30, cy + size*0.45);
  ctx.lineTo(cx + size*0.75, cy - size*0.50);
  ctx.stroke();
  ctx.restore();
}

function wrapTh(ctx, text, maxW) {
  if (!text) return [''];
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      lines.push(line); line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

document.fonts.ready.then(render).catch(e => console.error(e));
<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=940,height=1100');
  // ฝัง b64 ผ่าน window property เพื่อหลีกเลี่ยง string ยาวใน document.write
  w._pdfB64 = pdfB64;
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
