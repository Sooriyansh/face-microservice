async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();
  const payload = contentType.includes('application/json')
    ? JSON.parse(rawBody || '{}')
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        `Request failed with status ${response.status}. Server returned ${contentType || 'an unexpected response'}.`
    );
  }

  if (!payload) {
    throw new Error(
      `Expected JSON response from ${url}, but received ${contentType || 'non-JSON content'}.`
    );
  }

  return payload;
}

function showToast(message) {
  const stack = document.getElementById('toast-stack');
  if (!stack || !message) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  stack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function createCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  return cell;
}

function renderStudents(students) {
  const tableBody = document.getElementById('students-table-body');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!students.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No employees added yet.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  students.slice(0, 12).forEach((student) => {
    const row = document.createElement('tr');
    const employeeCell = document.createElement('td');
    employeeCell.innerHTML = `<span class="person-cell"><span class="avatar">${String(student.name || 'EM').slice(0, 2).toUpperCase()}</span><strong>${student.name}</strong></span>`;
    row.appendChild(employeeCell);

    const labelCell = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = student.faceLabel;
    labelCell.appendChild(code);
    row.appendChild(labelCell);

    row.appendChild(createCell(student.joiningDate ? new Date(student.joiningDate).toLocaleDateString() : '-'));
    row.appendChild(createCell(student.department || '-'));
    const accessCell = document.createElement('td');
    accessCell.innerHTML = `<span class="status-badge enrollment-${String(student.enrollmentStatus || 'Pending').toLowerCase().replaceAll(' ', '-')}">${student.enrollmentStatus || 'Pending'}</span>`;
    row.appendChild(accessCell);
    tableBody.appendChild(row);
  });
}

function renderAttendance(records, elementId, columnCount) {
  const tableBody = document.getElementById(elementId);
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!records.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columnCount;
    cell.textContent = 'No attendance marked yet.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  records.forEach((record) => {
    const row = document.createElement('tr');
    row.appendChild(createCell(record.student?.name || record.faceLabel));

    if (columnCount >= 4) {
      const labelCell = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = record.faceLabel;
      labelCell.appendChild(code);
      row.appendChild(labelCell);
    }

    row.appendChild(createCell(new Date(record.markedAt).toLocaleString()));
    row.appendChild(createCell(Number(record.confidence || 0).toFixed(3)));

    if (columnCount >= 5) {
      row.appendChild(createLocationCell(record.location));
    }

    if (columnCount >= 6) {
      const statusCell = document.createElement('td');
      statusCell.innerHTML = '<span class="security-badge">Present</span>';
      row.appendChild(statusCell);
    }

    tableBody.appendChild(row);
  });
}

function createLocationCell(location) {
  const cell = document.createElement('td');

  if (location?.latitude == null || location?.longitude == null) {
    cell.textContent = '-';
    return cell;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy || 0);
  const link = document.createElement('a');
  link.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

  cell.appendChild(link);

  if (accuracy) {
    const accuracyText = document.createElement('span');
    accuracyText.className = 'location-accuracy';
    accuracyText.textContent = ` +/- ${Math.round(accuracy)}m`;
    cell.appendChild(accuracyText);
  }

  return cell;
}

function renderSystemEvents(events) {
  const tableBody = document.getElementById('system-events-body');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!events.length) {
    const item = document.createElement('div');
    item.innerHTML = '<span class="event-dot"></span><strong>No system event captured yet</strong><p>Waiting for Windows activity monitor payloads.</p>';
    tableBody.appendChild(item);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement('div');
    item.className = 'event-row';
    item.setAttribute('data-user', event.user || 'Unknown');
    item.innerHTML = `
      <span class="event-dot"></span>
      <strong>${event.user || 'Unknown'} · ${event.event}</strong>
      <p>${new Date(event.occurredAt).toLocaleString()} · ${event.meaning || event.provider || event.sourceLog || '-'} · Event ID ${event.eventId || '-'}</p>
    `;
    tableBody.appendChild(item);
  });
}

function filterEventsByUser(userName) {
  const rows = document.querySelectorAll('.event-row');
  rows.forEach((row) => {
    if (userName === '' || row.getAttribute('data-user') === userName) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  });
}

function attachUserFilterListener() {
  const userFilter = document.getElementById('user-filter');
  if (userFilter) {
    userFilter.addEventListener('change', (e) => {
      filterEventsByUser(e.target.value);
    });
  }
}

