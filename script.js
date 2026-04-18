// --- IMPORTAÇÃO DOS MÓDULOS DO FIREBASE V10 ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDlb1GCYz9ztCSPnKxit7Puzk2SYrHjFOY",
    authDomain: "familia-bem.firebaseapp.com",
    databaseURL: "https://familia-bem-default-rtdb.firebaseio.com",
    projectId: "familia-bem",
    storageBucket: "familia-bem.firebasestorage.app",
    messagingSenderId: "34742540151",
    appId: "1:34742540151:web:19d0343af0ec4393437372"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbFirebase = getDatabase(app);

// --- ESTADOS DO APLICATIVO ---
let currentUid = null;
let currentUser = null; 
let currentFamilyId = null;
let currentView = 'home';
let currentDate = new Date(); 
let selectedDate = new Date(); 
const chartColors = ['#d4af37', '#3498db', '#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f', '#1abc9c'];

let db = { categories: [], entries: [], feiraItems: [], notificationsLog: [] };

// --- FUNÇÕES DE BANCO DE DADOS ---
function saveDB() {
    if (currentFamilyId) set(ref(dbFirebase, 'couples/' + currentFamilyId), db);
}

function listenToCoupleData() {
    onValue(ref(dbFirebase, 'couples/' + currentFamilyId), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            db = data;
            if (!db.categories) db.categories = ['Alimentação', 'Contas da Casa', 'Lazer', 'Viagem', 'Mercado'];
            if (!db.entries) db.entries = [];
            if (!db.feiraItems) db.feiraItems = [];
            if (!db.notificationsLog) db.notificationsLog = [];
        } else {
            db = { categories: ['Alimentação', 'Contas da Casa', 'Lazer', 'Viagem', 'Mercado'], entries: [], feiraItems: [], notificationsLog: [] };
            saveDB();
        }
        updateCategorySelect(); renderAll();
    });
}

// --- PWA: INSTALAÇÃO ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const btn = document.getElementById('btn-install'); if(btn) btn.style.display = 'inline-block'; });
window.installApp = function() { if(deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(() => { deferredPrompt = null; document.getElementById('btn-install').style.display = 'none'; }); } }

// --- LOGIN MULTIUSUÁRIO (VÍNCULO DE CPF) ---
window.handleRegister = async function() {
    const role = document.getElementById('reg-role').value;
    const cpf = document.getElementById('reg-cpf').value.replace(/\D/g, '');
    const partnerCpf = document.getElementById('reg-partner-cpf').value.replace(/\D/g, '');
    const pass = document.getElementById('reg-pass').value;
    const phrase = document.getElementById('reg-phrase').value;

    if(!cpf || !partnerCpf || !pass || !phrase) return showToast("Preencha todos os campos!", true);
    if(pass.length < 6) return showToast("A senha precisa ter no mínimo 6 caracteres.", true);

    const email = `${cpf}@familiabem.com`;
    // Cria um ID único para a família combinando e ordenando os dois CPFs
    const familyId = [cpf, partnerCpf].sort().join('_'); 

    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = userCred.user.uid;

        // Salva o perfil individual
        await set(ref(dbFirebase, `users/${uid}`), { role: role, familyId: familyId, securityPhrase: phrase });

        showToast("Cadastro realizado! Faça seu login.");
        window.showScreen('login-screen');
        await signOut(auth); // Desloga para forçar ele a entrar pela tela inicial
    } catch(error) {
        if(error.code === 'auth/email-already-in-use') showToast("CPF já cadastrado!", true);
        else showToast("Erro ao registrar. Tente novamente.", true);
    }
};

window.attemptLogin = async function() {
    const cpf = document.getElementById('login-cpf').value.replace(/\D/g, ''); 
    const pass = document.getElementById('login-pass').value;

    if(!cpf || !pass) return showToast("Preencha CPF e Senha!", true);
    const email = `${cpf}@familiabem.com`;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        currentUid = userCredential.user.uid;
        
        // Busca qual o papel dele e a ID da família no Banco de Dados
        const userSnapshot = await get(ref(dbFirebase, `users/${currentUid}`));
        if(userSnapshot.exists()) {
            const userData = userSnapshot.val();
            currentUser = userData.role;
            currentFamilyId = userData.familyId;
            
            document.getElementById('display-user').innerText = currentUser;
            window.showScreen('main-screen');
            listenToCoupleData(); 

            if ("Notification" in window) Notification.requestPermission().then(p => { if (p === "granted") checkTodayInstallments(); });
        } else {
            showToast("Perfil de usuário não encontrado.", true);
        }
    } catch(error) {
        showToast("Login ou senha incorretos!", true);
    }
};

