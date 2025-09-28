// Blood Donor - Shared JS (LocalStorage only)
(function() {
  const STORAGE_KEYS = {
    donors: 'bd_donors',
    users: 'bd_users',
    session: 'bd_session',
    camps: 'bd_camp_requests',
    admins: 'bd_admin_emails'
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  // Admin emails
  function getAdminEmails() {
    const defaults = ['admin@example.com'];
    return ensureArray(readJSON(STORAGE_KEYS.admins, defaults)).map(normalize);
  }
  function isCurrentUserAdmin() {
    const user = getCurrentUser();
    if (!user) return false;
    return getAdminEmails().includes(normalize(user.email));
  }

  // Donors
  function getDonors() {
    return ensureArray(readJSON(STORAGE_KEYS.donors, []));
  }
  function saveDonors(donors) { writeJSON(STORAGE_KEYS.donors, donors); }
  function addDonor(donor) {
    const donors = getDonors();
    const ix = donors.findIndex(d => normalize(d.email) === normalize(donor.email));
    const record = {
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      name: donor.name,
      bloodGroup: donor.bloodGroup,
      email: donor.email,
      contact: donor.contact,
      city: donor.city
    };
    if (ix >= 0) donors[ix] = { ...donors[ix], ...record }; else donors.push(record);
    saveDonors(donors);
  }
  function findDonorsByGroupAndCity(group, city) {
    const g = normalize(group); const c = normalize(city);
    return getDonors().filter(d => normalize(d.bloodGroup) === g && normalize(d.city) === c);
  }

  // Users & Session
  function getUsers() { return ensureArray(readJSON(STORAGE_KEYS.users, [])); }
  function saveUsers(users) { writeJSON(STORAGE_KEYS.users, users); }
  function signupUser(username, email, password) {
    const users = getUsers();
    if (users.some(u => normalize(u.email) === normalize(email))) throw new Error('Email already registered');
    const user = { id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()), username, email, password };
    users.push(user); saveUsers(users); writeJSON(STORAGE_KEYS.session, { userId: user.id }); return user;
  }
  function loginUser(email, password) {
    const users = getUsers();
    const user = users.find(u => normalize(u.email) === normalize(email) && u.password === password);
    if (!user) throw new Error('Invalid credentials');
    writeJSON(STORAGE_KEYS.session, { userId: user.id }); return user;
  }
  function getCurrentUser() {
    const session = readJSON(STORAGE_KEYS.session, null); if (!session) return null;
    return getUsers().find(u => u.id === session.userId) || null;
  }
  function logoutUser() { localStorage.removeItem(STORAGE_KEYS.session); }

  // Camp Requests
  function getCampRequests() { return ensureArray(readJSON(STORAGE_KEYS.camps, [])); }
  function saveCampRequests(list) { writeJSON(STORAGE_KEYS.camps, list); }
  function submitCampRequest({ eventName, date, city, requestedBy }) {
    const list = getCampRequests();
    const item = {
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      eventName, date, city, requestedBy: requestedBy || null,
      status: 'pending', createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null, note: ''
    };
    list.push(item); saveCampRequests(list); return item;
  }
  function setCampRequestStatus(id, status, decidedBy, note) {
    const list = getCampRequests();
    const ix = list.findIndex(x => x.id === id);
    if (ix < 0) return null;
    list[ix].status = status; list[ix].decidedAt = new Date().toISOString(); list[ix].decidedBy = decidedBy || null; list[ix].note = note || '';
    saveCampRequests(list); return list[ix];
  }

  // Mail helpers
  function buildMailTo({ to = [], bcc = [], subject = '', body = '' }) {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    let href = `mailto:${encodeURIComponent(to.join(','))}`;
    const qs = params.toString(); if (qs) href += `?${qs}`;
    if (bcc.length) href += `${qs ? '&' : '?'}bcc=${encodeURIComponent(bcc.join(','))}`;
    return href;
  }

  function setAriaCurrentNav() {
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('a[data-nav],button[data-nav]')
      .forEach(a => {
        const href = a.getAttribute('href') || a.dataset.href || '';
        if (href.endsWith(path)) a.setAttribute('aria-current', 'page');
      });
  }

  function populateBloodGroups(selectEl, includeEmpty=true) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    if (includeEmpty) {
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = 'Select group'; selectEl.appendChild(opt);
    }
    BLOOD_GROUPS.forEach(bg => {
      const opt = document.createElement('option'); opt.value = bg; opt.textContent = bg; selectEl.appendChild(opt);
    });
  }

  function showToast(container, message, variant) {
    if (!container) return;
    container.textContent = message;
    container.className = 'notice' + (variant ? ' ' + variant : '');
    container.style.display = '';
    setTimeout(() => { container.style.display = 'none'; }, 3000);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // Profile Modal
  function setupProfileModal() {
    const openBtn = document.getElementById('openProfile');
    const backdrop = document.getElementById('profileBackdrop');
    const closeBtn = document.getElementById('closeProfile');
    if (!openBtn || !backdrop || !closeBtn) return;

    function render() {
      const user = getCurrentUser();
      const logged = document.getElementById('profLoggedIn');
      const loggedOut = document.getElementById('profLoggedOut');
      if (user) {
        logged.style.display = '';
        loggedOut.style.display = 'none';
        document.getElementById('profUName').textContent = user.username;
        document.getElementById('profUMail').textContent = user.email;
      } else {
        logged.style.display = 'none';
        loggedOut.style.display = '';
      }
    }

    openBtn.addEventListener('click', () => { backdrop.classList.add('open'); render(); });
    closeBtn.addEventListener('click', () => { backdrop.classList.remove('open'); });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.remove('open'); });

    const logoutBtn = document.getElementById('profLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { logoutUser(); render(); updateAdminLinkVisibility(); });

    const goLogin = document.getElementById('profGoLogin');
    const goSignup = document.getElementById('profGoSignup');
    if (goLogin) goLogin.addEventListener('click', () => { location.href = './login.html'; });
    if (goSignup) goSignup.addEventListener('click', () => { location.href = './signup.html'; });
  }

  // Admin nav visibility
  function updateAdminLinkVisibility() {
    const isAdmin = isCurrentUserAdmin();
    document.querySelectorAll('[data-admin-link]')
      .forEach(el => { el.style.display = isAdmin ? '' : 'none'; });
  }

  // Page initializers (unchanged except admin guard)
  function initHome() {}
  function initRegister() {
    const form = document.getElementById('registerForm'); if (!form) return;
    populateBloodGroups(document.getElementById('regGroup'), true);
    const toast = document.getElementById('registerToast');
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const bloodGroup = document.getElementById('regGroup').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const contact = document.getElementById('regContact').value.trim();
      const city = document.getElementById('regCity').value.trim();
      if (!name || !bloodGroup || !email || !contact || !city) return showToast(toast, 'Please fill all fields', 'error');
      addDonor({ name, bloodGroup, email, contact, city }); form.reset(); showToast(toast, 'Registered as donor successfully');
    });
  }
  function initSearch() {
    const form = document.getElementById('searchForm'); if (!form) return;
    populateBloodGroups(document.getElementById('searchGroup'), true);
    const tbody = document.getElementById('resultsBody'); const countEl = document.getElementById('resultsCount');
    const emailBtn = document.getElementById('emailMatches');
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const bg = document.getElementById('searchGroup').value.trim();
      const city = document.getElementById('searchCity').value.trim();
      const matches = findDonorsByGroupAndCity(bg, city);
      tbody.innerHTML = '';
      matches.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.bloodGroup)}</td><td>${escapeHtml(d.email)}</td><td>${escapeHtml(d.contact)}</td><td>${escapeHtml(d.city)}</td>`;
        tbody.appendChild(tr);
      });
      countEl.textContent = String(matches.length);
      emailBtn.disabled = matches.length === 0;
      emailBtn.dataset.bcc = matches.map(d => d.email).join(',');
    });
    emailBtn.addEventListener('click', function() {
      const bcc = (emailBtn.dataset.bcc || '').split(',').filter(Boolean);
      const link = buildMailTo({ to: [], bcc, subject: 'Blood Donation Request', body: 'Dear donor, we are looking for blood donation. Please respond if available.' });
      location.href = link;
    });
  }
  function initRequest() {
    const form = document.getElementById('requestForm'); if (!form) return;
    populateBloodGroups(document.getElementById('reqGroup'), true);
    const toast = document.getElementById('requestToast');
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const name = document.getElementById('reqName').value.trim();
      const bloodGroup = document.getElementById('reqGroup').value.trim();
      const email = document.getElementById('reqEmail').value.trim();
      const contact = document.getElementById('reqContact').value.trim();
      const city = document.getElementById('reqCity').value.trim();
      if (!name || !bloodGroup || !email || !contact || !city) return showToast(toast, 'Please fill all fields', 'error');
      const matches = findDonorsByGroupAndCity(bloodGroup, city);
      if (!matches.length) return showToast(toast, 'No donors found for that group and city', 'warn');
      const subject = `Urgent blood request: ${bloodGroup} in ${city}`;
      const body = `Hello,\n\nThis is ${name} (${contact}). We urgently need ${bloodGroup} blood in ${city}. If you are available to donate, please reply to ${email}.\n\nThank you!`;
      const link = buildMailTo({ to: [email], bcc: matches.map(d => d.email), subject, body });
      location.href = link;
    });
  }
  function initOrganize() {
    const form = document.getElementById('organizeForm'); if (!form) return;
    const toast = document.getElementById('organizeToast');
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const eventName = document.getElementById('orgEvent').value.trim();
      const date = document.getElementById('orgDate').value.trim();
      const city = document.getElementById('orgCity').value.trim();
      if (!eventName || !date || !city) return showToast(toast, 'Please fill all fields', 'error');
      const user = getCurrentUser();
      submitCampRequest({ eventName, date, city, requestedBy: user ? user.email : null });
      form.reset();
      showToast(toast, 'Camp request submitted for admin approval');
    });
  }
  function initAdmin() {
    // Guard: redirect if not admin
    if (!isCurrentUserAdmin()) { location.href = './index.html'; return; }
    const pendingTbody = document.getElementById('pendingBody'); if (!pendingTbody) return;
    const historyTbody = document.getElementById('historyBody');
    const emptyPending = document.getElementById('emptyPending');
    const emptyHistory = document.getElementById('emptyHistory');

    function render() {
      const list = getCampRequests();
      const pending = list.filter(x => x.status === 'pending');
      const history = list.filter(x => x.status !== 'pending');

      pendingTbody.innerHTML = '';
      pending.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(item.eventName)}</td>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(item.city)}</td>
          <td>${escapeHtml(item.requestedBy || '—')}</td>
          <td class="actions">
            <button data-approve="${item.id}">Approve</button>
            <button class="secondary" data-decline="${item.id}">Decline</button>
          </td>`;
        pendingTbody.appendChild(tr);
      });
      emptyPending.style.display = pending.length ? 'none' : '';

      historyTbody.innerHTML = '';
      history.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(item.eventName)}</td>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(item.city)}</td>
          <td>${escapeHtml(item.status)}</td>
          <td>${escapeHtml(item.decidedBy || '—')}</td>
          <td>${escapeHtml(item.note || '')}</td>`;
        historyTbody.appendChild(tr);
      });
      emptyHistory.style.display = history.length ? 'none' : '';
    }

    document.addEventListener('click', function(e) {
      const approveId = e.target && e.target.getAttribute && e.target.getAttribute('data-approve');
      const declineId = e.target && e.target.getAttribute && e.target.getAttribute('data-decline');
      if (approveId) {
        const admin = getCurrentUser();
        setCampRequestStatus(approveId, 'approved', admin ? admin.email : 'admin', '');
        render();
      }
      if (declineId) {
        const admin = getCurrentUser();
        setCampRequestStatus(declineId, 'declined', admin ? admin.email : 'admin', '');
        render();
      }
    });

    render();
  }
  function initAuthPages() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const toast = document.getElementById('authToast');

    if (loginForm) {
      loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        try { loginUser(email, password); updateAdminLinkVisibility(); location.href = './index.html'; }
        catch (err) { showToast(toast, err.message || 'Login failed', 'error'); }
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('signupUsername').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;
        if (!username || !email || !password) return showToast(toast, 'Fill all fields', 'error');
        try { signupUser(username, email, password); updateAdminLinkVisibility(); location.href = './index.html'; }
        catch (err) { showToast(toast, err.message || 'Signup failed', 'error'); }
      });
    }
  }

  function initByPage() {
    setAriaCurrentNav();
    setupProfileModal();
    updateAdminLinkVisibility();
    const page = document.body.dataset.page || 'home';
    switch (page) {
      case 'home': return initHome();
      case 'register': return initRegister();
      case 'search': return initSearch();
      case 'request': return initRequest();
      case 'organize': return initOrganize();
      case 'admin': return initAdmin();
      case 'auth': return initAuthPages();
    }
  }

  document.addEventListener('DOMContentLoaded', initByPage);

  window.BloodDonor = {
    getDonors, addDonor, findDonorsByGroupAndCity,
    getUsers, signupUser, loginUser, getCurrentUser, logoutUser,
    getCampRequests, submitCampRequest, setCampRequestStatus,
    getAdminEmails, isCurrentUserAdmin
  };
})();