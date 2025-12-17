/**
 * Shared Home Expense Tracker - Frontend with JWT Backend Integration
 * Connects to FastAPI backend via REST API with Token Authentication
 */

// ========== Configuration ==========
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000/api'
    : '/api';

// ========== Configuration ==========

// ========== Storage for current session ==========
const AppState = {
  currentUser: null,
  users: [],
  categories: [],
  expenses: [],
  toBuyItems: [],
  settings: {
    currencySymbol: '₹',
    homeName: 'Shared Home'
  }
};

// ========== API Helper Functions ==========

/**
 * Make authenticated API call with JWT token
 */
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = localStorage.getItem('accessToken');

  // Add authentication headers if token exists
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set options with headers
  options.headers = headers;

  // Convert body to JSON if it's an object
  if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    // Return empty object for 204 No Content
    if (response.status === 204) {
      return {};
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ========== Utility Functions ==========
function formatCurrency(amount) {
  return `${AppState.settings.currencySymbol}${parseFloat(amount).toFixed(2)}`;
}

function byId(id) {
  return document.getElementById(id);
}

function showError(message) {
  alert('Error: ' + message);
}

function showSuccess(message) {
  alert('Success: ' + message);
}

// ========== Loading Animation ==========
const LoadingModule = (function() {
  function show() {
    const loader = document.createElement('div');
    loader.id = 'appLoader';
    loader.innerHTML = `
      <style>
        #appLoader {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: var(--body-bg);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          transition: opacity 0.3s ease;
        }
        #appLoader.fade-out {
          opacity: 0;
          pointer-events: none;
        }
        .loader-spinner {
          width: 60px;
          height: 60px;
          border: 4px solid var(--border-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
      <div class="loader-spinner"></div>
    `;
    document.body.appendChild(loader);
  }

  function hide() {
    const loader = byId('appLoader');
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => loader.remove(), 300);
    }
  }

  return { show, hide };
})();