window.handleForgotPassword = function() {
    showConfirmModal(
        "Aviso do Sistema", 
        "O sistema de segurança do Firebase impede a troca de senha sem um E-mail verdadeiro por aqui. Me avise no chat qual caminho vamos seguir para o Esqueci a Senha!", 
        () => { window.showScreen('login-screen'); }
    );
};

window.logout = function() {
    showConfirmModal("Sair da Conta", "Deseja encerrar sua sessão?", async () => {
        await signOut(auth); currentUid = null; currentUser = null; currentFamilyId = null;
        window.showScreen('login-screen');
    });
};

// --- SISTEMA DE AVISOS, NAVEGAÇÃO E CRUD ---
function sendNotification(title, body) { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body: body, icon: 'icon-512.png' }); }
function logNotification(text) {
    const now = new Date(); const logStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')} às ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    db.notificationsLog.unshift({ time: logStr, text: text });
    if(db.notificationsLog.length > 50) db.notificationsLog.pop(); saveDB();
}

window.openNotifications = function() {
    const list = document.getElementById('notifications-list'); list.innerHTML = '';
    if (!db.notificationsLog || db.notificationsLog.length === 0) list.innerHTML = '<p style="text-align:center; opacity:0.5;">Nenhuma atividade recente.</p>';
    else db.notificationsLog.forEach(log => { list.innerHTML += `<div class="log-item"><span class="log-time">${log.time}</span>${log.text}</div>`; });
    document.getElementById('modal-notifications').classList.add('active');
};

function checkTodayInstallments() {
    const todayStr = getIsoDate(new Date()); const dueToday = db.entries.filter(e => e.date === todayStr && e.desc.includes('/') && e.type === 'home');
    dueToday.forEach(e => { sendNotification("💸 Parcela Vencendo Hoje!", `${e.desc} - Valor: R$ ${e.val.toFixed(2)}`); });
}

function showToast(msg, isError = false) { const t = document.getElementById('toast'); t.innerText = msg; t.style.backgroundColor = isError ? 'var(--danger)' : 'var(--success)'; t.className = "show"; setTimeout(() => { t.className = t.className.replace("show", ""); }, 2900); }
let pendingConfirmAction = null;
function showConfirmModal(title, msg, onConfirm) { document.getElementById('confirm-title').innerText = title; document.getElementById('confirm-msg').innerText = msg; pendingConfirmAction = onConfirm; document.getElementById('btn-confirm-action').onclick = () => { if(pendingConfirmAction) pendingConfirmAction(); window.closeModals(); }; document.getElementById('modal-confirm').classList.add('active'); }
window.closeModals = function() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); };
window.showScreen = function(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); };
function getIsoDate(dateObj) { return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`; }

window.setTab = function(tab) { currentView = tab; document.getElementById('tab-home').classList.toggle('active', tab === 'home'); document.getElementById('tab-personal').classList.toggle('active', tab === 'personal'); document.getElementById('split-options').style.display = tab === 'home' ? 'block' : 'none'; renderAll(); };
window.changeMonth = function(dir) { currentDate.setMonth(currentDate.getMonth() + dir); renderAll(); };
window.selectDay = function(y, m, d) { selectedDate = new Date(y, m, d); renderAll(); };

function renderCalendar() {
    const container = document.getElementById('calendar-days'); container.innerHTML = '';
    const year = currentDate.getFullYear(); const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    document.getElementById('cal-month-year').innerText = `${monthNames[month]} ${year}`;

    const eventsSet = new Set(db.entries.filter(e => {
        let correctTab = currentView === 'home' ? (e.type === 'home') : (e.type === 'home' || (e.type === 'personal' && e.owner === currentUser));
        return correctTab && e.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`);
    }).map(e => e.date));

    for (let i = 0; i < firstDay; i++) container.innerHTML += `<div></div>`;
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isSelected = (i === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear());
        let classes = 'cal-day' + (isSelected ? ' active' : '') + (eventsSet.has(dateStr) ? ' has-event' : '');
        container.innerHTML += `<div class="${classes}" onclick="selectDay(${year}, ${month}, ${i})">${i}</div>`;
    }
}

