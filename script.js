  // Estado da aplicação
  let currentUser = null;
  let expenses = [];
  let users = {};
  let editingId = null;
  let currentFilter = 'all';
  let currentAnalysis = 'summary';

  // Elementos DOM
  const elements = {
      themeToggle: document.getElementById('themeToggle'),
      loginScreen: document.getElementById('loginScreen'),
      mainApp: document.getElementById('mainApp'),
      loginForm: document.getElementById('loginForm'),
      registerBtn: document.getElementById('registerBtn'),
      registerModal: document.getElementById('registerModal'),
      registerForm: document.getElementById('registerForm'),
      closeRegisterModal: document.getElementById('closeRegisterModal'),
      currentUserSpan: document.getElementById('currentUser'),
      logoutBtn: document.getElementById('logoutBtn'),
      expenseForm: document.getElementById('expenseForm'),
      expenseList: document.getElementById('expenseList'),
      editModal: document.getElementById('editModal'),
      editForm: document.getElementById('editForm'),
      closeModal: document.getElementById('closeModal'),
      notification: document.getElementById('notification'),
      cardsBreakdown: document.getElementById('cardsBreakdown'),
      alertsContainer: document.getElementById('alertsContainer'),
      profileBtn: document.getElementById('profileBtn'),
      profileModal: document.getElementById('profileModal'),
      profileForm: document.getElementById('profileForm'),
      closeProfileModal: document.getElementById('closeProfileModal')
  };

  // Inicialização
  document.addEventListener('DOMContentLoaded', function() {
      loadData();
      ensureMonthlyRollover();
      setupEventListeners();
      checkAutoLogin();
  });

  // Configurar event listeners
  function setupEventListeners() {
      // Tema
      elements.themeToggle.addEventListener('click', toggleTheme);
      
      // Login
      elements.loginForm.addEventListener('submit', handleLogin);
      elements.registerBtn.addEventListener('click', () => { showModal('registerModal'); initBankSelection(); });
      elements.registerForm.addEventListener('submit', handleRegister);
      elements.closeRegisterModal.addEventListener('click', () => hideModal('registerModal'));
      
      // Logout
      elements.logoutBtn.addEventListener('click', handleLogout);
      // Perfil
      elements.profileBtn.addEventListener('click', openProfile);
      elements.closeProfileModal.addEventListener('click', () => hideModal('profileModal'));
      elements.profileForm.addEventListener('submit', saveProfile);
      
      // Gastos
      elements.expenseForm.addEventListener('submit', handleAddExpense);
      elements.editForm.addEventListener('submit', handleEditExpense);
      elements.closeModal.addEventListener('click', () => hideModal('editModal'));
      
      // Categorias
      setupCategoryButtons();
      
      // Filtros
      setupFilterTabs();
      
      // Análises
      setupAnalysisTabs();
      
      // Fechar modais ao clicar fora
      document.addEventListener('click', handleModalClose);
  }

  function openProfile() {
      if (!currentUser || !users[currentUser]) return;
      buildProfileBankDetails();
      // Marcar bancos ativos
      const activeBanks = Object.keys(users[currentUser].cardLimits || {});
      document.querySelectorAll('.pf-bank').forEach(cb => {
          cb.checked = activeBanks.includes(cb.dataset.bank);
          cb.onchange = () => buildProfileBankDetails();
      });
      showModal('profileModal');
  }

  function buildProfileBankDetails() {
      if (!currentUser || !users[currentUser]) return;
      const container = document.getElementById('profileBankDetails');
      const bankMeta = users[currentUser].bankMeta || {};
      const limits = users[currentUser].cardLimits || {};
      const activeBanks = new Set(Array.from(document.querySelectorAll('.pf-bank:checked')).map(cb => cb.dataset.bank));
      const allBanks = ['Nubank', 'Itaú'];
      const selected = allBanks.filter(b => activeBanks.has(b));
      if (selected.length === 0) {
          container.innerHTML = '<div class="no-expenses">Selecione pelo menos um banco.</div>';
          return;
      }
      container.innerHTML = selected.map(bank => {
          const meta = bankMeta[bank] || {};
          const limit = limits[bank] || 0;
          const id = bank.toLowerCase().replace('ú', 'u'); // Itaú -> itau
          return `
              <div class="card" style="margin-bottom:1rem;">
                  <h3>${bank}</h3>
                  <div class="form-group">
                      <label for="pf_${id}_limit">Limite ${bank} (R$)</label>
                      <input type="number" id="pf_${id}_limit" class="form-control" step="0.01" min="0" value="${limit}">
                  </div>
                  <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;">
                      <div>
                          <label for="pf_${id}_close">Dia de fechamento</label>
                          <input type="number" id="pf_${id}_close" class="form-control" min="1" max="31" value="${meta.closeDay ?? ''}">
                      </div>
                      <div>
                          <label for="pf_${id}_due">Dia de vencimento</label>
                          <input type="number" id="pf_${id}_due" class="form-control" min="1" max="31" value="${meta.dueDay ?? ''}">
                      </div>
                  </div>
              </div>
          `;
      }).join('');
  }

  function saveProfile(e) {
      e.preventDefault();
      if (!currentUser || !users[currentUser]) return;
      const allBanks = ['Nubank', 'Itaú'];
      const selectedBanks = Array.from(document.querySelectorAll('.pf-bank:checked')).map(cb => cb.dataset.bank);
      if (selectedBanks.length === 0) {
          showNotification('Selecione pelo menos um banco.', 'error');
          return;
      }
      const newLimits = {};
      const newMeta = {};
      selectedBanks.forEach(bank => {
          const id = bank.toLowerCase().replace('ú', 'u'); // Itaú -> itau
          const limitVal = parseFloat(document.getElementById(`pf_${id}_limit`)?.value);
          const closeVal = parseInt(document.getElementById(`pf_${id}_close`)?.value);
          const dueVal = parseInt(document.getElementById(`pf_${id}_due`)?.value);
          newLimits[bank] = isNaN(limitVal) ? 0 : limitVal;
          newMeta[bank] = {
              closeDay: isNaN(closeVal) ? null : closeVal,
              dueDay: isNaN(dueVal) ? null : dueVal,
          };
      });

      // Remover bancos não selecionados de selects e dados
      users[currentUser].cardLimits = newLimits;
      users[currentUser].bankMeta = newMeta;
      saveData();

      hideModal('profileModal');
      populateCardSelects();
      renderCardsBreakdown();
      renderExpenses();
      renderAnalysis();
      checkLimitsAndAlerts();
      setupFilterTabs();
      showNotification('Perfil atualizado com sucesso!');
  }

  // Inicializar seleção de bancos no modal de registro
  function initBankSelection() {
      buildBankLimitDetails();
      const checkboxes = document.querySelectorAll('.bank-checkbox');
      checkboxes.forEach(cb => {
          cb.removeEventListener('change', buildBankLimitDetails);
          cb.addEventListener('change', buildBankLimitDetails);
      });
  }

  // Construir detalhes dos limites dos bancos no modal de registro
  function buildBankLimitDetails() {
      const container = document.getElementById('bankLimitDetails');
      const selectedBanks = Array.from(document.querySelectorAll('.bank-checkbox:checked')).map(cb => cb.dataset.bank);
      
      if (selectedBanks.length === 0) {
          container.innerHTML = '<div class="no-expenses">Selecione pelo menos um banco para configurar os limites.</div>';
          return;
      }
      
      container.innerHTML = selectedBanks.map(bank => {
          const id = bank.toLowerCase().replace('ú', 'u'); // Itaú -> itau
          return `
              <div class="card" style="margin-bottom:1rem;">
                  <h3>${bank}</h3>
                  <div class="form-group">
                      <label for="${id}Limit">Limite ${bank} (R$)</label>
                      <input type="number" id="${id}Limit" class="form-control" step="0.01" min="0" placeholder="Ex: 5000.00">
                  </div>
                  <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;">
                      <div>
                          <label for="${id}Close">Dia de fechamento</label>
                          <input type="number" id="${id}Close" class="form-control" min="1" max="31" placeholder="Ex: 15">
                      </div>
                      <div>
                          <label for="${id}Due">Dia de vencimento</label>
                          <input type="number" id="${id}Due" class="form-control" min="1" max="31" placeholder="Ex: 10">
                      </div>
                  </div>
              </div>
          `;
      }).join('');
  }

  // Configurar botões de categoria
  function setupCategoryButtons() {
      document.querySelectorAll('.category-btn').forEach(btn => {
          btn.addEventListener('click', function(e) {
              e.preventDefault();
              const isEditMode = this.classList.contains('edit-category-btn');
              const container = isEditMode ? this.closest('.modal-content') : this.closest('.card');
              const hiddenInput = container.querySelector(isEditMode ? '#editCategory' : '#category');
              
              container.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
              this.classList.add('active');
              hiddenInput.value = this.dataset.category;
          });
      });
  }

  // Configurar abas de filtro
  function setupFilterTabs() {
      const filterTabs = document.getElementById('filterTabs');
      if (!filterTabs) return;

      filterTabs.innerHTML = '';

      // Aba "Todos"
      const allBtn = document.createElement('button');
      allBtn.className = 'filter-tab active';
      allBtn.dataset.filter = 'all';
      allBtn.textContent = 'Todos';
      filterTabs.appendChild(allBtn);

      // Abas dos bancos permitidos
      const allowedBanks = currentUser && users[currentUser] ? Object.keys(users[currentUser].cardLimits || {}) : [];
      allowedBanks.forEach(bank => {
          const btn = document.createElement('button');
          btn.className = 'filter-tab';
          btn.dataset.filter = bank;
          btn.textContent = bank;
          filterTabs.appendChild(btn);
      });

      // Se não há bancos, mostrar mensagem
      if (allowedBanks.length === 0) {
          filterTabs.innerHTML = '<div class="no-expenses">Configure seus bancos no Perfil para começar</div>';
          return;
      }

      // Evento de filtro
      filterTabs.querySelectorAll('.filter-tab').forEach(tab => {
          tab.addEventListener('click', function() {
              filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
              this.classList.add('active');
              currentFilter = this.dataset.filter;
              renderExpenses();
          });
      });
  }

  // Configurar abas de análise
  function setupAnalysisTabs() {
      document.querySelectorAll('.analysis-tab').forEach(tab => {
          tab.addEventListener('click', function() {
              document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
              this.classList.add('active');
              
              document.querySelectorAll('.analysis-content').forEach(content => {
                  content.classList.add('hidden');
              });
              
              currentAnalysis = this.dataset.analysis;
              document.getElementById(currentAnalysis + 'Analysis').classList.remove('hidden');
              
              renderAnalysis();
              
          });
      });
  }
              

  // Alternar tema
  function toggleTheme() {
      const isDark = document.body.hasAttribute('data-theme');
      if (isDark) {
          document.body.removeAttribute('data-theme');
          elements.themeToggle.textContent = '🌙';
      } else {
          document.body.setAttribute('data-theme', 'dark');
          elements.themeToggle.textContent = '☀️';
      }
      saveTheme();
  }

  // Salvar tema
  function saveTheme() {
      const isDark = document.body.hasAttribute('data-theme');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  // Carregar tema
  function loadTheme() {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') {
          document.body.setAttribute('data-theme', 'dark');
          elements.themeToggle.textContent = '☀️';
      }
  }

  // Definir data atual
  function setCurrentDate() {
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('date').value = today;
  }

  // Carregar dados
  function loadData() {
      loadTheme();
      const savedUsers = localStorage.getItem('expenseUsers');
      const savedExpenses = localStorage.getItem('expenses');
      
      if (savedUsers) {
          users = JSON.parse(savedUsers);
      }
      
      if (savedExpenses) {
          expenses = JSON.parse(savedExpenses);
      }
  }

  // Salvar dados
  function saveData() {
      localStorage.setItem('expenseUsers', JSON.stringify(users));
      localStorage.setItem('expenses', JSON.stringify(expenses));
  }

  // Helpers de mês
  function getMonthKeyFromDate(dateString) {
      const d = new Date(dateString);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
  }

  function getCurrentMonthKey() {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
  }

  // Virada automática de mês: arquiva meses anteriores e zera o mês atual
  function ensureMonthlyRollover() {
      try {
          const currentKey = getCurrentMonthKey();
          const activeMonth = localStorage.getItem('activeMonth');
          let archives = {};
          try {
              archives = JSON.parse(localStorage.getItem('expenseArchives') || '{}') || {};
          } catch (_) {
              archives = {};
          }

          // Sempre armazena qualquer gasto que não seja do mês atual no arquivo (inclui lançamentos retroativos)
          if (Array.isArray(expenses) && expenses.length > 0) {
              const isCurrent = (exp) => getMonthKeyFromDate(exp.date) === currentKey;
              const toArchive = expenses.filter(exp => !isCurrent(exp));
              const remaining = expenses.filter(isCurrent);

              if (toArchive.length > 0) {
                  toArchive.forEach(exp => {
                      const userKey = exp.user || '_anonymous';
                      const monthKey = getMonthKeyFromDate(exp.date);
                      if (!archives[userKey]) archives[userKey] = {};
                      if (!archives[userKey][monthKey]) archives[userKey][monthKey] = [];
                      archives[userKey][monthKey].push(exp);
                  });
                  expenses = remaining;
                  localStorage.setItem('expenseArchives', JSON.stringify(archives));
                  saveData();
              }
          }

          // Garante que o mês ativo esteja sempre atualizado
          if (activeMonth !== currentKey) {
              localStorage.setItem('activeMonth', currentKey);
          }
      } catch (e) {
          console.warn('Falha ao processar virada de mês:', e);
      }
  }

  // Verificar login automático
  function checkAutoLogin() {
      const savedUser = localStorage.getItem('currentUser');
      if (savedUser && users[savedUser]) {
          currentUser = savedUser;
          showMainApp();
      }
  }

  // Handle login
  function handleLogin(e) {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      
      if (!username || !password) {
          showNotification('Por favor, preencha todos os campos!', 'error');
          return;
      }
      
      if (users[username] && users[username].password === password) {
          currentUser = username;
          localStorage.setItem('currentUser', currentUser);
          showMainApp();
          showNotification('Login realizado com sucesso!');
      } else {
          showNotification('Usuário ou senha incorretos!', 'error');
      }
  }

  // Handle registro
  function handleRegister(e) {
      e.preventDefault();
      const username = document.getElementById('newUsername').value.trim();
      const password = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      if (!username || !password || !confirmPassword) {
          showNotification('Por favor, preencha todos os campos!', 'error');
          return;
      }
      
      if (password !== confirmPassword) {
          showNotification('As senhas não coincidem!', 'error');
          return;
      }
      
      if (users[username]) {
          showNotification('Este usuário já existe!', 'error');
          return;
      }
      
      const selectedBanks = Array.from(document.querySelectorAll('.bank-checkbox:checked')).map(cb => cb.dataset.bank);
      if (selectedBanks.length === 0) {
          showNotification('Selecione pelo menos um banco para continuar.', 'error');
          return;
      }
      const cardLimits = {};
      const bankMeta = {};
      selectedBanks.forEach(bank => {
          const id = bank.toLowerCase().replace('ú', 'u'); // Itaú -> itau
          const limitVal = parseFloat(document.getElementById(`${id}Limit`)?.value);
          const closeVal = parseInt(document.getElementById(`${id}Close`)?.value);
          const dueVal = parseInt(document.getElementById(`${id}Due`)?.value);
          cardLimits[bank] = isNaN(limitVal) ? 0 : limitVal;
          bankMeta[bank] = {
              closeDay: isNaN(closeVal) ? null : closeVal,
              dueDay: isNaN(dueVal) ? null : dueVal
          };
      });
      
      users[username] = {
          password: password,
          cardLimits: cardLimits,
          bankMeta: bankMeta,
          createdAt: new Date().toISOString()
      };
      
      saveData();
      hideModal('registerModal');
      showNotification('Conta criada com sucesso! Você já pode fazer login.');
      
      // Limpar formulário
      elements.registerForm.reset();
      document.querySelectorAll('.bank-checkbox').forEach(cb => cb.checked = false);
      document.getElementById('bankLimitDetails').innerHTML = '';
  }

  // Handle logout
  function handleLogout() {
      currentUser = null;
      localStorage.removeItem('currentUser');
      showLoginScreen();
      showNotification('Logout realizado com sucesso!');
  }

  // Mostrar tela de login
  function showLoginScreen() {
      elements.loginScreen.classList.remove('hidden');
      elements.mainApp.classList.add('hidden');
      elements.loginForm.reset();
  }

  // Mostrar aplicação principal
  function showMainApp() {
      elements.loginScreen.classList.add('hidden');
      elements.mainApp.classList.remove('hidden');
      elements.currentUserSpan.textContent = currentUser;
      
      populateCardSelects();
      renderCardsBreakdown();
      renderExpenses();
      renderAnalysis();
      checkLimitsAndAlerts();
      setupFilterTabs();
  }

  // Preencher selects de cartão com bancos do usuário
  function populateCardSelects() {
      if (!currentUser || !users[currentUser]) return;
      const banks = Object.keys(users[currentUser].cardLimits || {});
      const makeOptions = (selected = '') => {
          let opts = '<option value="">Selecione o cartão</option>';
          banks.forEach(bank => {
              const sel = bank === selected ? ' selected' : '';
              opts += `<option value="${bank}"${sel}>${bank}</option>`;
          });
          return opts;
      };
      const addSelect = document.getElementById('card');
      const editSelect = document.getElementById('editCard');
      if (addSelect) {
          const prev = addSelect.value;
          addSelect.innerHTML = makeOptions(prev);
      }
      if (editSelect) {
          const prev = editSelect.value;
          editSelect.innerHTML = makeOptions(prev);
      }
  }

  // Handle adicionar gasto
  function handleAddExpense(e) {
      e.preventDefault();
      
      const formData = new FormData(e.target);
      const expense = {
          id: Date.now(),
          description: document.getElementById('description').value.trim(),
          amount: parseFloat(document.getElementById('amount').value),
          card: document.getElementById('card').value,
          category: document.getElementById('category').value,
          date: getTodayISODate(),
          user: currentUser,
          createdAt: new Date().toISOString()
      };
      
      if (!expense.description || !expense.amount || !expense.card || !expense.category) {
          showNotification('Por favor, preencha todos os campos!', 'error');
          return;
      }
      
      expenses.push(expense);
      saveData();
      
      elements.expenseForm.reset();
      document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
      
      renderCardsBreakdown();
      renderExpenses();
      renderAnalysis();
      checkLimitsAndAlerts();
      
      showNotification(`Gasto de ${formatCurrency(expense.amount)} adicionado com sucesso!`);
      
  }

  // Renderizar breakdown dos cartões
  function renderCardsBreakdown() {
      if (!currentUser || !users[currentUser] || !users[currentUser].cardLimits) {
          elements.cardsBreakdown.innerHTML = '<div class="no-expenses">Configure seus bancos no Perfil para começar</div>';
          return;
      }
      
      const userExpenses = getUserExpenses();
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyExpenses = userExpenses.filter(exp => {
          const expDate = new Date(exp.date);
          return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
      });
      
      const cardLimits = users[currentUser].cardLimits;
      const cardTotals = {};
      
      // Calcular totais por cartão - CORRIGIDO
      Object.keys(cardLimits).forEach(card => {
          const cardExpenses = monthlyExpenses.filter(exp => exp.card === card);
          cardTotals[card] = cardExpenses.reduce((sum, exp) => {
              const amount = parseFloat(exp.amount) || 0;
              return sum + amount;
          }, 0);
      });
      
      let html = '';
      Object.keys(cardLimits).forEach(card => {
          const used = cardTotals[card] || 0; // CORRIGIDO - garantir que não seja undefined
          const limit = parseFloat(cardLimits[card]) || 0; // CORRIGIDO
          const percentage = limit > 0 ? (used / limit) * 100 : 0;
          const remaining = Math.max(0, limit - used); // CORRIGIDO - evitar valores negativos
          const meta = users[currentUser].bankMeta ? users[currentUser].bankMeta[card] : null;
          const metaText = meta && (meta.closeDay || meta.dueDay)
              ? ` | <span class="bank-meta">fechamento: ${meta.closeDay || '-'} · vencimento: ${meta.dueDay || '-'}</span>`
              : '';
          
          html += `
              <div class="card-total">
                  <div class="card-name">${card}</div>
                  <div class="card-amount">${formatCurrency(used)}</div>
                  <div class="card-limit">Limite: ${formatCurrency(limit)} | Restante: ${formatCurrency(remaining)}${metaText}</div>
                  <div class="progress-bar-small">
                      <div class="progress" style="width: ${Math.min(percentage, 100)}%"></div>
                  </div>
              </div>
          `;
      });
      
      if (html === '') {
          html = '<div class="no-expenses">Configure seus bancos no Perfil para começar</div>';
      }
      
      elements.cardsBreakdown.innerHTML = html;
  }

  // Verificar limites e alertas
  function checkLimitsAndAlerts() {
      if (!currentUser || !users[currentUser] || !users[currentUser].cardLimits) return;
      
      const userExpenses = getUserExpenses();
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyExpenses = userExpenses.filter(exp => {
          const expDate = new Date(exp.date);
          return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
      });
      
      const cardLimits = users[currentUser].cardLimits;
      const alerts = [];
      
      Object.keys(cardLimits).forEach(card => {
          const cardExpenses = monthlyExpenses.filter(exp => exp.card === card);
          const used = cardExpenses.reduce((sum, exp) => {
              const amount = parseFloat(exp.amount) || 0;
              return sum + amount;
          }, 0);
          const limit = parseFloat(cardLimits[card]) || 0;
          const percentage = limit > 0 ? (used / limit) * 100 : 0;
          
          if (percentage >= 100) {
              alerts.push({
                  type: 'danger',
                  message: `⚠️ LIMITE ULTRAPASSADO! Cartão ${card}: ${formatCurrency(used)} de ${formatCurrency(limit)} (${percentage.toFixed(1)}%)`
              });
          } else if (percentage >= 80) {
              alerts.push({
                  type: 'warning',
                  message: `🟡 Atenção! Cartão ${card}: ${formatCurrency(used)} de ${formatCurrency(limit)} (${percentage.toFixed(1)}%)`
              });
          }
      });
      
      let alertsHtml = '';
      alerts.forEach(alert => {
          alertsHtml += `<div class="alert alert-${alert.type}">${alert.message}</div>`;
      });
      
      elements.alertsContainer.innerHTML = alertsHtml;
  }

  // Obter gastos do usuário
  function getUserExpenses() {
      return expenses.filter(exp => exp.user === currentUser);
  }

  // Filtrar gastos
  function filterExpenses(expenses) {
      if (currentFilter === 'all') {
          return expenses;
      }
      // Filtra pelo cartão selecionado na aba
      return expenses.filter(exp => exp.card === currentFilter);
  }

  // Renderizar gastos
  function renderExpenses() {
      const userExpenses = getUserExpenses();
      const filteredExpenses = filterExpenses(userExpenses);
      const sortedExpenses = filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (sortedExpenses.length === 0) {
          elements.expenseList.innerHTML = '<div class="no-expenses">Nenhum gasto encontrado para o período selecionado.</div>';
          return;
      }
      
      let html = '';
      sortedExpenses.forEach(expense => {
          const date = new Date(expense.date).toLocaleDateString('pt-BR');
          html += `
              <div class="expense-item">
                  <div class="expense-header">
                      <div class="expense-info">
                          <div class="expense-description">${expense.description}</div>
                          <div class="expense-meta">
                              <span class="expense-card-badge ${expense.card}">${expense.card}</span>
                              <span class="expense-category-badge">${expense.category}</span>
                          </div>
                      </div>
                      <div class="expense-amount">${formatCurrency(expense.amount)}</div>
                  </div>
                  <div class="expense-actions">
                      <button class="btn btn-edit" onclick="editExpense(${expense.id})">Editar</button>
                      <button class="btn btn-danger" onclick="deleteExpense(${expense.id})">Excluir</button>
                  </div>
              </div>
          `;
      });
      
      elements.expenseList.innerHTML = html;
  }

  // Utilitário para consultar arquivos de meses anteriores por usuário
  function getArchivedExpenses(user, monthKey) {
      try {
          const archives = JSON.parse(localStorage.getItem('expenseArchives') || '{}') || {};
          if (!user) return [];
          if (!archives[user]) return [];
          if (monthKey) return archives[user][monthKey] || [];
          // Se não informar mês, concatena todos
          return Object.values(archives[user]).flat();
      } catch (_) {
          return [];
      }
  }

  // Renderizar análises
  function renderAnalysis() {
      const userExpenses = getUserExpenses();
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyExpenses = userExpenses.filter(exp => {
          const expDate = new Date(exp.date);
          return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
      });
      
      // Resumo mensal
      const totalMonth = monthlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const dailyAverage = totalMonth / daysInMonth;
      const maxExpense = monthlyExpenses.length > 0 ? Math.max(...monthlyExpenses.map(exp => exp.amount)) : 0;
      const totalTransactions = monthlyExpenses.length;
      
      document.getElementById('totalMonth').textContent = formatCurrency(totalMonth);
      document.getElementById('dailyAverage').textContent = formatCurrency(dailyAverage);
      document.getElementById('maxExpense').textContent = formatCurrency(maxExpense);
      document.getElementById('totalTransactions').textContent = totalTransactions;
      
      // Análise por categorias
      const categoryTotals = {};
      monthlyExpenses.forEach(exp => {
          categoryTotals[exp.category] = (categoryTotals[exp.category] ||  0) + exp.amount;
      });
      
      renderRanking('categoryRanking', categoryTotals, totalMonth);
      
      // Análise por cartões
      const cardTotals = {};
      monthlyExpenses.forEach(exp => {
          cardTotals[exp.card] = (cardTotals[exp.card] || 0) + exp.amount;
      });
      
      renderRanking('cardRanking', cardTotals, totalMonth, true);
  }

  // Renderizar ranking
  function renderRanking(containerId, data, total, colorCardNames = false) {
      const container = document.getElementById(containerId);
      const sortedData = Object.entries(data).sort((a, b) => b[1] - a[1]);
      
      if (sortedData.length === 0) {
          container.innerHTML = '<div class="no-expenses">Nenhum dado disponível para este período.</div>';
          return;
      }
      
      let html = '';
      sortedData.forEach(([item, amount]) => {
          const percentage = total > 0 ? (amount / total) * 100 : 0;
          html += `
              <div class="ranking-item">
                  <div class="ranking-header">
                      ${colorCardNames
                          ? `<span class="expense-card-badge ${item}">${item}</span>`
                          : `<span class="ranking-category">${item}</span>`}
                      <span class="ranking-amount">${formatCurrency(amount)} (${percentage.toFixed(1)}%)</span>
                  </div>
                  <div class="ranking-bar">
                      <div class="ranking-bar-fill" style="width: ${percentage}%"></div>
                  </div>
              </div>
          `;
      });
      
      container.innerHTML = html;
  }

  // Mostrar modal
  function showModal(modalId) {
      const modal = document.getElementById(modalId);
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
  }

  // Esconder modal
  function hideModal(modalId) {
      const modal = document.getElementById(modalId);
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
  }

  // Handle fechar modal
  function handleModalClose(e) {
      if (e.target.classList.contains('modal')) {
          hideModal(e.target.id);
      }
  }

  // Mostrar notificação
  function showNotification(message, type = 'success') {
      elements.notification.textContent = message;
      elements.notification.className = `notification ${type === 'error' ? 'error' : ''}`;
      elements.notification.classList.add('show');
      
      setTimeout(() => {
          elements.notification.classList.remove('show');
      }, 4000);
  }

  // Formatação de moeda
  function formatCurrency(amount) {
      return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
      }).format(amount);
  }

  // Formatação de data
  function formatDate(dateString) {
      return new Date(dateString).toLocaleDateString('pt-BR');
  }

  // Exportar dados (funcionalidade extra)
  function exportData() {
      if (!currentUser) return;
      
      const userData = {
          user: currentUser,
          expenses: getUserExpenses(),
          cardLimits: users[currentUser].cardLimits,
          exportDate: new Date().toISOString()
      };
      
      const dataStr = JSON.stringify(userData, null, 2);
      const dataBlob = new Blob([dataStr], {type: 'application/json'});
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `gastos_${currentUser}_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      showNotification('Dados exportados com sucesso!');
  }

  // Limpar dados do usuário (funcionalidade extra)
  function clearUserData() {
      if (!currentUser) return;
      
      if (!confirm('Tem certeza que deseja apagar TODOS os seus gastos? Esta ação não pode ser desfeita!')) {
          return;
      }
      
      expenses = expenses.filter(exp => exp.user !== currentUser);
      saveData();
      
      renderCardsBreakdown();
      renderExpenses();
      renderAnalysis();
      checkLimitsAndAlerts();
      
      showNotification('Todos os gastos foram removidos!', 'success');
  }

  // Função para estatísticas avançadas
  function getAdvancedStats() {
      const userExpenses = getUserExpenses();
      if (userExpenses.length === 0) return null;
      
      const amounts = userExpenses.map(exp => exp.amount);
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      const average = total / amounts.length;
      const median = amounts.sort((a, b) => a - b)[Math.floor(amounts.length / 2)];
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      
      // Gastos por dia da semana
      const dayStats = {};
      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      
      userExpenses.forEach(exp => {
          const day = new Date(exp.date).getDay();
          const dayName = dayNames[day];
          dayStats[dayName] = (dayStats[dayName] || 0) + exp.amount;
      });
      
      // Categoria mais frequente
      const categoryCount = {};
      userExpenses.forEach(exp => {
          categoryCount[exp.category] = (categoryCount[exp.category] || 0) + 1;
      });
      
      const mostFrequentCategory = Object.entries(categoryCount)
          .sort((a, b) => b[1] - a[1])[0];
      
      return {
          total,
          average,
          median,
          min,
          max,
          dayStats,
          mostFrequentCategory: mostFrequentCategory ? mostFrequentCategory[0] : 'N/A',
          transactionCount: userExpenses.length
      };
  }

  // Atalhos de teclado
  document.addEventListener('keydown', function(e) {
      // ESC para fechar modais
      if (e.key === 'Escape') {
          document.querySelectorAll('.modal.show').forEach(modal => {
              hideModal(modal.id);
          });
      }
      
      // Ctrl+N para novo gasto (quando logado)
      if (e.ctrlKey && e.key === 'n' && !elements.mainApp.classList.contains('hidden')) {
          e.preventDefault();
          document.getElementById('description').focus();
      }
      
      // Ctrl+E para exportar dados
      if (e.ctrlKey && e.key === 'e' && !elements.mainApp.classList.contains('hidden')) {
          e.preventDefault();
          exportData();
      }
  });

  // Função para backup automático
  function autoBackup() {
      if (!currentUser) return;
      
      const backupData = {
          timestamp: new Date().toISOString(),
          user: currentUser,
          expenses: getUserExpenses(),
          userSettings: users[currentUser]
      };
      
      localStorage.setItem(`backup_${currentUser}_${Date.now()}`, JSON.stringify(backupData));
      
      // Manter apenas os 3 backups mais recentes
      const backupKeys = Object.keys(localStorage)
          .filter(key => key.startsWith(`backup_${currentUser}_`))
          .sort()
          .reverse();
          
      if (backupKeys.length > 3) {
          backupKeys.slice(3).forEach(key => {
              localStorage.removeItem(key);
          });
      }
  }

  // Executar backup automático a cada 5 minutos
  setInterval(autoBackup, 5 * 60 * 1000);

  // Melhorar acessibilidade
  function improveAccessibility() {
      // Adicionar atributos ARIA
      document.querySelectorAll('.btn').forEach(btn => {
          if (!btn.hasAttribute('aria-label') && btn.textContent.trim()) {
              btn.setAttribute('aria-label', btn.textContent.trim());
          }
      });
      
      // Melhorar navegação por teclado
      document.querySelectorAll('.modal').forEach(modal => {
          modal.setAttribute('role', 'dialog');
          modal.setAttribute('aria-hidden', 'true');
      });
      
      // Focar no primeiro elemento quando modal abre
      const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
              if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                  const target = mutation.target;
                  if (target.classList.contains('show') && target.classList.contains('modal')) {
                      const firstInput = target.querySelector('input, select, textarea, button');
                      if (firstInput) {
                          setTimeout(() => firstInput.focus(), 100);
                      }
                  }
              }
          });
      });
      
      document.querySelectorAll('.modal').forEach(modal => {
          observer.observe(modal, { attributes: true });
      });
  }

  // Inicializar melhorias de acessibilidade
  setTimeout(improveAccessibility, 100);

  // Adicionar tooltips informativos
  function addTooltips() {
      const tooltipData = [
          { selector: '.theme-toggle', text: 'Alternar entre tema claro e escuro' },
          { selector: '.logout-btn', text: 'Sair da aplicação' },
          { selector: '#expenseForm .btn-primary', text: 'Adicionar novo gasto' }
      ];
      
      tooltipData.forEach(({ selector, text }) => {
          const element = document.querySelector(selector);
          if (element) {
              element.setAttribute('title', text);
          }
      });
  }

  // Inicializar tooltips
  setTimeout(addTooltips, 100);

  // Função para validação em tempo real
  function setupRealTimeValidation() {
      const amountInput = document.getElementById('amount');
      const editAmountInput = document.getElementById('editAmount');
      
      [amountInput, editAmountInput].forEach(input => {
          if (input) {
              input.addEventListener('input', function() {
                  const value = parseFloat(this.value);
                  if (value < 0) {
                      this.value = 0;
                  }
                  if (value > 999999) {
                      this.value = 999999;
                      showNotification('Valor máximo é R$ 999.999,00', 'error');
                  }
              });
          }
      });
      
      // Validação de caracteres especiais na descrição
      const descriptionInputs = [document.getElementById('description'), document.getElementById('editDescription')];
      descriptionInputs.forEach(input => {
          if (input) {
              input.addEventListener('input', function() {
                  // Remover emojis e caracteres especiais problemáticos
                  this.value = this.value.replace(/[^\w\s\-.,!?()áéíóúàèìòùâêîôûãõçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]/g, '');
                  
                  if (this.value.length > 100) {
                      this.value = this.value.substring(0, 100);
                      showNotification('Descrição limitada a 100 caracteres', 'error');
                  }
              });
          }
      });
  }

  // Inicializar validação em tempo real
  setTimeout(setupRealTimeValidation, 100);

  // Console de debug (apenas em desenvolvimento)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      window.expenseApp = {
          getCurrentUser: () => currentUser,
          getExpenses: () => expenses,
          getUsers: () => users,
          exportData,
          clearUserData,
          getAdvancedStats
      };
      console.log('🎯 Expense Control App loaded! Use window.expenseApp for debugging.');
  }

  // Editar gasto
  function editExpense(id) {
      const expense = expenses.find(exp => exp.id === id);
      if (!expense) return;
      
      editingId = id;
      
      document.getElementById('editDescription').value = expense.description;
      document.getElementById('editAmount').value = expense.amount;
      document.getElementById('editCard').value = expense.card;
      document.getElementById('editCategory').value = expense.category;
      
      // Marcar categoria ativa
      document.querySelectorAll('.edit-category-btn').forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.category === expense.category) {
              btn.classList.add('active');
          }
      });
      
      showModal('editModal');
  }

  // Handle editar gasto
  function handleEditExpense(e) {
      e.preventDefault();
      
      if (!editingId) return;
      
      const expenseIndex = expenses.findIndex(exp => exp.id === editingId);
      if (expenseIndex === -1) return;
      
      const updatedExpense = {
          ...expenses[expenseIndex],
          description: document.getElementById('editDescription').value.trim(),
          amount: parseFloat(document.getElementById('editAmount').value),
          card: document.getElementById('editCard').value,
          category: document.getElementById('editCategory').value,
          updatedAt: new Date().toISOString()
      };
      
      if (!updatedExpense.description || !updatedExpense.amount || !updatedExpense.card || !updatedExpense.category) {
          showNotification('Por favor, preencha todos os campos!', 'error');
          return;
      }
      
      expenses[expenseIndex] = updatedExpense;
      saveData();
      
      hideModal('editModal');
      editingId = null;
      
      renderCardsBreakdown();
      renderExpenses();
      renderAnalysis();
      checkLimitsAndAlerts();
      
      showNotification(`Gasto atualizado com sucesso!`);
  }

  // Deletar gasto
  function deleteExpense(id) {
      if (!confirm('Tem certeza que deseja excluir este gasto?')) {
          return;
      }
      
      const expenseIndex = expenses.findIndex(exp => exp.id === id);
      if (expenseIndex === -1) return;
      
      const expense = expenses[expenseIndex];
      expenses.splice(expenseIndex, 1);
      saveData();
      
      renderCardsBreakdown();
      renderExpenses();
      renderAnalysis();
      checkLimitsAndAlerts();
      
      showNotification(`Gasto de ${formatCurrency(expense.amount)} removido com sucesso!`);
  }

  // Data atual em ISO (yyyy-mm-dd)
  function getTodayISODate() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
  }