// ========== Auth Module with JWT ==========
const AuthModule = (function () {
  const authSection = byId("authSection");
  const appSection = byId("appSection");
  const loginForm = byId("loginForm");
  const usernameInput = byId("username");
  const passwordInput = byId("password");
  const currentUserSpan = byId("currentUser");
  const currentRoleSpan = byId("currentRole");
  const logoutBtn = byId("logoutBtn");

  function init() {
    setupTabs();
    loginForm.addEventListener("submit", onLogin);
    logoutBtn.addEventListener("click", onLogout);
    
    // Show loading and check for existing session on page load
    LoadingModule.show();
    authSection.style.display = "none";
    appSection.style.display = "none";
    checkExistingSession();
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        tabs.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  // Check if user is already logged in
  async function checkExistingSession() {
    const token = localStorage.getItem('accessToken');
    const savedUser = localStorage.getItem('currentUser');
    
    if (token && savedUser) {
      try {
        // Verify token is still valid by calling /me endpoint
        const user = await apiCall('/me');
        
        // Token is valid, restore the app state
        AppState.currentUser = user;
        
        // Load initial data
        await Promise.all([
          loadUsers(),
          loadCategories(),
          loadSettings()
        ]);

        // Show app
        showApp(user);
        
      } catch (error) {
        // Token expired or invalid, clear storage and show login
        console.log('Session expired or invalid');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('currentUser');
        showLogin();
      }
    } else {
      // No session, show login
      showLogin();
    }
    
    LoadingModule.hide();
  }

  function showApp(user) {
    authSection.style.display = "none";
    appSection.style.display = "flex";
    currentUserSpan.textContent = user.full_name;
    currentRoleSpan.textContent = user.role === "admin" ? "Admin" : "User";

    // Handle admin sidebar button
    const adminSidebarBtn = document.querySelector(".sidebar-btn.admin-only");
    if (adminSidebarBtn) {
      if (user.role === "admin") {
        adminSidebarBtn.style.display = "flex";
      } else {
        adminSidebarBtn.style.display = "none";
      }
    }

    LayoutModule.showPage("dashboard");
    UIModule.populateSelects();
    DashboardModule.refresh();
  }

  function showLogin() {
    authSection.style.display = "flex";
    appSection.style.display = "none";
  }

  async function onLogin(e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    try {
      LoadingModule.show();
      
      // Call login API - returns token and user
      const response = await apiCall('/login', {
        method: 'POST',
        body: { username, password }
      });

      // Store token and user info
      localStorage.setItem('accessToken', response.access_token);
      localStorage.setItem('currentUser', JSON.stringify(response.user));
      AppState.currentUser = response.user;

      // Load initial data
      await Promise.all([
        loadUsers(),
        loadCategories(),
        loadSettings()
      ]);

      // Show app
      showApp(response.user);
      LoadingModule.hide();
      
    } catch (error) {
      LoadingModule.hide();
      showError(error.message || 'Login failed');
    }
  }

  function onLogout() {
    // Clear session from localStorage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('currentUser');
    
    // Clear app state
    AppState.currentUser = null;
    AppState.users = [];
    AppState.categories = [];
    AppState.expenses = [];
    AppState.toBuyItems = [];

    showLogin();
    usernameInput.value = "";
    passwordInput.value = "";
  }

  async function loadUsers() {
    try {
      AppState.users = await apiCall('/users');
    } catch (error) {
      console.error('Failed to load users:', error);
      throw error;
    }
  }

  async function loadCategories() {
    try {
      AppState.categories = await apiCall('/categories');
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }

  async function loadSettings() {
    try {
      const settings = await apiCall('/settings');
      AppState.settings.currencySymbol = settings.currency_symbol || '₹';
      AppState.settings.homeName = settings.home_name || 'Shared Home';
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  return { init };
})();

// ========== Layout / Navigation ==========
// ========== Layout / Navigation ==========
const LayoutModule = (function () {
  const navButtons = document.querySelectorAll(".sidebar-btn");
  const pages = document.querySelectorAll(".page");

  function init() {
    navButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const pageKey = btn.getAttribute("data-page");
        showPage(pageKey);
      });
    });

    // Sidebar toggle - Fixed
    setupSidebarToggle();
  }

  function setupSidebarToggle() {
    const sidebar = document.querySelector(".sidebar");
    const mainContent = document.querySelector(".main-content");
    const sidebarToggle = document.getElementById("sidebarToggle"); // Changed from querySelector to getElementById

    if (sidebarToggle && sidebar && mainContent) {
      sidebarToggle.addEventListener("click", () => {
        // Check if we're on mobile (sidebar uses translateX)
        const isMobile = window.innerWidth <= 575;
        
        if (isMobile) {
          // On mobile, toggle .show class for slide in/out
          sidebar.classList.toggle("show");
        } else {
          // On desktop, toggle .collapsed class
          sidebar.classList.toggle("collapsed");
          mainContent.classList.toggle("sidebar-collapsed");
        }
      });
    }
  }

  function showPage(pageKey) {
    navButtons.forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-page") === pageKey);
    });

    pages.forEach(page => {
      page.classList.remove("active");
    });

    const pageEl = byId(pageKey + "Page");
    if (pageEl) pageEl.classList.add("active");

    if (pageKey === "dashboard") DashboardModule.refresh();
    if (pageKey === "analytics") AnalyticsModule.refreshCharts();
    if (pageKey === "person-insights") PersonInsightsModule.refresh();
    if (pageKey === "to-buy") ToBuyModule.refreshLists();
    if (pageKey === "expenses") ExpensesModule.renderExpenses();
    if (pageKey === "admin") AdminModule.init();
  }

  return { init, showPage };
})();



// ========== UI Helpers ==========
const UIModule = (function () {
  function populateSelects() {
    const paidBy = byId("paidBy");
    const purchasePaidBy = byId("purchasePaidBy");
    const filterPerson = byId("filterPerson");

    [paidBy, purchasePaidBy, filterPerson].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '<option value="">Select Person</option>';
    });

    AppState.users.forEach(u => {
      const opt1 = document.createElement("option");
      opt1.value = u.id;
      opt1.textContent = u.full_name;

      if (paidBy) paidBy.appendChild(opt1.cloneNode(true));
      if (purchasePaidBy) purchasePaidBy.appendChild(opt1.cloneNode(true));
      if (filterPerson) {
        const opt = opt1.cloneNode(true);
        opt.textContent = u.full_name;
        filterPerson.appendChild(opt);
      }
    });

    const expenseCat = byId("expenseCategory");
    const filterCat = byId("filterCategory");

    if (expenseCat) expenseCat.innerHTML = '<option value="">Select Category</option>';
    if (filterCat) filterCat.innerHTML = '<option value="">All Categories</option>';

    AppState.categories.forEach(c => {
      const opt1 = document.createElement("option");
      opt1.value = c.id;
      opt1.textContent = c.name;

      if (expenseCat) expenseCat.appendChild(opt1.cloneNode(true));
      if (filterCat) filterCat.appendChild(opt1.cloneNode(true));
    });
  }

  return { populateSelects };
})();