function updateCategorySelect() { const select = document.getElementById('exp-cat'); select.innerHTML = ''; db.categories.forEach(cat => { select.innerHTML += `<option value="${cat}">${cat}</option>`; }); }
window.openCategoryModal = function() { document.getElementById('new-cat-name').value = ''; document.getElementById('modal-category').classList.add('active'); };
window.confirmAddCategory = function() { const newCat = document.getElementById('new-cat-name').value.trim(); if (newCat) { db.categories.push(newCat); saveDB(); showToast("Categoria Adicionada!"); window.closeModals(); } };
window.openAddModal = function() { document.getElementById('edit-id').value = ''; document.getElementById('form-title').innerText = "Nova Despesa"; document.getElementById('exp-desc').value = ''; document.getElementById('exp-val').value = ''; document.getElementById('exp-date').value = getIsoDate(selectedDate); document.getElementById('parcelas-container').style.display = 'block'; document.getElementById('modal-add').classList.add('active'); };

window.handleAddEntry = function() {
    const editId = document.getElementById('edit-id').value; const desc = document.getElementById('exp-desc').value;
    const valTotal = parseFloat(document.getElementById('exp-val').value); const cat = document.getElementById('exp-cat').value;
    const date = document.getElementById('exp-date').value; const split = parseInt(document.getElementById('exp-split').value); const parcels = parseInt(document.getElementById('exp-installments').value);

    if (!desc || isNaN(valTotal) || !date) return showToast("Preencha os campos!", true);

    const saveAction = () => {
        if (editId) {
            const idx = db.entries.findIndex(e => e.id == editId);
            if(idx > -1) { db.entries[idx].desc = desc; db.entries[idx].val = valTotal; db.entries[idx].category = cat; db.entries[idx].date = date; db.entries[idx].split = split; }
            if(db.entries[idx].type === 'home') logNotification(`✏️ ${currentUser.toUpperCase()} alterou a despesa "${desc}".`);
        } else {
            const valParcela = valTotal / parcels; let [y, m, d] = date.split('-').map(Number);
            for(let i = 0; i < parcels; i++) {
                let newDate = new Date(y, m - 1 + i, d); let finalDesc = parcels > 1 ? `${desc} (${i+1}/${parcels})` : desc;
                db.entries.push({ id: Date.now() + i, desc: finalDesc, val: valParcela, category: cat, date: getIsoDate(newDate), split: split, owner: currentUser, type: currentView });
            }
            if (currentView === 'home') { const msg = `🏠 ${currentUser.toUpperCase()} lançou: ${desc} (R$ ${valTotal.toFixed(2)})`; sendNotification("Nova Despesa", msg); logNotification(msg); }
        }
        saveDB(); showToast("Salvo!"); window.closeModals();
    };
    if (editId) showConfirmModal("Confirmar Alteração", "Deseja salvar as mudanças neste registro?", saveAction); else saveAction();
};

window.editEntry = function(id) { const e = db.entries.find(x => x.id === id); document.getElementById('edit-id').value = e.id; document.getElementById('form-title').innerText = "Editar Registro"; document.getElementById('exp-desc').value = e.desc; document.getElementById('exp-val').value = e.val; document.getElementById('exp-cat').value = e.category; document.getElementById('exp-date').value = e.date; document.getElementById('exp-split').value = e.split; document.getElementById('parcelas-container').style.display = 'none'; document.getElementById('modal-add').classList.add('active'); };
window.deleteEntry = function(id) { showConfirmModal("Excluir", "Tem certeza que deseja apagar este registro?", () => { const e = db.entries.find(x => x.id === id); if(e && e.type === 'home') logNotification(`🗑 ${currentUser.toUpperCase()} apagou a despesa "${e.desc}".`); db.entries = db.entries.filter(x => x.id !== id); saveDB(); showToast("Removido!"); }); };

