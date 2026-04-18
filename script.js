// --- IMPORTAÇÃO DOS MÓDULOS DO FIREBASE AUTH E DATABASE V10 ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
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
let currentFamilyId = null; 
let currentUser = null; 
let selectedRoleToLogin = null; 
let currentView = 'home';
let currentDate = new Date(); 
let selectedDate = new Date(); 
const chartColors = ['#d4af37', '#3498db', '#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f', '#1abc9c'];

let db = { categories: [], entries: [], feiraItems: [], notificationsLog: [], cpfs: {}, profiles: {} };

// --- 1. FUNÇÕES GERAIS E UI ---
window.showScreen = function(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
};

window.closeModals = function() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
};

window.closeCategoryModal = function() {
    document.getElementById('modal-category').classList.remove('active');
};

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.style.backgroundColor = isError ? 'var(--danger)' : 'var(--success)';
    t.className = "show";
    setTimeout(() => { t.className = t.className.replace("show", ""); }, 3000);
}

let pendingConfirmAction = null;
window.showConfirmModal = function(title, msg, onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = msg;
    pendingConfirmAction = onConfirm;
    document.getElementById('btn-confirm-action').onclick = () => {
        if(pendingConfirmAction) pendingConfirmAction();
        window.closeModals();
    };
    document.getElementById('modal-confirm').classList.add('active');
};