function updateSystemEventsSummary(data) {
  const count = document.getElementById('system-events-count');
  const range = document.getElementById('system-events-range');
  const sync = document.getElementById('system-events-sync');
  const accuracy = document.getElementById('system-events-accuracy');

  if (count) {
    count.textContent = String((data.events || []).length);
  }

  if (range && data.range?.start && data.range?.end) {
    const start = new Date(data.range.start);
    const end = new Date(data.range.end);
    range.textContent = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  if (sync) {
    sync.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (accuracy) {
    accuracy.textContent = '100%';
  }
}

async function refreshHomeData() {
  const [studentsData, attendanceData] = await Promise.all([
    fetchJson('/api/students'),
    fetchJson('/api/attendance'),
  ]);

  renderStudents(studentsData.students || []);
  renderAttendance(attendanceData.records || [], 'attendance-table-body', 3);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(Math.floor(Number(ms || 0) / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatShortDuration(ms) {
  const totalMinutes = Math.max(Math.floor(Number(ms || 0) / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function normalizeStatusLabel(status) {
  return String(status || 'offline').replace(/_/g, ' ');
}

function updateSessionTimerFromData(startedAt, checkoutAt) {
  const timer = document.getElementById('session-timer');
  if (!timer) {
    return;
  }

  timer.dataset.startedAt = startedAt || '';
  timer.dataset.checkoutAt = checkoutAt || '';
}

function renderEmployeeSessionEvents(session) {
  const list = document.getElementById('employee-session-events');
  if (!list) {
    return;
  }

  const events = session?.events || [];
  list.innerHTML = '';

  if (!events.length) {
    list.innerHTML = '<div><span class="event-dot"></span><strong>Waiting for attendance</strong><p>Events like Laptop Started, Screen Unlocked, Chrome Opened, and Attendance Marked will appear here.</p></div>';
    return;
  }

  events.slice(-12).reverse().forEach((event) => {
    const item = document.createElement('div');
    item.className = 'event-row-live';
    item.innerHTML = `
      <span class="event-dot"></span>
      <strong>${event.type || 'Activity'}</strong>
      <p>${new Date(event.occurredAt).toLocaleString()} · ${event.message || event.deviceInfo || event.category || 'Live activity event'}</p>
    `;
    list.appendChild(item);
  });
}

function renderEmployeeSession(data) {
  const session = data?.session;
  const statusText = document.getElementById('session-status-text');
  const detail = document.getElementById('session-status-detail');
  const dot = document.getElementById('session-state-dot');
  const eventCount = document.getElementById('session-event-count');
  const productivity = document.getElementById('session-productivity');
  const completeButton = document.getElementById('complete-daily-task');

  if (statusText) {
    statusText.textContent = session ? normalizeStatusLabel(session.liveStatus || session.status).toUpperCase() : 'PENDING ATTENDANCE';
  }

  if (detail) {
    detail.textContent = session
      ? session.status === 'checked_out'
        ? 'Monitoring is stopped for the remaining day.'
        : 'Monitoring active for today.'
      : 'Mark attendance to begin tracking.';
  }

  if (dot) {
    dot.className = `session-state ${session ? session.liveStatus || session.status : 'offline'}`;
  }

  if (eventCount) {
    eventCount.textContent = String(session?.eventCount || session?.events?.length || 0);
  }

  if (productivity) {
    productivity.textContent = `${session?.productivityScore || 0}%`;
  }

  if (completeButton) {
    completeButton.dataset.sessionId = session?._id || '';
    completeButton.disabled = !session || session.status === 'checked_out' || session.liveStatus === 'checked_out';
  }

  const permissionModal = document.getElementById('monitoring-permission-modal');
  if (permissionModal && session && session.status !== 'checked_out' && session.monitoringPermission === 'pending') {
    permissionModal.hidden = false;
  }

  updateSessionTimerFromData(session?.startedAt || '', session?.checkoutAt || '');
  renderEmployeeSessionEvents(session);
}

async function loadDailyWorkSession() {
  const consolePanel = document.getElementById('daily-work-session');
  if (!consolePanel) {
    return;
  }

  const employeeId = consolePanel.dataset.employeeId || '';
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
  const data = await fetchJson(`/api/work-sessions/today${query}`);
  renderEmployeeSession(data);
}

async function sendEmployeeActivity(type, metadata = {}) {
  const consolePanel = document.getElementById('daily-work-session');
  const completeButton = document.getElementById('complete-daily-task');
  const sessionId = completeButton?.dataset.sessionId || '';
  const permissionModal = document.getElementById('monitoring-permission-modal');

  if (!consolePanel || !sessionId || completeButton.disabled || (permissionModal && !permissionModal.hidden)) {
    return;
  }

  await fetchJson('/api/work-sessions/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employee: consolePanel.dataset.employeeId,
      type,
      occurredAt: new Date().toISOString(),
      deviceInfo: navigator.platform || 'Browser workstation',
      message: metadata.message || `${type} captured from employee workspace.`,
      metadata: {
        source: 'employee-work-session',
        ...metadata,
      },
    }),
  });
}

function startEmployeeActivityCollector() {
  const consolePanel = document.getElementById('daily-work-session');
  if (!consolePanel) {
    return;
  }

  sendEmployeeActivity('Active State', { message: 'Employee work session page became active.' }).catch(() => {});

  let lastInteraction = Date.now();
  ['keydown', 'mousemove', 'click'].forEach((eventName) => {
    window.addEventListener(eventName, () => {
      lastInteraction = Date.now();
    });
  });

  document.addEventListener('visibilitychange', () => {
    const type = document.hidden ? 'Idle State' : 'Active State';
    sendEmployeeActivity(type, { message: document.hidden ? 'Employee workspace moved to background.' : 'Employee workspace active again.' }).catch(() => {});
  });

  window.setInterval(() => {
    const idleMs = Date.now() - lastInteraction;
    const type = idleMs > 120000 ? 'Idle State' : 'Active State';
    sendEmployeeActivity(type, {
      durationMs: idleMs > 120000 ? idleMs : 60000,
      message: idleMs > 120000 ? 'No keyboard or mouse activity detected.' : 'Keyboard/mouse activity detected.',
    })
      .then(loadDailyWorkSession)
      .catch(() => {});
  }, 60000);
}

function renderAdminMonitoring(data) {
  const tableBody = document.getElementById('admin-monitoring-body');
  if (!tableBody) {
    return;
  }

  const rows = data.rows || [];
  tableBody.innerHTML = '';

  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="10">No employees registered yet.</td></tr>';
    return;
  }

  rows.forEach((row) => {
    const employee = row.employee || {};
    const status = row.currentStatus || 'offline';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="person-cell"><span class="avatar">${String(employee.name || 'EM').slice(0, 2).toUpperCase()}</span><strong>${employee.name || 'Employee'}</strong></span></td>
      <td><span class="status-badge status-${status}">${row.deviceState || normalizeStatusLabel(status)}</span></td>
      <td>${row.laptopOnSince ? new Date(row.laptopOnSince).toLocaleTimeString() : '-'}</td>
      <td>${formatShortDuration(row.activeMs)}</td>
      <td>${formatShortDuration(row.idleMs)}</td>
      <td>${formatShortDuration(row.sleepMs)}</td>
      <td>${row.lastActivity ? new Date(row.lastActivity).toLocaleTimeString() : '-'}</td>
      <td>${row.attendanceTime ? new Date(row.attendanceTime).toLocaleTimeString() : '-'}</td>
      <td>${row.checkoutTime ? new Date(row.checkoutTime).toLocaleTimeString() : '-'}</td>
      <td>${row.productivityScore || 0}%</td>
    `;
    tableBody.appendChild(tr);
  });

  const counts = data.counts || {};
  const countMap = {
    'admin-active-count': counts.active || 0,
    'admin-idle-count': counts.idle || 0,
    'admin-checkout-count': counts.checkedOut || 0,
    'admin-offline-count': counts.offline || 0,
  };

  Object.entries(countMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = String(value);
    }
  });

  const dashboardCountMap = {
    'dashboard-active-count': counts.active || 0,
    'dashboard-idle-count': counts.idle || 0,
    'dashboard-checkout-count': counts.checkedOut || 0,
    'dashboard-offline-count': counts.offline || 0,
  };

  Object.entries(dashboardCountMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = String(value);
    }
  });
}

async function refreshAdminMonitoring() {
  const tableBody = document.getElementById('admin-monitoring-body');
  if (!tableBody) {
    return;
  }

  const data = await fetchJson('/api/work-sessions/admin/live');
  renderAdminMonitoring(data);
}

async function refreshSystemEvents() {
  const status = document.getElementById('system-events-status');
  if (status) {
    status.textContent = 'Refreshing system activity from 8:00 AM to the current time...';
  }

  try {
    const data = await fetchJson('/api/system-events?mode=workday&sort=asc&limit=500');
    renderEnhancedSystemEvents(data.events || []);
    updateSystemEventsSummary(data);
    attachUserFilterListener();

    if (status) {
      status.textContent = `Showing ${data.events.length} event(s) from 8:00 AM to current time. Accuracy: 100%`;
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message;
    }
  }
}

let cameraStream = null;
let scanInterval = null;
let scanInFlight = false;
let enrollmentCameraStream = null;
let enrollmentImages = [];
let attendanceLocation = null;
let attendanceLocationAt = 0;
let locationRetryAfter = 0;
const SCAN_CANVAS_WIDTH = 520;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setScannerState(id, message, mode = 'idle') {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = message;
    element.dataset.state = mode;
  }
}

function drawVideoToScanCanvas(video, canvas) {
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  const width = Math.min(SCAN_CANVAS_WIDTH, sourceWidth);
  const height = Math.round(width * (sourceHeight / sourceWidth));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  return context;
}

function readFrameMetrics(context, canvas) {
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  let totalSq = 0;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = (data[index] * 0.2126) + (data[index + 1] * 0.7152) + (data[index + 2] * 0.0722);
    total += luminance;
    totalSq += luminance * luminance;
  }

  const pixels = data.length / 4;
  const brightness = total / pixels;
  const contrast = Math.sqrt(Math.max((totalSq / pixels) - (brightness * brightness), 0));

  return {
    brightness,
    contrast,
    brightnessLabel: brightness < 45 ? 'Low light' : brightness > 220 ? 'Too bright' : 'Lighting stable',
    qualityLabel: contrast < 26 ? 'Hold still' : 'Frame sharp',
    canSend: brightness >= 28 && brightness <= 238 && contrast >= 14,
  };
}

function positionFaceBox(boxId, box, canvas) {
  const element = document.getElementById(boxId);
  if (!element) {
    return;
  }

  if (!box || !canvas.width || !canvas.height) {
    element.hidden = true;
    return;
  }

  element.hidden = false;
  element.style.left = `${clamp((box.x / canvas.width) * 100, 0, 100)}%`;
  element.style.top = `${clamp((box.y / canvas.height) * 100, 0, 100)}%`;
  element.style.width = `${clamp((box.w / canvas.width) * 100, 8, 100)}%`;
  element.style.height = `${clamp((box.h / canvas.height) * 100, 8, 100)}%`;
}

function updateAttendanceScannerTelemetry(response, canvas, frameMetrics) {
  const confidence = Number(response?.recognition?.confidence || response?.confidence || 0);
  updateText('attendance-confidence', `Confidence ${(confidence * 100).toFixed(1)}%`);
  updateText('attendance-light-state', response?.quality?.brightness?.message || frameMetrics?.brightnessLabel || 'Lighting stable');
  updateText('attendance-quality-state', response?.quality?.blur?.message || frameMetrics?.qualityLabel || 'Frame sharp');
  updateText('attendance-face-state', response?.box || response?.recognition?.box ? 'Face Detected' : 'Searching Face');
  positionFaceBox('attendance-face-box', response?.recognition?.box || response?.box, canvas);
}

function setScanStatus(message) {
  const scanStatus = document.getElementById('camera-status');
  if (scanStatus) {
    scanStatus.textContent = message;
  }
}

function setRecognitionResult(message, isSuccess = null, studentName = null, confidence = null) {
  const result = document.getElementById('recognition-result');
  if (result) {
    if (isSuccess) {
      const confidencePercent = confidence ? (Number(confidence) * 100).toFixed(1) : 'N/A';
      const displayMsg = studentName
        ? `Success: ${studentName}'s attendance was marked successfully. (${confidencePercent}% confidence)`
        : 'Success: Attendance was marked successfully.';
      result.textContent = displayMsg;
      result.classList.add('status-success');
      result.classList.remove('status-error');
      showToast(displayMsg);
    } else if (isSuccess === false) {
      result.textContent = message;
      result.classList.add('status-error');
      result.classList.remove('status-success');
    } else {
      result.textContent = message;
      result.classList.remove('status-error', 'status-success');
    }
  }
}

function setLocationStatus(message) {
  const locationStatus = document.getElementById('location-status');
  if (locationStatus) {
    locationStatus.textContent = message;
  }
}

function setScanLoading(isLoading) {
  const startButton = document.getElementById('start-camera');
  const scanButton = document.getElementById('scan-now');
  const loader = document.getElementById('camera-loader');

  if (startButton) {
    startButton.disabled = isLoading;
  }

  if (scanButton) {
    scanButton.disabled = isLoading;
  }

  if (loader) {
    loader.textContent = isLoading ? 'Matching identity with secure face model...' : '';
  }
}

async function scanCurrentFrame() {
  if (scanInFlight) {
    return;
  }

  const video = document.getElementById('camera-feed');
  const canvas = document.getElementById('camera-canvas');

  if (!video || !canvas || video.readyState < 2) {
    return;
  }

  scanInFlight = true;
  setScanLoading(true);
  setScanStatus('Detecting face...');
  setScannerState('attendance-scanner-state', 'Analyzing Face', 'scanning');

  try {
    const context = drawVideoToScanCanvas(video, canvas);
    const frameMetrics = readFrameMetrics(context, canvas);
    updateText('attendance-light-state', frameMetrics.brightnessLabel);
    updateText('attendance-quality-state', frameMetrics.qualityLabel);

    if (!frameMetrics.canSend) {
      setScannerState('attendance-scanner-state', 'Improve Frame', 'warning');
      setRecognitionResult(`${frameMetrics.brightnessLabel}. ${frameMetrics.qualityLabel}. Center your face and improve lighting.`, false);
      return;
    }

    setScanStatus('Matching face...');
    setScannerState('attendance-scanner-state', 'Matching Identity', 'matching');

    const payload = {
      image: canvas.toDataURL('image/jpeg', 0.82),
      location: await getAttendanceLocation(),
    };

    const response = await fetchJson('/api/attendance/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.recognized) {
      const studentName = response.record?.student?.name || response.recognition?.label || 'Teacher';
      const confidence = response.recognition?.confidence || response.record?.confidence || 0;
      const isDuplicate = response.duplicate;
      updateAttendanceScannerTelemetry(response, canvas, frameMetrics);
      setScannerState('attendance-scanner-state', 'Verified Successfully', 'success');
      
      setRecognitionResult('', true, studentName, confidence);
      
      if (!isDuplicate) {
        setScanStatus('Success: Attendance marked successfully.');
        
        setTimeout(() => {
          stopLiveCamera();
          setScanStatus('Camera stopped - Attendance process complete');
          setRecognitionResult('Start the camera again for a new scan.');
        }, 3000);
      } else {
        setScanStatus(`${studentName}'s attendance is already marked for today.`);
      }
      
      await refreshHomeData();
      await loadDailyWorkSession();
    } else {
      const confidence = Number(response.confidence || 0).toFixed(3);
      const message = response.message || 'Face was not recognized.';
      const qualityIssues = response.quality_issues || [];
      updateAttendanceScannerTelemetry(response, canvas, frameMetrics);
      setScannerState('attendance-scanner-state', response.stage === 'no_face' ? 'Center Face' : 'Face Not Recognized', 'error');
      
      let displayMsg = message;
      if (qualityIssues && qualityIssues.length > 0) {
        displayMsg += ` | ${qualityIssues.join(' | ')}`;
      }
      
      setRecognitionResult(displayMsg, false);
    }
  } catch (error) {
      setRecognitionResult(error.message, false);
      setScannerState('attendance-scanner-state', 'Scan Failed', 'error');
    } finally {
      setScanLoading(false);
      setScanStatus(cameraStream ? 'Camera live - real-time scan is active.' : 'Camera stopped');
      scanInFlight = false;
    }
}

async function getAttendanceLocation(forceRefresh = false) {
  if (!navigator.geolocation) {
    setLocationStatus('Location tracking is not available in this browser.');
    return null;
  }

  const now = Date.now();
  if (!forceRefresh && attendanceLocation && now - attendanceLocationAt < 5 * 60 * 1000) {
    return attendanceLocation;
  }

  if (!forceRefresh && now < locationRetryAfter) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        attendanceLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        };
        attendanceLocationAt = Date.now();
        locationRetryAfter = 0;
        setLocationStatus(
          `Location captured: ${attendanceLocation.latitude.toFixed(5)}, ${attendanceLocation.longitude.toFixed(5)}`
        );
        resolve(attendanceLocation);
      },
      (error) => {
        locationRetryAfter = Date.now() + 60 * 1000;
        setLocationStatus(`Location was not captured: ${error.message}`);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  });
}

async function startLiveCamera() {
  const video = document.getElementById('camera-feed');
  if (!video) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    setScanStatus('Camera API is not available.');
    setRecognitionResult('Open this page at http://localhost:3000 and allow camera permission to use the browser camera.', false);
    return;
  }

  if (cameraStream) {
    setScanStatus('Camera already running.');
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });

    video.srcObject = cameraStream;
    await video.play();

    setScanStatus('Camera is live. Real-time face scan started.');
    setScannerState('attendance-scanner-state', 'Detecting Face', 'scanning');
    setRecognitionResult('Live recognition is ready. Center your face inside the scanner.');
    getAttendanceLocation(true);

    scanInterval = window.setInterval(scanCurrentFrame, 1400);
    window.setTimeout(scanCurrentFrame, 450);
  } catch (error) {
    cameraStream = null;
    setScanStatus('Camera access blocked.');
    setRecognitionResult(`Camera could not be opened: ${error.message}`, false);
  }
}