window.openAlarmModal = function() { document.getElementById('modal-alarm').classList.add('active'); };
window.handleSaveAlarm = function() { const desc = document.getElementById('alarm-desc').value; const date = document.getElementById('alarm-date').value; const time = document.getElementById('alarm-time').value; if(!desc || !date || !time) return showToast("Preencha todos os campos do alarme!", true); db.entries.push({ id: Date.now(), isAlarm: true, desc: "⏰ " + desc, date, time, owner: currentUser, type: currentView }); saveDB(); window.closeModals(); showToast("Alarme Agendado!"); };

window.showFeiraScreen = function() { window.showScreen('feira-screen'); renderFeira(); }; window.closeFeiraScreen = function() { window.showScreen('main-screen'); };
window.openFeiraItemModal = function() { document.getElementById('feira-edit-id').value = ''; document.getElementById('feira-item-name').value = ''; document.getElementById('feira-item-val').value = ''; document.getElementById('modal-feira-item').classList.add('active'); };
window.handleSaveFeiraItem = function() {
    const id = document.getElementById('feira-edit-id').value; const name = document.getElementById('feira-item-name').value; const val = parseFloat(document.getElementById('feira-item-val').value); const qtd = parseFloat(document.getElementById('feira-item-qtd').value);
    if(isNaN(val)) return showToast("Preencha o valor unitário!", true);
    const save = () => { if(id) { const idx = db.feiraItems.findIndex(i => i.id == id); db.feiraItems[idx] = { id, name, val, qtd }; } else { db.feiraItems.push({ id: Date.now(), name, val, qtd }); } saveDB(); renderFeira(); window.closeModals(); showToast("Item Salvo!"); };
    if(id) showConfirmModal("Editar Item", "Deseja alterar este item do carrinho?", save); else save();
};
function renderFeira() {
    const list = document.getElementById('feira-list-container'); list.innerHTML = ''; let total = 0;
    if(db.feiraItems.length === 0) list.innerHTML = '<p style="text-align:center; opacity:0.5;">O carrinho está vazio.</p>';
    db.feiraItems.forEach(i => { total += (i.val * i.qtd); list.innerHTML += `<div class="expense-item" style="border-left-color: var(--success);"><div class="expense-info"><strong>${i.name}</strong><small>${i.qtd}x R$ ${i.val.toFixed(2)}</small></div><div class="action-btns"><button onclick="deleteFeiraItem(${i.id})" style="color:var(--danger)">🗑</button></div></div>`; });
    document.getElementById('feira-total-val').innerText = total.toFixed(2);
}
window.deleteFeiraItem = function(id) { showConfirmModal("Remover", "Tirar item do carrinho?", () => { db.feiraItems = db.feiraItems.filter(i => i.id !== id); saveDB(); renderFeira(); }); }; window.clearFeira = function() { showConfirmModal("Limpar Tudo", "Deseja esvaziar o carrinho?", () => { db.feiraItems = []; saveDB(); renderFeira(); }); };