// ========== Expenses Module ==========
const ExpensesModule = (function () {
  const addExpenseForm = byId("addExpenseForm");
  const allExpensesList = byId("allExpensesList");
  const applyFilterBtn = byId("applyFilterBtn");
  const clearFilterBtn = byId("clearFilterBtn");
  const newCategoryBtn = byId("newCategoryBtn");
  const categoryModal = byId("categoryModal");
  const quickCategoryForm = byId("quickCategoryForm");

  function init() {
    if (addExpenseForm) {
      addExpenseForm.addEventListener("submit", addExpense);
    }
    if (applyFilterBtn) applyFilterBtn.addEventListener("click", renderExpenses);
    if (clearFilterBtn) clearFilterBtn.addEventListener("click", clearFilters);
    if (newCategoryBtn) newCategoryBtn.addEventListener("click", () => openModal(categoryModal));
    if (quickCategoryForm) quickCategoryForm.addEventListener("submit", quickAddCategory);

    setupModals();
  }

  function setupModals() {
    const modals = document.querySelectorAll(".modal");
    modals.forEach(modal => {
      const closeBtn = modal.querySelector(".close");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => closeModal(modal));
      }
    });

    window.addEventListener("click", e => {
      modals.forEach(modal => {
        if (e.target === modal) closeModal(modal);
      });
    });
  }

  function openModal(modal) {
    modal.classList.add("show");
  }

  function closeModal(modal) {
    modal.classList.remove("show");
  }

  async function addExpense(e) {
    e.preventDefault();

    const amount = parseFloat(byId("expenseAmount").value);
    const category_id = parseInt(byId("expenseCategory").value);
    const payment_mode = byId("paymentMode").value;
    const paid_by = parseInt(byId("paidBy").value);
    const date = byId("expenseDate").value;
    const time = byId("expenseTime").value;
    const description = byId("expenseDescription").value.trim();

    if (isNaN(amount) || !category_id || !paid_by || !date || !time) {
      showError("Please fill all required fields.");
      return;
    }

    try {
      await apiCall('/expenses', {
        method: 'POST',
        body: {
          amount,
          category_id,
          payment_mode,
          paid_by,
          date,
          time,
          description: description || null
        }
      });

      addExpenseForm.reset();
      showSuccess('Expense added successfully!');
      renderExpenses();
      DashboardModule.refresh();
      AnalyticsModule.refreshCharts();
      PersonInsightsModule.refresh();
    } catch (error) {
      showError(error.message || 'Failed to add expense');
    }
  }

  async function renderExpenses() {
    if (!allExpensesList) return;

    const filterCategory = byId("filterCategory").value;
    const filterPerson = byId("filterPerson").value;
    const filterPaymentMode = byId("filterPaymentMode").value;
    const filterStartDate = byId("filterStartDate").value;
    const filterEndDate = byId("filterEndDate").value;

    try {
      const params = new URLSearchParams();
      if (filterCategory) params.append('category_id', filterCategory);
      if (filterPerson) params.append('paid_by', filterPerson);
      if (filterPaymentMode) params.append('payment_mode', filterPaymentMode);
      if (filterStartDate) params.append('start_date', filterStartDate);
      if (filterEndDate) params.append('end_date', filterEndDate);

      const expenses = await apiCall(`/expenses?${params.toString()}`);
      AppState.expenses = expenses;

      allExpensesList.innerHTML = "";
      if (!expenses.length) {
        allExpensesList.innerHTML = "<div class='empty-table'><p>No expenses to display</p></div>";
        return;
      }

      expenses.forEach(exp => {
        const category = AppState.categories.find(c => c.id === exp.category_id);
        const user = AppState.users.find(u => u.id === exp.paid_by);

        const row = document.createElement("div");
        row.className = "expense-item";

        row.innerHTML = `
          <div class="expense-item-info">
            <strong>${category ? category.name : "Unknown"}</strong>
            <span>${exp.description || "-"}</span>
          </div>
          <div>${formatCurrency(exp.amount)}</div>
          <div>${user ? user.full_name : "-"}</div>
          <div>${exp.payment_mode}</div>
          <div>${exp.date} ${exp.time}</div>
          <div></div>
        `;

        allExpensesList.appendChild(row);
      });

      DashboardModule.refreshRecent(expenses);
    } catch (error) {
      showError('Failed to load expenses');
    }
  }

  function clearFilters() {
    byId("filterCategory").value = "";
    byId("filterPerson").value = "";
    byId("filterPaymentMode").value = "";
    byId("filterStartDate").value = "";
    byId("filterEndDate").value = "";
    renderExpenses();
  }

  async function quickAddCategory(e) {
    e.preventDefault();
    const name = byId("quickCategoryName").value.trim();
    const color = byId("quickCategoryColor").value;

    if (!name) return;

    try {
      const newCategory = await apiCall('/categories', {
        method: 'POST',
        body: { name, color }
      });

      AppState.categories.push(newCategory);
      UIModule.populateSelects();
      quickCategoryForm.reset();
      closeModal(categoryModal);
      AdminModule.renderCategories();
      showSuccess('Category created!');
    } catch (error) {
      showError(error.message || 'Failed to create category');
    }
  }

  return { init, renderExpenses };
})();