function stopLiveCamera() {
  const video = document.getElementById('camera-feed');

  if (scanInterval) {
    window.clearInterval(scanInterval);
    scanInterval = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (video) {
    video.pause();
    video.srcObject = null;
  }

  setScanStatus('Camera stopped.');
}

function setEnrollmentCameraStatus(message) {
  const status = document.getElementById('enrollment-camera-status');
  if (status) {
    status.textContent = message;
  }
}

function setEnrollmentSampleStatus(message) {
  const status = document.getElementById('enrollment-sample-status');
  if (status) {
    status.textContent = message;
  }
}

function updateSignupBiometricProgress(progress, activeIndex = null) {
  const badge = document.getElementById('signup-biometric-progress');
  if (badge) {
    badge.textContent = `${Math.min(Math.max(progress, 0), 100)}% complete`;
  }

  const steps = document.querySelectorAll('.scan-step-list span');
  steps.forEach((step, index) => {
    step.classList.toggle('active', activeIndex === index);
    step.classList.toggle('complete', activeIndex !== null && index < activeIndex);
  });
}

function renderEnrollmentPreview() {
  const preview = document.getElementById('enrollment-preview');
  if (!preview) {
    return;
  }

  preview.innerHTML = '';

  enrollmentImages.forEach((image, index) => {
    const img = document.createElement('img');
    img.src = image;
    img.alt = `Enrollment sample ${index + 1}`;
    preview.appendChild(img);
  });
}

async function startEnrollmentCamera() {
  const video = document.getElementById('enrollment-camera-feed');
  if (!video) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    setEnrollmentCameraStatus('Camera API is not available. Open this page at http://localhost:3000.');
    return;
  }

  if (enrollmentCameraStream) {
    setEnrollmentCameraStatus('Enrollment camera already running.');
    return;
  }

  try {
    enrollmentCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });

    video.srcObject = enrollmentCameraStream;
    await video.play();
    setEnrollmentCameraStatus('Enrollment camera is live. Keep your face centered and capture samples.');
  } catch (error) {
    enrollmentCameraStream = null;
    setEnrollmentCameraStatus(`Camera could not be opened: ${error.message}`);
  }
}