function getIsoDate(dateObj) { 
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`; 
}

// --- 2. BANCO DE DADOS ---
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
            if (!db.profiles) db.profiles = {};
        } else {
            db = { categories: ['Alimentação', 'Contas da Casa', 'Lazer', 'Viagem', 'Mercado'], entries: [], feiraItems: [], notificationsLog: [], cpfs: {}, profiles: {} };
            saveDB();
        }
        updateCategorySelect(); renderAll();
    });
}

// --- 3. LOGIN GERAL DA FAMÍLIA E PERFIS ---
window.handleRegister = async function() {
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const cpf1 = document.getElementById('reg-cpf-1').value.replace(/\D/g, '');
    const cpf2 = document.getElementById('reg-cpf-2').value.replace(/\D/g, '');

    if(!email || !pass || !cpf1 || !cpf2) return showToast("⚠️ Preencha todos os campos!", true);
    if(pass.length < 6) return showToast("⚠️ A senha precisa ter no mínimo 6 caracteres.", true);

    try {
        showToast("⏳ Criando conta...");
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        currentFamilyId = userCred.user.uid;
        db = { categories: ['Alimentação', 'Contas da Casa', 'Lazer', 'Viagem', 'Mercado'], entries: [], feiraItems: [], notificationsLog: [], cpfs: { titular: cpf1, conjuge: cpf2 }, profiles: {} };
        saveDB();
        showToast("✅ Família cadastrada com sucesso!");
    } catch(error) {
        if(error.code === 'auth/email-already-in-use') showToast("❌ Este e-mail já está em uso!", true);
        else if(error.code === 'auth/invalid-email') showToast("❌ E-mail inválido!", true);
        else showToast("❌ Erro ao registrar.", true);
    }
};

window.attemptLogin = async function() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
    
    if(!email || !pass) return showToast("⚠️ Preencha E-mail e Senha!", true);
    
    try { 
        showToast("⏳ Conectando...");
        await signInWithEmailAndPassword(auth, email, pass); 
        showToast("✅ Login realizado!");
    } catch(error) { 
        console.error(error.code);
        if(error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            showToast("❌ Senha incorreta!", true);
        } else if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
            showToast("❌ E-mail não cadastrado ou inválido!", true);
        } else if (error.code === 'auth/too-many-requests') {
            showToast("❌ Muitas tentativas. Aguarde um momento.", true);
        } else {
            showToast("❌ Erro ao entrar. Verifique os dados.", true);
        }
    }
};

window.handleForgotPassword = async function() {
    const email = document.getElementById('forgot-email').value.trim();
    if(!email) return showToast("⚠️ Digite o e-mail da conta!", true);
    try {
        await sendPasswordResetEmail(auth, email);
        showToast("📧 Link enviado para o e-mail da Família!");
        window.showScreen('login-screen');
    } catch(error) {
        showToast("❌ Erro ao enviar. Verifique o E-mail.", true);
    }
};

window.logoutFamily = function() {
    window.showConfirmModal("Sair da Família", "Deseja deslogar totalmente a família do aplicativo?", async () => {
        await signOut(auth);
    });
};

window.selectProfile = async function(role) {
    selectedRoleToLogin = role;
    if(document.getElementById('profile-pass')) document.getElementById('profile-pass').value = '';
    
    try {
        const snap = await get(ref(dbFirebase, `couples/${currentFamilyId}/profiles/${role}`));
        if (snap.exists() && snap.val().password) {
            document.getElementById('profile-login-title').innerText = `Área Privada - ${role.charAt(0).toUpperCase() + role.slice(1)}`;
            window.showScreen('profile-login-screen');
        } else {
            document.getElementById('profile-setup-title').innerText = `Criar Senha - ${role.charAt(0).toUpperCase() + role.slice(1)}`;
            window.showScreen('profile-setup-screen');
        }
    } catch(e) { showToast("❌ Erro ao conectar no perfil", true); }
};

window.setupProfile = async function() {
    const pass = document.getElementById('setup-profile-pass').value;
    const phrase = document.getElementById('setup-profile-phrase').value.trim();
    if(!pass || !phrase) return showToast("⚠️ Preencha a senha e a frase de segurança!", true);

    await set(ref(dbFirebase, `couples/${currentFamilyId}/profiles/${selectedRoleToLogin}`), { password: pass, phrase: phrase });
    showToast("✅ Senha privada criada!");
    enterProfile(selectedRoleToLogin);
};

window.loginProfile = async function() {
    const pass = document.getElementById('profile-pass').value;
    if(!pass) return showToast("⚠️ Digite a sua senha de perfil!", true);

    try {
        const snap = await get(ref(dbFirebase, `couples/${currentFamilyId}/profiles/${selectedRoleToLogin}`));
        if(snap.exists() && snap.val().password === pass) {
            document.getElementById('profile-pass').value = '';
            enterProfile(selectedRoleToLogin);
        } else { 
            showToast("❌ Senha do perfil incorreta!", true); 
        }
    } catch(e) {
        showToast("❌ Erro de conexão com o banco.", true);
    }
};

window.openProfileRecovery = function() {
    document.getElementById('forgot-profile-phrase').value = '';
    document.getElementById('forgot-profile-new-pass').value = '';
    document.getElementById('forgot-profile-family-pass').value = '';
    window.showScreen('profile-forgot-screen');
};

window.recoverProfile = async function() {
    const role = document.getElementById('forgot-profile-role').value;
    const phrase = document.getElementById('forgot-profile-phrase').value.trim();
    const newPass = document.getElementById('forgot-profile-new-pass').value;

    if(!phrase || !newPass) return showToast("⚠️ Preencha a frase e a nova senha!", true);
    if(newPass.length < 6) return showToast("⚠️ A senha precisa ter no mínimo 6 caracteres.", true);

    const snap = await get(ref(dbFirebase, `couples/${currentFamilyId}/profiles/${role}`));
    if(snap.exists() && snap.val().phrase.toLowerCase() === phrase.toLowerCase()) {
        await set(ref(dbFirebase, `couples/${currentFamilyId}/profiles/${role}/password`), newPass);
        showToast("✅ Senha do perfil alterada com sucesso!");
        window.showScreen('profile-screen');
    } else { showToast("❌ Frase de segurança incorreta!", true); }
};

window.recoverProfileWithFamilyPass = async function() {
    const role = document.getElementById('forgot-profile-role').value;
    const familyPass = document.getElementById('forgot-profile-family-pass').value;
    const newPass = document.getElementById('forgot-profile-new-pass').value;

    if(!familyPass || !newPass) return showToast("⚠️ Preencha a senha da família e a nova senha!", true);
    if(newPass.length < 6) return showToast("⚠️ A nova senha precisa ter no mínimo 6 caracteres.", true);

    try {
        const email = auth.currentUser.email;
        await signInWithEmailAndPassword(auth, email, familyPass); 
        await set(ref(dbFirebase, `couples/${currentFamilyId}/profiles/${role}/password`), newPass);
        showToast("✅ Senha do perfil alterada usando a conta Família!");
        window.showScreen('profile-screen');
    } catch(error) { showToast("❌ Senha da Família incorreta!", true); }
};

function enterProfile(role) {
    currentUser = role;
    localStorage.setItem('activeProfile', role);
    document.getElementById('display-user').innerText = role;
    window.showScreen('main-screen');
    listenToCoupleData();
    if ("Notification" in window) Notification.requestPermission().then(p => { if (p === "granted") checkTodayInstallments(); });
}

window.logoutProfile = function() {
    window.showConfirmModal("Sair do Perfil", "Tem certeza que deseja sair da sua área privada?", () => {
        currentUser = null;
        localStorage.removeItem('activeProfile');
        window.showScreen('profile-screen');
    });
};

// --- 5. LOG E AVISOS ---
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

// --- 6. NAVEGAÇÃO E CRUD ---
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
window.confirmAddCategory = function() { 
    const newCat = document.getElementById('new-cat-name').value.trim(); 
    if (newCat) { 
        db.categories.push(newCat); saveDB(); 
        updateCategorySelect(); 
        setTimeout(() => document.getElementById('exp-cat').value = newCat, 50);
        showToast("Categoria Adicionada!"); 
        window.closeCategoryModal(); 
    } 
};

window.updateSplitOptions = function() {
    const splitSelect = document.getElementById('exp-split');
    if (!splitSelect) return;
    
    if (currentUser === 'marido') {
        splitSelect.innerHTML = `
            <option value="50">Pagamos juntos (50/50)</option>
            <option value="100">Eu paguei tudo (A Esposa me deve a metade)</option>
            <option value="-100">A Esposa pagou tudo (Eu devo a metade a ela)</option>
            <option value="0">Eu assumi tudo (A Esposa não deve nada)</option>
        `;
    } else if (currentUser === 'esposa') {
        splitSelect.innerHTML = `
            <option value="50">Pagamos juntos (50/50)</option>
            <option value="100">Eu paguei tudo (O Marido me deve a metade)</option>
            <option value="-100">O Marido pagou tudo (Eu devo a metade a ele)</option>
            <option value="0">Eu assumi tudo (O Marido não deve nada)</option>
        `;
    }
};

window.openAddModal = function() { 
    document.getElementById('edit-id').value = ''; 
    document.getElementById('form-title').innerText = "Nova Despesa"; 
    document.getElementById('exp-desc').value = ''; 
    document.getElementById('exp-val').value = ''; 
    document.getElementById('exp-date').value = getIsoDate(selectedDate);
    document.getElementById('exp-alarm-date').value = '';
    document.getElementById('exp-alarm-time').value = '';
    
    window.updateSplitOptions();
    
    document.getElementById('parcelas-container').style.display = 'block'; 
    document.getElementById('modal-add').classList.add('active'); 
};

window.handleAddEntry = function() {
    const editId = document.getElementById('edit-id').value; const desc = document.getElementById('exp-desc').value;
    const valTotal = parseFloat(document.getElementById('exp-val').value); const cat = document.getElementById('exp-cat').value;
    const date = document.getElementById('exp-date').value; const split = parseInt(document.getElementById('exp-split').value); const parcels = parseInt(document.getElementById('exp-installments').value);
    
    const alarmDate = document.getElementById('exp-alarm-date').value;
    const alarmTime = document.getElementById('exp-alarm-time').value;

    if (!desc || isNaN(valTotal) || !date) return showToast("⚠️ Preencha os campos obrigatórios!", true);

    const saveAction = () => {
        if (editId) {
            const idx = db.entries.findIndex(e => e.id == editId);
            if(idx > -1) { 
                db.entries[idx].desc = desc; db.entries[idx].val = valTotal; 
                db.entries[idx].category = cat; db.entries[idx].date = date; db.entries[idx].split = split; 
            }
            if(db.entries[idx].type === 'home') logNotification(`✏️ ${currentUser.toUpperCase()} alterou a despesa "${desc}".`);
        } else {
            const valParcela = valTotal / parcels; let [y, m, d] = date.split('-').map(Number);
            for(let i = 0; i < parcels; i++) {
                let newDate = new Date(y, m - 1 + i, d); let finalDesc = parcels > 1 ? `${desc} (${i+1}/${parcels})` : desc;
                const baseId = Date.now() + i;
                
                db.entries.push({ 
                    id: baseId, desc: finalDesc, val: valParcela, category: cat, 
                    date: getIsoDate(newDate), split: split, owner: currentUser, type: currentView,
                    status: currentView === 'home' ? 'pending' : 'approved' 
                });

                if (alarmDate && alarmTime && i === 0) {
                    db.entries.push({ id: baseId + 1000, isAlarm: true, desc: "⏰ Pagar: " + finalDesc, date: alarmDate, time: alarmTime, owner: currentUser, type: currentView });
                }
            }
            if (currentView === 'home') { const msg = `🏠 ${currentUser.toUpperCase()} lançou: ${desc} (Aguardando Aprovação)`; sendNotification("Despesa Pendente", msg); logNotification(msg); }
        }
        saveDB(); showToast("✅ Salvo com sucesso!"); window.closeModals();
    };
    if (editId) window.showConfirmModal("Confirmar Alteração", "Deseja salvar as mudanças neste registro?", saveAction); else saveAction();
};

window.approveEntry = function(id) {
    const idx = db.entries.findIndex(e => e.id === id);
    if(idx > -1) {
        db.entries[idx].status = 'approved';
        logNotification(`✅ ${currentUser.toUpperCase()} aprovou a despesa "${db.entries[idx].desc}".`);
        saveDB(); renderAll(); showToast("✅ Despesa aprovada!");
    }
};

window.rejectEntry = function(id) {
    const idx = db.entries.findIndex(e => e.id === id);
    if(idx > -1) {
        db.entries[idx].type = 'personal'; 
        db.entries[idx].status = 'approved'; 
        logNotification(`❌ ${currentUser.toUpperCase()} recusou a despesa "${db.entries[idx].desc}". Ela foi para o painel Pessoal do criador.`);
        saveDB(); renderAll(); showToast("❌ Despesa negada!");
    }
};

window.editEntry = function(id) { 
    const e = db.entries.find(x => x.id === id); 
    document.getElementById('edit-id').value = e.id; 
    document.getElementById('form-title').innerText = "Editar Registro"; 
    document.getElementById('exp-desc').value = e.desc; 
    document.getElementById('exp-val').value = e.val; 
    document.getElementById('exp-cat').value = e.category; 
    document.getElementById('exp-date').value = e.date; 
    
    window.updateSplitOptions(); 
    document.getElementById('exp-split').value = e.split; 
    
    document.getElementById('parcelas-container').style.display = 'none'; 
    document.getElementById('modal-add').classList.add('active'); 
};

window.deleteEntry = function(id) { window.showConfirmModal("Excluir", "Tem certeza que deseja apagar este registro?", () => { const e = db.entries.find(x => x.id === id); if(e && e.type === 'home') logNotification(`🗑 ${currentUser.toUpperCase()} apagou a despesa "${e.desc}".`); db.entries = db.entries.filter(x => x.id !== id); saveDB(); showToast("🗑 Removido!"); }); };

window.openAlarmModal = function() { document.getElementById('modal-alarm').classList.add('active'); };
window.handleSaveAlarm = function() { const desc = document.getElementById('alarm-desc').value; const date = document.getElementById('alarm-date').value; const time = document.getElementById('alarm-time').value; if(!desc || !date || !time) return showToast("⚠️ Preencha todos os campos do alarme!", true); db.entries.push({ id: Date.now(), isAlarm: true, desc: "⏰ " + desc, date, time, owner: currentUser, type: currentView }); saveDB(); window.closeModals(); showToast("⏰ Alarme Agendado!"); };

window.showFeiraScreen = function() { window.showScreen('feira-screen'); renderFeira(); }; window.closeFeiraScreen = function() { window.showScreen('main-screen'); };
window.openFeiraItemModal = function() { document.getElementById('feira-edit-id').value = ''; document.getElementById('feira-item-name').value = ''; document.getElementById('feira-item-val').value = ''; document.getElementById('modal-feira-item').classList.add('active'); };
window.handleSaveFeiraItem = function() {
    const id = document.getElementById('feira-edit-id').value; const name = document.getElementById('feira-item-name').value; const val = parseFloat(document.getElementById('feira-item-val').value); const qtd = parseFloat(document.getElementById('feira-item-qtd').value);
    if(isNaN(val)) return showToast("⚠️ Preencha o valor unitário!", true);
    const save = () => { if(id) { const idx = db.feiraItems.findIndex(i => i.id == id); db.feiraItems[idx] = { id, name, val, qtd }; } else { db.feiraItems.push({ id: Date.now(), name, val, qtd }); } saveDB(); renderFeira(); window.closeModals(); showToast("✅ Item Salvo!"); };
    if(id) window.showConfirmModal("Editar Item", "Deseja alterar este item do carrinho?", save); else save();
};
function renderFeira() {
    const list = document.getElementById('feira-list-container'); list.innerHTML = ''; let total = 0;
    if(db.feiraItems.length === 0) list.innerHTML = '<p style="text-align:center; opacity:0.5;">O carrinho está vazio.</p>';
    db.feiraItems.forEach(i => { total += (i.val * i.qtd); list.innerHTML += `<div class="expense-item" style="border-left-color: var(--success);"><div class="expense-info"><strong>${i.name}</strong><small>${i.qtd}x R$ ${i.val.toFixed(2)}</small></div><div class="action-btns"><button onclick="deleteFeiraItem(${i.id})" style="color:var(--danger)">🗑</button></div></div>`; });
    document.getElementById('feira-total-val').innerText = total.toFixed(2);
}
window.deleteFeiraItem = function(id) { window.showConfirmModal("Remover", "Tirar item do carrinho?", () => { db.feiraItems = db.feiraItems.filter(i => i.id !== id); saveDB(); renderFeira(); }); }; window.clearFeira = function() { window.showConfirmModal("Limpar Tudo", "Deseja esvaziar o carrinho?", () => { db.feiraItems = []; saveDB(); renderFeira(); }); };

function renderAll() {
    renderCalendar();
    const selY = currentDate.getFullYear(); const selM = currentDate.getMonth();
    const baseMonthEntries = db.entries.filter(e => { const [y, m] = e.date.split('-'); return parseInt(y) === selY && (parseInt(m)-1) === selM && !e.isAlarm; });

    let viewMonthEntries = []; let totalM = 0; let totalE = 0; let debtM = 0; let debtE = 0; let personalTotal = 0;
    const homeMonthEntries = baseMonthEntries.filter(e => e.type === 'home' && e.status !== 'pending');
    
    homeMonthEntries.forEach(e => {
        if (e.split === 50) { totalM += (e.val/2); totalE += (e.val/2); }
        else if (e.owner === 'marido') { if (e.split === -100) { totalE += e.val; debtM += (e.val/2); } else { totalM += e.val; if(e.split === 100) debtE += (e.val/2); } }
        else if (e.owner === 'esposa') { if (e.split === -100) { totalM += e.val; debtE += (e.val/2); } else { totalE += e.val; if(e.split === 100) debtM += (e.val/2); } }
    });

    if (currentView === 'home') {
        viewMonthEntries = homeMonthEntries; 
        document.getElementById('stat-m').innerText = `R$ ${totalM.toFixed(2)}`; document.getElementById('stat-e').innerText = `R$ ${totalE.toFixed(2)}`;
        document.getElementById('card-esposa').style.display = 'block'; document.getElementById('card-balance').style.display = 'block'; document.getElementById('label-marido').innerText = 'Total Marido';
        
        const bal = debtE - debtM; 
        const balEl = document.getElementById('stat-balance');
        
        if (bal > 0) { 
            if (currentUser === 'esposa') { balEl.innerText = `Você deve R$ ${bal.toFixed(2)} ao Marido`; balEl.style.color = "var(--danger)"; } 
            else { balEl.innerText = `A Esposa lhe deve R$ ${bal.toFixed(2)}`; balEl.style.color = "var(--success)"; }
        } else if (bal < 0) { 
            if (currentUser === 'marido') { balEl.innerText = `Você deve R$ ${Math.abs(bal).toFixed(2)} à Esposa`; balEl.style.color = "var(--danger)"; } 
            else { balEl.innerText = `O Marido lhe deve R$ ${Math.abs(bal).toFixed(2)}`; balEl.style.color = "var(--success)"; }
        } else { balEl.innerText = "Tudo quitado!"; balEl.style.color = "var(--success)"; }

    } else {
        viewMonthEntries = baseMonthEntries.filter(e => (e.type === 'home' && e.status !== 'pending') || (e.type === 'personal' && e.owner === currentUser));
        viewMonthEntries.filter(e => e.type === 'personal' && e.owner === currentUser).forEach(e => personalTotal += e.val);
        document.getElementById('stat-m').innerText = `R$ ${(personalTotal).toFixed(2)}`; document.getElementById('card-esposa').style.display = 'none';
        document.getElementById('card-balance').style.display = 'none'; document.getElementById('label-marido').innerText = 'Meu Total Pessoal';
    }

    drawChart(viewMonthEntries);

    const dayStr = getIsoDate(selectedDate); const container = document.getElementById('list-container'); container.innerHTML = '<h4>Lançamentos do dia</h4>';
    const viewDayEntries = db.entries.filter(e => { if(e.date !== dayStr) return false; if(currentView === 'home') return e.type === 'home' || e.isAlarm; return e.type === 'home' || (e.type === 'personal' && e.owner === currentUser) || (e.isAlarm && e.owner === currentUser); });

    if(viewDayEntries.length === 0) container.innerHTML += '<p style="text-align:center; opacity:0.5;">Nenhum registro no dia.</p>';
    viewDayEntries.forEach(e => {
        if(e.isAlarm) { 
            container.innerHTML += `<div class="expense-item" style="border-color: var(--info);"><div class="expense-info"><strong>${e.desc}</strong><small>${e.time} • Por: ${e.owner}</small></div><div class="action-btns"><button onclick="deleteEntry(${e.id})" style="color:var(--danger)">🗑</button></div></div>`; 
        } 
        else { 
            const icon = e.type === 'home' ? '🏠' : '👤'; 
            let statusTag = ''; let actionHtml = '';

            if (e.type === 'home' && e.status === 'pending') {
                statusTag = `<span style="font-size: 0.65rem; background: var(--danger); padding: 2px 6px; border-radius: 8px; margin-left: 5px;">Aguardando Aval</span>`;
                if (e.owner !== currentUser) { actionHtml = `<button onclick="approveEntry(${e.id})" style="color:var(--success)">✅</button><button onclick="rejectEntry(${e.id})" style="color:var(--danger)">❌</button>`; } 
                else { actionHtml = `<button onclick="deleteEntry(${e.id})" style="color:var(--danger)">🗑</button>`; }
            } else {
                actionHtml = `<button onclick="editEntry(${e.id})" style="color:var(--info)">✏️</button><button onclick="deleteEntry(${e.id})" style="color:var(--danger)">🗑</button>`;
            }
            container.innerHTML += `<div class="expense-item" style="${e.type === 'personal' ? 'border-color: var(--info);' : ''}"><div class="expense-info"><strong>${icon} ${e.desc}</strong><small>R$ ${e.val.toFixed(2)} - ${e.category} ${statusTag}</small></div><div class="action-btns">${actionHtml}</div></div>`; 
        }
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

// --- 7. OBSERVADOR DE AUTENTICAÇÃO (Sempre por último) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentFamilyId = user.uid;
        const savedProfile = localStorage.getItem('activeProfile');
        if (savedProfile) {
            window.selectProfile(savedProfile);
        } else {
            window.showScreen('profile-screen');
        }
    } else {
        currentFamilyId = null;
        currentUser = null;
        localStorage.removeItem('activeProfile');
        window.showScreen('login-screen');
    }
});

// PWA: Instalação
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {})); }
let deferredPrompt; window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const btn = document.getElementById('btn-install'); if(btn) btn.style.display = 'inline-block'; });
window.installApp = function() { if(deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(() => { deferredPrompt = null; document.getElementById('btn-install').style.display = 'none'; }); } };