// ========== Dashboard ==========
const DashboardModule = (function () {
  const todayTotal = byId("todayTotal");
  const weekTotal = byId("weekTotal");
  const monthTotal = byId("monthTotal");
  const yearTotal = byId("yearTotal");
  const recentExpensesList = byId("recentExpensesList");
  const pendingToBuyList = byId("pendingToBuyList");

  async function refresh() {
    try {
      const expenses = await apiCall('/expenses');
      AppState.expenses = expenses;

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayExpenses = expenses.filter(e => e.date === todayStr);
      const thisWeekExpenses = filterByPeriod(expenses, "week");
      const thisMonthExpenses = filterByPeriod(expenses, "month");
      const thisYearExpenses = filterByPeriod(expenses, "year");

      todayTotal.textContent = formatCurrency(sumAmounts(todayExpenses));
      weekTotal.textContent = formatCurrency(sumAmounts(thisWeekExpenses));
      monthTotal.textContent = formatCurrency(sumAmounts(thisMonthExpenses));
      yearTotal.textContent = formatCurrency(sumAmounts(thisYearExpenses));

      refreshRecent(expenses);
      await refreshPendingToBuy();
    } catch (error) {
      console.error('Failed to refresh dashboard:', error);
    }
  }

  function sumAmounts(list) {
    return list.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  }

  function filterByPeriod(expenses, period) {
    const now = new Date();
    
    // Helper function to get date in YYYY-MM-DD format
    function getLocalDateString(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    const todayStr = getLocalDateString(now);
    
    return expenses.filter(e => {
      const expenseDate = e.date; // Format: YYYY-MM-DD
      
      if (period === "week") {
        const [year, month, day] = expenseDate.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        const daysDiff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff < 7;
      }
      
      if (period === "month") {
        const [year, month] = expenseDate.split('-').map(Number);
        return year === now.getFullYear() && month === (now.getMonth() + 1);
      }
      
      if (period === "year") {
        const [year] = expenseDate.split('-').map(Number);
        return year === now.getFullYear();
      }
      
      return false;
    });
  }


  function refreshRecent(expenses) {
    const recent = expenses.slice(0, 5);

    recentExpensesList.innerHTML = "";
    if (!recent.length) {
      recentExpensesList.innerHTML = "<p class='text-center mb-20'>No expenses yet.</p>";
      return;
    }

    recent.forEach(exp => {
      const category = AppState.categories.find(c => c.id === exp.category_id);
      const user = AppState.users.find(u => u.id === exp.paid_by);

      const item = document.createElement("div");
      item.className = "expense-item";

      item.innerHTML = `
        <div class="expense-item-info">
          <strong>${category ? category.name : "Unknown"}</strong>
          <span>${exp.description || "-"}</span>
        </div>
        <div>${formatCurrency(exp.amount)}</div>
        <div>${user ? user.full_name : "-"}</div>
        <div>${exp.payment_mode}</div>
        <div>${exp.date} ${exp.time}</div>
        <div></div>
      `;

      recentExpensesList.appendChild(item);
    });
  }

  async function refreshPendingToBuy() {
    try {
      const items = await apiCall('/to-buy?purchased=false');
      AppState.toBuyItems = items;

      pendingToBuyList.innerHTML = "";
      if (!items.length) {
        pendingToBuyList.innerHTML = "<p class='text-center mb-20'>No pending items.</p>";
        return;
      }

      items.slice(0, 5).forEach(item => {
        const div = document.createElement("div");
        div.className = "to-buy-item priority-" + item.priority;
        div.innerHTML = `
          <div class="to-buy-item-header">
            <h4>${item.name}</h4>
            <span class="badge badge-info">${item.target_date}</span>
          </div>
          <div class="to-buy-item-body">
            ${item.quantity ? `Qty: ${item.quantity} • ` : ""}Priority: ${item.priority}
          </div>
        `;
        pendingToBuyList.appendChild(div);
      });
    } catch (error) {
      console.error('Failed to load pending items:', error);
    }
  }

  return { refresh, refreshRecent };
})();

// ========== Analytics Module (Chart.js) ==========
const AnalyticsModule = (function () {
  let trendChart, categoryChart, paymentModeChart, personChart;
  const viewButtons = document.querySelectorAll(".view-btn");

  function init() {
    viewButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        viewButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        refreshCharts();
      });
    });

    setupCharts();
  }

  function setupCharts() {
    const trendCtx = document.getElementById("expenseTrendChart");
    const catCtx = document.getElementById("categoryPieChart");
    const payCtx = document.getElementById("paymentModeChart");
    const personCtx = document.getElementById("personBarChart");

    if (trendCtx) {
      trendChart = new Chart(trendCtx, {
        type: "line",
        data: { labels: [], datasets: [{ label: "Total", data: [], borderColor: '#2563eb', tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    if (catCtx) {
      categoryChart = new Chart(catCtx, {
        type: "pie",
        data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    if (payCtx) {
      paymentModeChart = new Chart(payCtx, {
        type: "doughnut",
        data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    if (personCtx) {
      personChart = new Chart(personCtx, {
        type: "bar",
        data: { labels: [], datasets: [{ label: "Total Spent", data: [], backgroundColor: '#3b82f6' }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  }

  function getCurrentView() {
    const active = document.querySelector(".view-btn.active");
    return active ? active.getAttribute("data-view") : "daily";
  }

  async function refreshCharts() {
    if (!trendChart) return;

    try {
      const expenses = await apiCall('/expenses');
      AppState.expenses = expenses;

      const view = getCurrentView();
      updateTrendChart(expenses, view);
      updateCategoryChart(expenses);
      updatePaymentModeChart(expenses);
      updatePersonChart(expenses);
    } catch (error) {
      console.error('Failed to refresh charts:', error);
    }
  }

  function updateTrendChart(expenses, view) {
    const map = new Map();
    expenses.forEach(e => {
      let key = e.date;
      if (view === "yearly") key = e.date.slice(0, 4);
      if (view === "monthly") key = e.date.slice(0, 7);
      if (!map.has(key)) map.set(key, 0);
      map.set(key, map.get(key) + parseFloat(e.amount));
    });

    const labels = Array.from(map.keys()).sort();
    const data = labels.map(l => map.get(l));

    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = data;
    trendChart.update();
  }

  function updateCategoryChart(expenses) {
    const map = new Map();
    expenses.forEach(e => {
      const cat = AppState.categories.find(c => c.id === e.category_id);
      const key = cat ? cat.name : "Unknown";
      if (!map.has(key)) map.set(key, 0);
      map.set(key, map.get(key) + parseFloat(e.amount));
    });

    const labels = Array.from(map.keys());
    const data = labels.map(l => map.get(l));
    const colors = labels.map(label => {
      const cat = AppState.categories.find(c => c.name === label);
      return cat ? cat.color : "#94a3b8";
    });

    categoryChart.data.labels = labels;
    categoryChart.data.datasets[0].data = data;
    categoryChart.data.datasets[0].backgroundColor = colors;
    categoryChart.update();
  }

  function updatePaymentModeChart(expenses) {
    const map = new Map();
    expenses.forEach(e => {
      const key = e.payment_mode;
      if (!map.has(key)) map.set(key, 0);
      map.set(key, map.get(key) + parseFloat(e.amount));
    });

    const labels = Array.from(map.keys());
    const data = labels.map(l => map.get(l));
    const colors = ["#22c55e", "#3b82f6", "#f97316"];

    paymentModeChart.data.labels = labels;
    paymentModeChart.data.datasets[0].data = data;
    paymentModeChart.data.datasets[0].backgroundColor = colors.slice(0, labels.length);
    paymentModeChart.update();
  }

  function updatePersonChart(expenses) {
    const labels = AppState.users.map(u => u.full_name);
    const data = labels.map(name => {
      const user = AppState.users.find(u => u.full_name === name);
      return expenses
        .filter(e => e.paid_by === user.id)
        .reduce((s, e) => s + parseFloat(e.amount), 0);
    });

    personChart.data.labels = labels;
    personChart.data.datasets[0].data = data;
    personChart.update();
  }

  return { init, refreshCharts };
})();

// ========== Person Insights ==========
// ========== Person Insights ==========
const PersonInsightsModule = (function () {
  const grid = byId("personInsightsGrid");
  const buttons = document.querySelectorAll(".insight-view-btn");

  function init() {
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        refresh();
      });
    });
  }

  function getCurrentPeriod() {
    const active = document.querySelector(".insight-view-btn.active");
    return active ? active.getAttribute("data-period") : "day";
  }

  async function refresh() {
    grid.innerHTML = "";
    const period = getCurrentPeriod();

    try {
      const expenses = await apiCall('/expenses');

      AppState.users.forEach(u => {
        const total = getTotalForUserAndPeriod(u.id, period, expenses);
        const card = document.createElement("div");
        card.className = "person-insight-card";
        card.innerHTML = `
          <h4>${u.full_name}</h4>
          <div class="amount">${formatCurrency(total)}</div>
          <div class="details">Total spent by ${u.full_name} this ${period}</div>
        `;
        grid.appendChild(card);
      });
    } catch (error) {
      console.error('Failed to refresh person insights:', error);
    }
  }

  function getTotalForUserAndPeriod(userId, period, expenses) {
    const now = new Date();
    
    // Helper function to get date in YYYY-MM-DD format without timezone issues
    function getLocalDateString(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    const todayStr = getLocalDateString(now);
    
    return expenses
      .filter(e => e.paid_by === userId)
      .filter(e => {
        const expenseDate = e.date; // Format: YYYY-MM-DD
        
        if (period === "day") {
          // Compare date strings directly
          return expenseDate === todayStr;
        }
        
        // For other periods, parse the date
        const [year, month, day] = expenseDate.split('-').map(Number);
        const d = new Date(year, month - 1, day); // month is 0-indexed
        
        if (period === "week") {
          const daysDiff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
          return daysDiff >= 0 && daysDiff < 7;
        }
        
        if (period === "month") {
          return (
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth()
          );
        }
        
        if (period === "year") {
          return d.getFullYear() === now.getFullYear();
        }
        
        return true;
      })
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  }

  return { init, refresh };
})();


// ========== To-Buy List ==========
const ToBuyModule = (function () {
  const addToBuyForm = byId("addToBuyForm");
  const pendingItemsList = byId("pendingItemsList");
  const purchasedItemsList = byId("purchasedItemsList");
  const purchaseModal = byId("purchaseModal");
  const markPurchasedForm = byId("markPurchasedForm");
  const purchaseItemIdInput = byId("purchaseItemId");

  function init() {
    if (addToBuyForm) addToBuyForm.addEventListener("submit", addItem);
    if (markPurchasedForm) markPurchasedForm.addEventListener("submit", markPurchased);
    setupModal();
  }

  function setupModal() {
    const closeBtn = purchaseModal.querySelector(".close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => closeModal(purchaseModal));
    }

    window.addEventListener("click", e => {
      if (e.target === purchaseModal) closeModal(purchaseModal);
    });
  }

  function openModal(modal) {
    modal.classList.add("show");
  }

  function closeModal(modal) {
    modal.classList.remove("show");
  }

  async function addItem(e) {
    e.preventDefault();
    const name = byId("toBuyItem").value.trim();
    const quantity = byId("toBuyQuantity").value.trim();
    const target_date = byId("toBuyDate").value;
    const priority = byId("toBuyPriority").value;
    const notes = byId("toBuyNotes").value.trim();

    if (!name || !target_date) {
      showError("Item name and date are required.");
      return;
    }

    try {
      await apiCall('/to-buy', {
        method: 'POST',
        body: {
          name,
          quantity: quantity || null,
          target_date,
          priority,
          notes: notes || null
        }
      });

      addToBuyForm.reset();
      showSuccess('Item added to list!');
      refreshLists();
      DashboardModule.refresh();
    } catch (error) {
      showError(error.message || 'Failed to add item');
    }
  }

  async function refreshLists() {
    await renderList(false, pendingItemsList);
    await renderList(true, purchasedItemsList);
  }

  async function renderList(purchased, container) {
    container.innerHTML = "";

    try {
      const items = await apiCall(`/to-buy?purchased=${purchased}`);

      if (!items.length) {
        const emptyMsg = purchased ? "No purchased items" : "No pending items";
        container.innerHTML = `<div class='empty-table'><p>${emptyMsg}</p></div>`;
        return;
      }

      items.sort((a, b) => a.target_date.localeCompare(b.target_date)).forEach(item => {
        const div = document.createElement("div");
        div.className = "to-buy-item priority-" + item.priority;

        let footerHtml = "";
        if (!purchased) {
          footerHtml = `
            <button class="btn-success" data-action="mark" data-id="${item.id}">Mark Purchased</button>
          `;
        } else if (item.purchase_amount) {
          const user = AppState.users.find(u => u.id === item.purchased_by);
          footerHtml = `
            <span class="badge badge-success">Purchased by ${user ? user.full_name : "Unknown"}</span>
            <span>${formatCurrency(item.purchase_amount)} (${item.purchase_payment_mode})</span>
          `;
        }

        div.innerHTML = `
          <div class="to-buy-item-header">
            <h4>${item.name}</h4>
            <span class="badge badge-info">${item.target_date}</span>
          </div>
          <div class="to-buy-item-body">
            ${item.quantity ? `Qty: ${item.quantity} • ` : ""}Priority: ${item.priority}
            ${item.notes ? `<br>${item.notes}` : ""}
          </div>
          <div class="to-buy-item-footer">
            ${footerHtml}
          </div>
        `;

        div.addEventListener("click", e => {
          const btn = e.target.closest("button[data-action='mark']");
          if (btn) {
            const id = parseInt(btn.getAttribute("data-id"));
            purchaseItemIdInput.value = id;
            openModal(purchaseModal);
          }
        });

        container.appendChild(div);
      });
    } catch (error) {
      console.error('Failed to load to-buy items:', error);
    }
  }

  async function markPurchased(e) {
    e.preventDefault();
    const id = parseInt(purchaseItemIdInput.value);
    const purchase_amount = parseFloat(byId("purchaseAmount").value);
    const purchased_by = parseInt(byId("purchasePaidBy").value);
    const purchase_payment_mode = byId("purchasePaymentMode").value;
    const purchase_date = new Date().toISOString().slice(0, 10);

    if (!id || isNaN(purchase_amount) || !purchased_by || !purchase_payment_mode) {
      showError("Please fill all fields.");
      return;
    }

    try {
      await apiCall(`/to-buy/${id}/purchase`, {
        method: 'PATCH',
        body: {
          purchased_by,
          purchase_amount,
          purchase_payment_mode,
          purchase_date
        }
      });

      markPurchasedForm.reset();
      closeModal(purchaseModal);
      showSuccess('Item marked as purchased!');
      refreshLists();
      DashboardModule.refresh();
      AnalyticsModule.refreshCharts();
      PersonInsightsModule.refresh();
      ExpensesModule.renderExpenses();
    } catch (error) {
      showError(error.message || 'Failed to mark as purchased');
    }
  }

  return { init, refreshLists };
})();

// ========== Admin / Settings ==========
const AdminModule = (function () {
  const addUserForm = byId("addUserForm");
  const addCategoryForm = byId("addCategoryForm");
  const usersList = byId("usersList");
  const categoriesList = byId("categoriesList");
  const saveSettingsBtn = byId("saveSettingsBtn");

  function init() {
    if (addUserForm) addUserForm.addEventListener("submit", addUser);
    if (addCategoryForm) addCategoryForm.addEventListener("submit", addCategory);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener("click", saveSettings);

    renderUsers();
    renderCategories();
    loadSettingsIntoUI();
  }

  async function addUser(e) {
    e.preventDefault();
    const username = byId("newUsername").value.trim();
    const password = byId("newPassword").value.trim();
    const full_name = byId("newUserFullName").value.trim();

    if (!username || !password || !full_name) {
      showError("All fields required.");
      return;
    }

    try {
      await apiCall('/users', {
        method: 'POST',
        body: { username, password, full_name, role: "user" }
      });

      addUserForm.reset();
      showSuccess('User added successfully!');

      // Reload users
      AppState.users = await apiCall('/users');
      renderUsers();
      UIModule.populateSelects();
    } catch (error) {
      showError(error.message || 'Failed to add user');
    }
  }

  function renderUsers() {
    if (!usersList) return;
    usersList.innerHTML = "";
    AppState.users.forEach(u => {
      const div = document.createElement("div");
      div.className = "admin-list-item";
      div.innerHTML = `
        <span>${u.full_name} (${u.username}) - ${u.role}</span>
      `;
      usersList.appendChild(div);
    });
  }

  async function addCategory(e) {
    e.preventDefault();
    const name = byId("newCategoryName").value.trim();
    const color = byId("newCategoryColor").value;

    if (!name) {
      showError("Category name required.");
      return;
    }

    try {
      await apiCall('/categories', {
        method: 'POST',
        body: { name, color }
      });

      addCategoryForm.reset();
      showSuccess('Category added successfully!');

      // Reload categories
      AppState.categories = await apiCall('/categories');
      renderCategories();
      UIModule.populateSelects();
    } catch (error) {
      showError(error.message || 'Failed to add category');
    }
  }

  function renderCategories() {
    if (!categoriesList) return;
    categoriesList.innerHTML = "";
    AppState.categories.forEach(c => {
      const div = document.createElement("div");
      div.className = "admin-list-item";
      div.innerHTML = `
        <span>
          <span style="display:inline-block;width:12px;height:12px;border-radius:999px;background:${c.color};margin-right:8px;"></span>
          ${c.name}
        </span>
      `;
      categoriesList.appendChild(div);
    });
  }

  function loadSettingsIntoUI() {
    const currencySymbolInput = byId("currencySymbol");
    const homeNameInput = byId("homeName");

    if (currencySymbolInput) {
      currencySymbolInput.value = AppState.settings.currencySymbol;
    }
    if (homeNameInput) {
      homeNameInput.value = AppState.settings.homeName;
    }
  }

  async function saveSettings() {
    const currency_symbol = byId("currencySymbol").value || "₹";
    const home_name = byId("homeName").value || "Shared Home";

    try {
      await apiCall('/settings', {
        method: 'PUT',
        body: { currency_symbol, home_name }
      });

      AppState.settings.currencySymbol = currency_symbol;
      AppState.settings.homeName = home_name;

      showSuccess('Settings saved!');
      DashboardModule.refresh();
    } catch (error) {
      showError(error.message || 'Failed to save settings');
    }
  }

  return { init, renderUsers, renderCategories };
})();

// ========== Theme Toggle ==========
const ThemeModule = (function() {
  const themeToggle = document.querySelector('.theme-toggle');
  const htmlElement = document.documentElement;

  function init() {
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    htmlElement.setAttribute('data-theme', savedTheme);

    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }
  }

  function toggleTheme() {
    const currentTheme = htmlElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    htmlElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }

  return { init };
})();

// ========== Initialize App ==========
document.addEventListener("DOMContentLoaded", () => {
  ThemeModule.init();
  AuthModule.init();
  LayoutModule.init();
  ExpensesModule.init();
  AnalyticsModule.init();
  PersonInsightsModule.init();
  ToBuyModule.init();
});