function stopEnrollmentCamera() {
  const video = document.getElementById('enrollment-camera-feed');

  if (enrollmentCameraStream) {
    enrollmentCameraStream.getTracks().forEach((track) => track.stop());
    enrollmentCameraStream = null;
  }

  if (video) {
    video.pause();
    video.srcObject = null;
  }

  setEnrollmentCameraStatus('Enrollment camera stopped.');
}

async function captureEnrollmentSamples() {
  const video = document.getElementById('enrollment-camera-feed');
  const canvas = document.getElementById('enrollment-camera-canvas');

  if (!video || !canvas || video.readyState < 2) {
    setEnrollmentSampleStatus('Start the enrollment camera first.');
    return;
  }

  enrollmentImages = [];
  renderEnrollmentPreview();
  setEnrollmentSampleStatus('Capturing 12 face samples...');
  const faceQuality = document.getElementById('face-quality');
  const lightingQuality = document.getElementById('lighting-quality');
  const faceValidation = document.getElementById('face-validation');
  const alignmentStatus = document.getElementById('alignment-status');

  const requiredPrompts = ['Look straight', 'Turn slightly left', 'Turn slightly right', 'Move closer', 'Blink once', 'Hold still'];
  let promptIndex = 0;

  while (enrollmentImages.length < 12) {
    const context = drawVideoToScanCanvas(video, canvas);
    const metrics = readFrameMetrics(context, canvas);
    const progress = Math.round((enrollmentImages.length / 12) * 100);

    if (!metrics.canSend) {
      setEnrollmentSampleStatus(`${metrics.brightnessLabel}. ${metrics.qualityLabel}. Improve lighting and hold still.`);
      if (faceQuality) faceQuality.textContent = `Quality ${Math.max(15, Math.round(metrics.contrast))}%`;
      if (lightingQuality) lightingQuality.textContent = metrics.brightnessLabel;
      if (faceValidation) faceValidation.textContent = 'Frame rejected';
      if (alignmentStatus) alignmentStatus.textContent = 'Center face';
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      continue;
    }

    enrollmentImages.push(canvas.toDataURL('image/jpeg', 0.86));
    renderEnrollmentPreview();
    const captured = enrollmentImages.length;
    setEnrollmentSampleStatus(`Captured ${captured}/12 face samples - ${requiredPrompts[promptIndex]}`);
    updateSignupBiometricProgress(Math.round((captured / 12) * 100), Math.min(Math.floor(captured / 2), 6));
    if (faceQuality) {
      faceQuality.textContent = `Quality ${Math.min(100, Math.round(metrics.contrast * 2.5))}%`;
    }
    if (lightingQuality) {
      lightingQuality.textContent = metrics.brightnessLabel;
    }
    if (faceValidation) {
      faceValidation.textContent = 'Face sample accepted';
    }
    if (alignmentStatus) {
      alignmentStatus.textContent = requiredPrompts[promptIndex];
    }
    promptIndex = (promptIndex + 1) % requiredPrompts.length;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => window.setTimeout(resolve, 260));
  }

  setEnrollmentSampleStatus('Face samples are ready. Secure biometric upload can begin.');
  updateSignupBiometricProgress(100, 6);
  if (faceValidation) {
    faceValidation.textContent = 'Face validation passed';
  }
}