function renderAll() {
    renderCalendar();
    const selY = currentDate.getFullYear(); const selM = currentDate.getMonth();
    const baseMonthEntries = db.entries.filter(e => { const [y, m] = e.date.split('-'); return parseInt(y) === selY && (parseInt(m)-1) === selM && !e.isAlarm; });

    let viewMonthEntries = []; let totalM = 0; let totalE = 0; let debtM = 0; let debtE = 0; let personalTotal = 0;
    const homeMonthEntries = baseMonthEntries.filter(e => e.type === 'home');
    homeMonthEntries.forEach(e => {
        if (e.split === 50) { totalM += (e.val/2); totalE += (e.val/2); }
        else if (e.owner === 'marido') { if (e.split === -100) { totalE += e.val; debtM += (e.val/2); } else { totalM += e.val; if(e.split === 100) debtE += (e.val/2); } }
        else if (e.owner === 'esposa') { if (e.split === -100) { totalM += e.val; debtE += (e.val/2); } else { totalE += e.val; if(e.split === 100) debtM += (e.val/2); } }
    });

    if (currentView === 'home') {
        viewMonthEntries = homeMonthEntries;
        document.getElementById('stat-m').innerText = `R$ ${totalM.toFixed(2)}`; document.getElementById('stat-e').innerText = `R$ ${totalE.toFixed(2)}`;
        document.getElementById('card-esposa').style.display = 'block'; document.getElementById('card-balance').style.display = 'block'; document.getElementById('label-marido').innerText = 'Total Marido';
        const bal = debtE - debtM; const balEl = document.getElementById('stat-balance');
        if(bal > 0) { balEl.innerText = `Esposa deve R$ ${bal.toFixed(2)}`; balEl.style.color = "var(--danger)"; } else if(bal < 0) { balEl.innerText = `Marido deve R$ ${Math.abs(bal).toFixed(2)}`; balEl.style.color = "var(--danger)"; } else { balEl.innerText = "Tudo quitado!"; balEl.style.color = "var(--success)"; }
    } else {
        viewMonthEntries = baseMonthEntries.filter(e => e.type === 'home' || (e.type === 'personal' && e.owner === currentUser));
        viewMonthEntries.filter(e => e.type === 'personal' && e.owner === currentUser).forEach(e => personalTotal += e.val);
        document.getElementById('stat-m').innerText = `R$ ${(personalTotal).toFixed(2)}`; document.getElementById('card-esposa').style.display = 'none';
        document.getElementById('card-balance').style.display = 'none'; document.getElementById('label-marido').innerText = 'Meu Total Pessoal';
    }

    drawChart(viewMonthEntries);

    const dayStr = getIsoDate(selectedDate); const container = document.getElementById('list-container'); container.innerHTML = '<h4>Lançamentos do dia</h4>';
    const viewDayEntries = db.entries.filter(e => { if(e.date !== dayStr) return false; if(currentView === 'home') return e.type === 'home' || e.isAlarm; return e.type === 'home' || (e.type === 'personal' && e.owner === currentUser) || (e.isAlarm && e.owner === currentUser); });

    if(viewDayEntries.length === 0) container.innerHTML += '<p style="text-align:center; opacity:0.5;">Nenhum registro no dia.</p>';
    viewDayEntries.forEach(e => {
        if(e.isAlarm) { container.innerHTML += `<div class="expense-item" style="border-color: var(--info);"><div class="expense-info"><strong>${e.desc}</strong><small>${e.time} • Por: ${e.owner}</small></div><div class="action-btns"><button onclick="deleteEntry(${e.id})" style="color:var(--danger)">🗑</button></div></div>`; } 
        else { const icon = e.type === 'home' ? '🏠' : '👤'; container.innerHTML += `<div class="expense-item" style="${e.type === 'personal' ? 'border-color: var(--info);' : ''}"><div class="expense-info"><strong>${icon} ${e.desc}</strong><small>R$ ${e.val.toFixed(2)} - ${e.category}</small></div><div class="action-btns"><button onclick="editEntry(${e.id})" style="color:var(--info)">✏️</button><button onclick="deleteEntry(${e.id})" style="color:var(--danger)">🗑</button></div></div>`; }
    });
}

function drawChart(data) {
    const canvas = document.getElementById('expense-chart'); const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,160,160); const legend = document.getElementById('chart-legend'); legend.innerHTML = '';
    let cats = {}; let total = 0; data.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.val; total += e.val; });
    if(total === 0) { ctx.beginPath(); ctx.arc(80, 80, 75, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); return; }
    let start = 0; let i = 0;
    for(let c in cats) { let slice = (cats[c]/total) * 2 * Math.PI; ctx.beginPath(); ctx.moveTo(80,80); ctx.arc(80,80,75,start,start+slice); let color = chartColors[i % chartColors.length]; ctx.fillStyle = color; ctx.fill(); let percent = ((cats[c]/total)*100).toFixed(1); legend.innerHTML += `<div style="font-size:0.75rem; background:rgba(0,0,0,0.2); padding:2px 8px; border-radius:10px; display:flex; align-items:center; gap:5px;"><span style="width:8px; height:8px; background:${color}; border-radius:50%; display:inline-block;"></span>${c}: ${percent}%</div>`; start += slice; i++; }
}

setInterval(() => { const now = new Date(); const d = getIsoDate(now); const t = String(now.getHours()).padStart(2,'0') + ":" + String(now.getMinutes()).padStart(2,'0'); db.entries.forEach(e => { if(e.isAlarm && e.date === d && e.time === t && !e.triggered) { sendNotification("⏰ Lembrete!", e.desc); e.triggered = true; saveDB(); } }); }, 60000);