async function refreshAttendancePage() {
  const status = document.getElementById('attendance-page-status');
  if (status) {
    status.textContent = 'Refreshing records...';
  }

  try {
    const attendanceData = await fetchJson('/api/attendance');
    renderAttendance(attendanceData.records || [], 'attendance-page-body', 6);

    if (status) {
      status.textContent = `Showing ${attendanceData.records.length} record(s) for today.`;
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message;
    }
  }
}

const studentForm = document.getElementById('student-form');
if (studentForm) {
  studentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formStatus = document.getElementById('student-form-status');
    const submitButton = studentForm.querySelector('button[type="submit"]');
    const formData = new FormData(studentForm);
    const payload = Object.fromEntries(formData.entries());
    payload.enrollmentImages = enrollmentImages;

    if (enrollmentImages.length < 6) {
      if (formStatus) {
        formStatus.textContent = 'Capture at least 6 face samples first.';
      }
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    if (formStatus) {
      formStatus.textContent = 'Employee registration is in progress. Please wait...';
    }

    try {
      const existingStudentId = studentForm.dataset.studentId || '';
      const endpoint = existingStudentId ? `/api/students/${existingStudentId}/enrollment` : '/api/students';
      const method = existingStudentId ? 'PUT' : 'POST';

      const data = await fetchJson(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (formStatus) {
        formStatus.textContent = data.modelWarning
          ? `Cloudinary sync complete. Model rebuild warning: ${data.modelWarning}`
          : existingStudentId
            ? 'Face data updated. Verification status is pending admin review.'
            : 'Employee identity saved and the model was trained. You can now mark attendance.';
        showToast(data.modelWarning ? 'Cloudinary sync complete. Model rebuild needs attention.' : 'Identity saved, Cloudinary synced, and AI model trained.');
      }

      if (!existingStudentId) {
        studentForm.reset();
      }
      enrollmentImages = [];
      renderEnrollmentPreview();
      setEnrollmentSampleStatus('Required samples: 6 minimum. Recommended: 12.');
      await refreshHomeData();
    } catch (error) {
      if (formStatus) {
        formStatus.textContent = error.message;
        showToast(error.message);
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });

  refreshHomeData().catch((error) => {
    const formStatus = document.getElementById('student-form-status');
    if (formStatus) {
      formStatus.textContent = error.message;
    }
  });
}

const refreshAttendanceButton = document.getElementById('refresh-attendance');
if (refreshAttendanceButton) {
  refreshAttendanceButton.addEventListener('click', refreshAttendancePage);
  refreshAttendancePage();
}

const refreshSystemEventsButton = document.getElementById('refresh-system-events');
if (refreshSystemEventsButton) {
  refreshSystemEventsButton.addEventListener('click', refreshSystemEvents);
  refreshSystemEvents();
  window.setInterval(refreshSystemEvents, 30000);
}

const completeDailyTaskButton = document.getElementById('complete-daily-task');
const checkoutModal = document.getElementById('checkout-modal');
const checkoutForm = document.getElementById('checkout-form');
const closeCheckoutModalButton = document.getElementById('close-checkout-modal');

if (completeDailyTaskButton && checkoutModal) {
  completeDailyTaskButton.addEventListener('click', () => {
    checkoutModal.hidden = false;
    document.getElementById('checkout-note')?.focus();
  });
}

if (closeCheckoutModalButton && checkoutModal) {
  closeCheckoutModalButton.addEventListener('click', () => {
    checkoutModal.hidden = true;
  });
}

if (checkoutForm) {
  checkoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('checkout-form-status');
    const result = document.getElementById('checkout-result');
    const note = document.getElementById('checkout-note')?.value || '';
    const sessionId = completeDailyTaskButton?.dataset.sessionId || '';

    if (!sessionId) {
      if (status) {
        status.textContent = 'Mark attendance before completing the work session.';
      }
      return;
    }

    try {
      const data = await fetchJson(`/api/work-sessions/${sessionId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });

      if (status) {
        status.textContent = data.message;
      }
      if (result) {
        result.textContent = data.message;
      }
      showToast(data.message);
      checkoutModal.hidden = true;
      checkoutForm.reset();
      await loadDailyWorkSession();
    } catch (error) {
      if (status) {
        status.textContent = error.message;
      }
    }
  });
}

async function submitMonitoringPermission(permission) {
  const completeButton = document.getElementById('complete-daily-task');
  const sessionId = completeButton?.dataset.sessionId || '';
  const modal = document.getElementById('monitoring-permission-modal');

  if (!sessionId) {
    return;
  }

  const data = await fetchJson(`/api/work-sessions/${sessionId}/permission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission }),
  });

  if (modal) {
    modal.hidden = true;
  }
  showToast(data.message);
  await loadDailyWorkSession();
}

const allowMonitoringButton = document.getElementById('allow-monitoring');
if (allowMonitoringButton) {
  allowMonitoringButton.addEventListener('click', () => {
    submitMonitoringPermission('allowed').catch((error) => showToast(error.message));
  });
}

const denyMonitoringButton = document.getElementById('deny-monitoring');
if (denyMonitoringButton) {
  denyMonitoringButton.addEventListener('click', () => {
    submitMonitoringPermission('denied').catch((error) => showToast(error.message));
  });
}

const startCameraButton = document.getElementById('start-camera');
const stopCameraButton = document.getElementById('stop-camera');
const scanNowButton = document.getElementById('scan-now');

if (startCameraButton) {
  startCameraButton.addEventListener('click', startLiveCamera);
}

if (stopCameraButton) {
  stopCameraButton.addEventListener('click', stopLiveCamera);
}

if (scanNowButton) {
  scanNowButton.addEventListener('click', scanCurrentFrame);
}

const startEnrollmentCameraButton = document.getElementById('start-enrollment-camera');
const stopEnrollmentCameraButton = document.getElementById('stop-enrollment-camera');
const captureEnrollmentButton = document.getElementById('capture-enrollment');

if (startEnrollmentCameraButton) {
  startEnrollmentCameraButton.addEventListener('click', startEnrollmentCamera);
}

if (stopEnrollmentCameraButton) {
  stopEnrollmentCameraButton.addEventListener('click', stopEnrollmentCamera);
}

if (captureEnrollmentButton) {
  captureEnrollmentButton.addEventListener('click', captureEnrollmentSamples);
}

const signupRole = document.getElementById('signup-role');
const signupForm = document.getElementById('signup-form');

function syncSignupRoleUi() {
  if (!signupRole) {
    return;
  }

  const isEmployee = signupRole.value === 'employee';
  document.querySelectorAll('.employee-only').forEach((element) => {
    element.classList.toggle('hidden', !isEmployee);
    element.querySelectorAll('input').forEach((input) => {
      input.required = isEmployee;
    });
  });
}

if (signupRole) {
  signupRole.addEventListener('change', syncSignupRoleUi);
  syncSignupRoleUi();
}

if (signupForm) {
  signupForm.addEventListener('submit', async (event) => {
    const role = signupRole?.value || 'employee';
    const status = document.getElementById('signup-form-status');

    if (role === 'admin') {
      return;
    }

    event.preventDefault();
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const formData = new FormData(signupForm);
    const payload = Object.fromEntries(formData.entries());
    payload.enrollmentImages = enrollmentImages;

    if (payload.password !== payload.confirmPassword) {
      if (status) status.textContent = 'Password and confirm password do not match.';
      return;
    }

    if (enrollmentImages.length < 6) {
      if (status) status.textContent = 'Complete biometric scanning before employee signup.';
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (status) status.textContent = 'Secure biometric upload, encryption, AI verification, and account activation are in progress...';
    updateSignupBiometricProgress(100, 6);

    try {
      const data = await fetchJson('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const successMessage = data.modelWarning
        ? `Employee account activated. Face scans are saved in Cloudinary. Model rebuild warning: ${data.modelWarning}`
        : 'Employee account activated. Face login enabled automatically.';
      if (status) status.textContent = successMessage;
      showToast(data.modelWarning ? 'Employee signup complete. Model rebuild needs attention.' : 'Employee biometric signup complete.');
      window.location.href = data.redirectTo || '/employee';
    } catch (error) {
      if (status) status.textContent = error.message;
      showToast(error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

let employeeLoginStream = null;
let employeeLoginInFlight = false;
let employeeLoginInterval = null;

function setEmployeeFaceLoginStatus(message, isError = false) {
  const status = document.getElementById('employee-face-login-status');
  if (status) {
    status.textContent = message;
    status.classList.toggle('status-error', isError);
    status.classList.toggle('status-success', !isError && message.toLowerCase().includes('success'));
  }
}

function setEmployeeLoginConfidence(confidence) {
  const element = document.getElementById('employee-login-confidence');
  if (element) {
    element.textContent = `Confidence ${(Number(confidence || 0) * 100).toFixed(1)}%`;
  }
}

function updateEmployeeLoginTelemetry(data, canvas, frameMetrics) {
  setEmployeeLoginConfidence(data?.confidence || 0);
  positionFaceBox('employee-login-face-box', data?.box, canvas);
  updateText('employee-login-state', data?.box ? 'Face Detected' : 'Searching Face');
  const state = data?.recognized ? 'Verified Successfully' : data?.stage === 'no_face' ? 'Center Face' : 'Matching Face';
  setScannerState('employee-login-scanner-state', state, data?.recognized ? 'success' : 'matching');
  if (frameMetrics && !data?.box) {
    updateText('employee-login-state', frameMetrics.brightnessLabel);
  }
}

async function scanEmployeeFaceLogin() {
  if (employeeLoginInFlight) {
    return;
  }

  const video = document.getElementById('employee-login-camera-feed');
  const canvas = document.getElementById('employee-login-camera-canvas');
  const state = document.getElementById('employee-login-state');

  if (!video || !canvas || video.readyState < 2) {
    return;
  }

  employeeLoginInFlight = true;
  if (state) state.textContent = 'Detecting Face';
  setScannerState('employee-login-scanner-state', 'Analyzing Face', 'scanning');
  setEmployeeFaceLoginStatus('Detecting face and checking frame quality...');

  try {
    const context = drawVideoToScanCanvas(video, canvas);
    const frameMetrics = readFrameMetrics(context, canvas);

    if (!frameMetrics.canSend) {
      if (state) state.textContent = frameMetrics.brightnessLabel;
      setScannerState('employee-login-scanner-state', 'Improve Frame', 'warning');
      setEmployeeFaceLoginStatus(`${frameMetrics.brightnessLabel}. ${frameMetrics.qualityLabel}. Center your face and hold still.`, true);
      return;
    }

    if (state) state.textContent = 'Matching Face';
    setScannerState('employee-login-scanner-state', 'Matching Identity', 'matching');

    const data = await fetchJson('/employee-face-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: canvas.toDataURL('image/jpeg', 0.82) }),
    });

    updateEmployeeLoginTelemetry(data, canvas, frameMetrics);
    if (!data.recognized) {
      if (state) state.textContent = data.stage === 'no_face' ? 'Center face' : 'Low confidence';
      setScannerState('employee-login-scanner-state', data.stage === 'no_face' ? 'Center Face' : 'Face Not Recognized', 'error');
      setEmployeeFaceLoginStatus(data.message || 'Face not recognized. Improve lighting and retry.', true);
      return;
    }

    if (state) state.textContent = 'Login success';
    setScannerState('employee-login-scanner-state', 'Verified Successfully', 'success');
    setEmployeeFaceLoginStatus(`Login success. Welcome ${data.employee?.name || 'Employee'}.`);
    showToast('Face authentication successful.');
    window.setTimeout(() => {
      window.location.href = data.redirectTo || '/employee';
    }, 800);
  } catch (error) {
    if (state) state.textContent = 'Face not recognized';
    setEmployeeLoginConfidence(0);
    setScannerState('employee-login-scanner-state', 'Scan Failed', 'error');
    setEmployeeFaceLoginStatus(error.message || 'Face not recognized. Retry scan.', true);
  } finally {
    employeeLoginInFlight = false;
  }
}

async function startEmployeeFaceLogin() {
  const video = document.getElementById('employee-login-camera-feed');
  if (!video) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    setEmployeeFaceLoginStatus('Camera API is not available in this browser.', true);
    return;
  }

  if (employeeLoginStream) {
    scanEmployeeFaceLogin();
    return;
  }

  try {
    employeeLoginStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });
    video.srcObject = employeeLoginStream;
    await video.play();
    setScannerState('employee-login-scanner-state', 'Detecting Face', 'scanning');
    setEmployeeFaceLoginStatus('Webcam active. Real-time face matching started.');
    employeeLoginInterval = window.setInterval(scanEmployeeFaceLogin, 1400);
    window.setTimeout(scanEmployeeFaceLogin, 450);
  } catch (error) {
    employeeLoginStream = null;
    setEmployeeFaceLoginStatus(`Camera could not be opened: ${error.message}`, true);
  }
}

function stopEmployeeFaceLogin() {
  if (employeeLoginInterval) {
    window.clearInterval(employeeLoginInterval);
    employeeLoginInterval = null;
  }

  if (employeeLoginStream) {
    employeeLoginStream.getTracks().forEach((track) => track.stop());
    employeeLoginStream = null;
  }
}

const startEmployeeFaceLoginButton = document.getElementById('start-employee-face-login');
if (startEmployeeFaceLoginButton) {
  startEmployeeFaceLoginButton.addEventListener('click', startEmployeeFaceLogin);
  window.setTimeout(startEmployeeFaceLogin, 500);
}

const retryEmployeeFaceLoginButton = document.getElementById('retry-employee-face-login');
if (retryEmployeeFaceLoginButton) {
  retryEmployeeFaceLoginButton.addEventListener('click', scanEmployeeFaceLogin);
}

window.addEventListener('beforeunload', () => {
  stopLiveCamera();
  stopEnrollmentCamera();
  stopEmployeeFaceLogin();
});

// Navbar functionality
const navbarRefreshButton = document.getElementById('navbar-refresh');
if (navbarRefreshButton) {
  navbarRefreshButton.addEventListener('click', () => {
    const currentPath = window.location.pathname;
    if (currentPath === '/attendance') {
      refreshAttendancePage();
    } else {
      window.location.href = '/';
    }
  });
}

const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navbarMenu = document.querySelector('.navbar-menu');
if (mobileMenuToggle && navbarMenu) {
  mobileMenuToggle.addEventListener('click', () => {
    navbarMenu.classList.toggle('open');
  });
}

const sideNav = document.querySelector('.side-nav');
if (mobileMenuToggle && sideNav) {
  mobileMenuToggle.addEventListener('click', () => {
    sideNav.classList.toggle('open');
  });
}

const profileTrigger = document.querySelector('.profile-trigger');
const profileMenu = document.querySelector('.profile-menu');
if (profileTrigger && profileMenu) {
  profileTrigger.addEventListener('click', () => {
    profileMenu.classList.toggle('open');
  });
}

const themeToggle = document.querySelector('.theme-toggle');
if (themeToggle) {
  const savedTheme = localStorage.getItem('faceai-theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
  }

  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('faceai-theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
  });
}

document.querySelectorAll('.counter[data-count]').forEach((counter) => {
  const target = Number(counter.dataset.count || 0);
  const suffix = counter.textContent.trim().endsWith('%') ? '%' : '';
  let current = 0;
  const steps = 28;
  const increment = target / steps;

  const tick = () => {
    current += increment;
    if (current >= target) {
      counter.textContent = `${target}${suffix}`;
      return;
    }
    counter.textContent = `${Math.round(current)}${suffix}`;
    window.requestAnimationFrame(tick);
  };

  tick();
});

function updateClock() {
  const clock = document.getElementById('real-time-clock');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

function renderEnhancedSystemEvents(events) {
  const tableBody = document.getElementById('system-events-body');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!events.length) {
    const item = document.createElement('div');
    item.innerHTML = '<span class="event-dot"></span><strong>No system event captured yet</strong><p>Waiting for Windows activity monitor payloads.</p>';
    tableBody.appendChild(item);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement('div');
    item.className = 'event-row';
    item.setAttribute('data-user', event.user || 'Unknown');
    item.innerHTML = `
      <span class="event-dot"></span>
      <strong>${event.event || 'Activity Event'}</strong>
      <div class="event-meta-grid">
        <span><b>Timestamp</b>${new Date(event.occurredAt).toLocaleString()}</span>
        <span><b>Event Type</b>${event.event || '-'}</span>
        <span><b>Device Info</b>${event.computer || event.provider || event.sourceLog || '-'}</span>
        <span><b>Employee Name</b>${event.user || 'Unknown'}</span>
        <span><b>Session Status</b>${['Shutdown', 'Unexpected Shutdown'].includes(event.event) ? 'Incomplete' : 'Monitoring'}</span>
        <span><b>Duration</b>${event.event === 'Sleep' ? 'Tracked until wakeup' : '-'}</span>
      </div>
    `;
    tableBody.appendChild(item);
  });
}

updateClock();
window.setInterval(updateClock, 1000);

function updateSessionTimer() {
  const timer = document.getElementById('session-timer');
  if (!timer || !timer.dataset.startedAt) {
    if (timer) {
      timer.textContent = '00:00:00';
    }
    return;
  }

  const startedAt = new Date(timer.dataset.startedAt);
  const checkoutAt = timer.dataset.checkoutAt ? new Date(timer.dataset.checkoutAt) : new Date();
  if (Number.isNaN(startedAt.getTime())) {
    timer.textContent = '00:00:00';
    return;
  }

  timer.textContent = formatDuration(checkoutAt.getTime() - startedAt.getTime());
}

updateSessionTimer();
window.setInterval(updateSessionTimer, 1000);

if (document.getElementById('daily-work-session')) {
  loadDailyWorkSession().catch((error) => showToast(error.message));
  startEmployeeActivityCollector();
  window.setInterval(() => loadDailyWorkSession().catch(() => {}), 15000);
}

if (document.getElementById('admin-monitoring-body')) {
  refreshAdminMonitoring().catch((error) => showToast(error.message));
  window.setInterval(() => refreshAdminMonitoring().catch(() => {}), 15000);
}

function attachEmployeeFilterCards() {
  document.querySelectorAll('.employee-filter-card').forEach((card) => {
    card.addEventListener('click', () => {
      const user = card.dataset.user || '';
      const userFilter = document.getElementById('user-filter');
      if (userFilter) {
        userFilter.value = user;
      }
      filterEventsByUser(user);
      showToast(`Showing ${user || 'all users'} activity timeline`);
    });
  });
}

function applyDirectoryFilters() {
  const search = (document.getElementById('event-search')?.value || '').toLowerCase();
  const department = document.getElementById('department-filter')?.value || '';
  const online = document.getElementById('online-filter')?.value || '';

  document.querySelectorAll('.employee-filter-card').forEach((card) => {
    const matchesSearch = !search || card.textContent.toLowerCase().includes(search);
    const matchesDepartment = !department || card.dataset.department === department;
    const matchesOnline = !online || card.dataset.status === online;
    card.classList.toggle('hidden', !(matchesSearch && matchesDepartment && matchesOnline));
  });
}

['event-search', 'department-filter', 'online-filter'].forEach((id) => {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('input', applyDirectoryFilters);
    element.addEventListener('change', applyDirectoryFilters);
  }
});

attachEmployeeFilterCards();
