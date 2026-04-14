const SUPABASE_URL = '[https://lqfwpfaqcnfsybxchmtg.supabase.co](https://lqfwpfaqcnfsybxchmtg.supabase.co)';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZndwZmFxY25mc3lieGNobXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODk5MjIsImV4cCI6MjA5MDI2NTkyMn0.XMO-YQIzULWK2yMFoqdBVP-wYPA7P84sp4QnsuS0hks';

// Mantemos o cliente oficial APENAS para os uploads de ficheiros (Storage).
let supabaseClient = null;
if (typeof supabase !== 'undefined') {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// ESTA FUNÇÃO É A BALA DE PRATA PARA O IPHONE:
// O Safari cacheia os dados nativamente e recusa-se a ir à net. O `_t=${Date.now()}`
// adiciona os milissegundos atuais à URL, obrigando o iPhone a ler do Supabase novo!
async function apiFetch(table, query, method = 'GET', body = null) {
  const cacheBuster = query ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?select=' + query : ''}${method === 'GET' ? cacheBuster : ''}`;
  
  const options = {
    method: method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : '' 
    }
  };
  
  if (body) options.body = JSON.stringify(body);

  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.status === 204) return true;
    return await response.json();
  } catch (err) {
    alert("O iPhone bloqueou a conexão: " + err.message);
    throw err;
  }
}

const app = {
  role: null,
  activeChildId: null,
  currentStudentProfileId: null,
  isEditingRoutine: false,
  selectedFile: null, 
  
  data: { students: [], routine: {} },

  async init() {
    if(typeof lucide !== 'undefined') lucide.createIcons();
    const elDate = document.getElementById('attendance-date');
    if (elDate) elDate.value = new Date().toISOString().split('T')[0];
    
    const grid = document.getElementById('students-grid');
    if (grid) {
      grid.innerHTML = `<div class="col-span-full p-8 text-center text-blue-500 font-medium">A ligar à base de dados...</div>`;
    }

    try {
      await this.fetchRoutine();
      await this.fetchStudents();
    } catch(err) {
      if (grid) grid.innerHTML = `<div class="col-span-full p-8 text-center text-red-500">Erro na internet. Atualize.</div>`;
    }
    this.login('teacher'); 
  },

  async fetchStudents() {
    try {
      const query = 'id,nome_aluno,idade,nome_mae,nome_pai,contato_1,responsavel_1,responsavel_2,responsavel_3,indicacoes,foto_url,chamadas(data_chamada,status),conquistas(id,descricao,tipo_medalha,created_at),atividades(data_atividade,descricao)';
      const data = await apiFetch('alunos', query);

      if (data && data.length > 0) {
        this.data.students = data.map(dbStudent => {
          const dataHojeTexto = new Date().toISOString().split('T')[0];
          
          let achievements = [];
          if(dbStudent.conquistas) {
             achievements = dbStudent.conquistas.map(c => ({
              id: c.id, descricao: c.descricao, tipo: c.tipo_medalha || 'Conquista',
              date: c.created_at ? String(c.created_at).substring(0, 10) : dataHojeTexto
            }));
            achievements.sort((a, b) => String(b.date).localeCompare(String(a.date)));
          }
          
          let activities = [];
          if(dbStudent.atividades) {
             activities = dbStudent.atividades.map(a => ({ 
               date: a.data_atividade ? String(a.data_atividade).substring(0, 10) : dataHojeTexto, 
               description: a.descricao 
             }));
             activities.sort((a, b) => String(b.date).localeCompare(String(a.date)));
          }

          const attendance = {};
          if (dbStudent.chamadas) dbStudent.chamadas.forEach(c => attendance[c.data_chamada] = c.status);

          return {
            id: dbStudent.id, name: dbStudent.nome_aluno, age: dbStudent.idade,
            nome_mae: dbStudent.nome_mae, nome_pai: dbStudent.nome_pai, contato_1: dbStudent.contato_1,
            responsavel_1: dbStudent.responsavel_1, responsavel_2: dbStudent.responsavel_2, responsavel_3: dbStudent.responsavel_3,
            indicacoes: dbStudent.indicacoes,
            photo: dbStudent.foto_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${dbStudent.nome_aluno}&backgroundColor=b6e3f4`,
            info: `Filho(a) de ${dbStudent.nome_mae || 'Não informado.'}`,
            achievements, activities, attendance    
          };
        });
      } else {
        this.data.students = [];
      }

      if (this.role === 'teacher' && document.getElementById('tab-students') && !document.getElementById('tab-students').classList.contains('hidden-view')) {
        this.renderStudentsList();
      }
    } catch (error) {}
  },

  async fetchRoutine() {
    try {
      const data = await apiFetch('rotina_semanal', '*');
      if (data && data.length > 0) {
        const rotinaAtualizada = {};
        ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'].forEach(dia => {
          const item = data.find(d => d.dia_semana === dia);
          rotinaAtualizada[dia] = item ? item.descricao : '';
        });
        this.data.routine = rotinaAtualizada;
      }
    } catch(err) {}
  },

  handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.selectedFile = file; 
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById('new-student-photo-preview');
      const icon = document.getElementById('new-student-photo-icon');
      if (preview && icon) {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        icon.classList.add('hidden');
      }
    };
    reader.readAsDataURL(file);
  },

  async saveNewStudent() {
    const nomeInput = document.getElementById('input-new-nome').value;
    const idadeInput = document.getElementById('input-new-idade').value;
    const btnSave = document.getElementById('btn-save-student');

    if (!nomeInput || !idadeInput) { alert("Por favor, preencha o Nome e a Idade."); return; }
    btnSave.innerHTML = "A processar...";
    btnSave.disabled = true;

    try {
      let fotoUrlFinal = null;
      if (this.selectedFile && supabaseClient) {
        btnSave.innerHTML = "A carregar foto...";
        let fileExt = 'jpeg';
        if (this.selectedFile.name && this.selectedFile.name.includes('.')) fileExt = this.selectedFile.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, this.selectedFile, { upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        const { data: publicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
        fotoUrlFinal = publicUrlData.publicUrl + "?t=" + Date.now();
      }

      btnSave.innerHTML = "A guardar aluno...";
      const novoAlunoInfo = { 
        nome_aluno: nomeInput, idade: parseInt(idadeInput), 
        nome_mae: document.getElementById('input-new-mae').value || null,
        nome_pai: document.getElementById('input-new-pai').value || null,
        contato_1: document.getElementById('input-new-contato1').value || null,
        contato_2: document.getElementById('input-new-contato2').value || null,
        endereco: document.getElementById('input-new-endereco').value || null,
        responsavel_1: document.getElementById('input-new-resp1').value || null,
        responsavel_2: document.getElementById('input-new-resp2').value || null,
        responsavel_3: document.getElementById('input-new-resp3').value || null,
        indicacoes: document.getElementById('input-new-indicacoes').value || null,
        foto_url: fotoUrlFinal 
      };

      await apiFetch('alunos', '', 'POST', novoAlunoInfo);

      ['nome', 'idade', 'mae', 'pai', 'contato1', 'contato2', 'endereco', 'resp1', 'resp2', 'resp3', 'indicacoes'].forEach(id => { if(document.getElementById('input-new-'+id)) document.getElementById('input-new-'+id).value = ''; });
      this.closeAddStudentModal();
      await this.fetchStudents();

    } catch (error) {
      alert("Falha ao gravar aluno.");
    } finally {
      if(btnSave) { btnSave.innerHTML = "Guardar Aluno"; btnSave.disabled = false; }
    }
  },

  async toggleRoutineEdit() {
    const btnEdit = document.getElementById('btn-edit-routine');
    if (this.isEditingRoutine) {
      btnEdit.innerHTML = "A guardar...";
      btnEdit.disabled = true;
      const atualizacoes = [];
      for (const day of Object.keys(this.data.routine)) {
        const text = document.getElementById(`input-routine-${day}`).value;
        this.data.routine[day] = text;
        atualizacoes.push({ dia_semana: day, descricao: text });
      }
      try {
        for (const item of atualizacoes) {
          await fetch(`${SUPABASE_URL}/rest/v1/rotina_semanal?dia_semana=eq.${item.dia_semana}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } });
          await apiFetch('rotina_semanal', '', 'POST', item);
        }
      } catch(err) {}
      this.isEditingRoutine = false;
      btnEdit.disabled = false;
      this.renderRoutine();
    } else {
      this.isEditingRoutine = true;
      this.renderRoutine();
    }
  },

  async setAttendance(studentId, date, status) {
    const student = this.data.students.find(s => String(s.id) === String(studentId));
    if(student) { student.attendance[date] = status; this.renderAttendanceList(); }
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/chamadas?aluno_id=eq.${studentId}&data_chamada=eq.${date}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } });
      await apiFetch('chamadas', '', 'POST', { aluno_id: studentId, data_chamada: date, status: status });
    } catch(err) {}
  },

  async addAchievement(tipo) {
    const input = document.getElementById('input-achievement-desc');
    const descText = input ? input.value.trim() : '';
    const textoFinal = descText || `Recebeu a medalha: ${tipo}`;
    if(input) input.disabled = true;
    try {
      const dados = await apiFetch('conquistas', '', 'POST', { aluno_id: this.currentStudentProfileId, descricao: textoFinal, tipo_medalha: tipo });
      const dbId = dados && dados[0] ? dados[0].id : Date.now();
      const s = this.data.students.find(s => String(s.id) === String(this.currentStudentProfileId));
      s.achievements.unshift({ id: dbId, descricao: textoFinal, tipo: tipo, date: new Date().toISOString().split('T')[0] });
      this.renderProfileLists();
      const list = document.getElementById('profile-achievements');
      const icon = document.getElementById('icon-medal-history');
      if(list && icon) { list.classList.remove('hidden'); icon.style.transform = 'rotate(180deg)'; }
    } catch(err) {} 
    finally { if(input) { input.value = ''; input.disabled = false; } }
  },

  async removeAchievement(achievementId) {
    if (!confirm("Tem a certeza que deseja remover esta medalha? O histórico será apagado.")) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/conquistas?id=eq.${achievementId}`, { method: 'DELETE', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } });
      const s = this.data.students.find(s => String(s.id) === String(this.currentStudentProfileId));
      s.achievements = s.achievements.filter(a => String(a.id) !== String(achievementId));
      this.renderProfileLists();
    } catch (err) {}
  },

  toggleMedalHistory() {
    const list = document.getElementById('profile-achievements');
    const icon = document.getElementById('icon-medal-history');
    if(list && icon) {
      list.classList.toggle('hidden');
      icon.style.transform = list.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    }
  },

  async addActivity() {
    const input = document.getElementById('input-activity');
    if(!input.value.trim()) return;
    const textoAtividade = input.value;
    const dataHoje = new Date().toISOString().split('T')[0];
    input.disabled = true;
    try {
      await apiFetch('atividades', '', 'POST', { aluno_id: this.currentStudentProfileId, data_atividade: dataHoje, descricao: textoAtividade });
      const s = this.data.students.find(s => String(s.id) === String(this.currentStudentProfileId));
      s.activities.unshift({ date: dataHoje, description: textoAtividade });
      this.renderProfileLists();
    } catch(err) {} 
    finally { input.value = ''; input.disabled = false; }
  },

  openAddStudentModal() {
    const modal = document.getElementById('modal-add-student');
    if(modal) modal.classList.remove('hidden-view');
  },

  closeAddStudentModal() {
    const modal = document.getElementById('modal-add-student');
    if(modal) modal.classList.add('hidden-view');
    this.selectedFile = null;
    const preview = document.getElementById('new-student-photo-preview');
    const icon = document.getElementById('new-student-photo-icon');
    if (preview && icon) { preview.src = ''; preview.classList.add('hidden'); icon.classList.remove('hidden'); }
  },

  openMobileMenu() {
    const overlay = document.getElementById('mobile-menu-overlay');
    const sidebar = document.getElementById('mobile-sidebar');
    if(!overlay || !sidebar) return; 
    overlay.classList.remove('hidden-view');
    requestAnimationFrame(() => { overlay.classList.remove('opacity-0'); sidebar.classList.remove('-translate-x-full'); });
  },

  closeMobileMenu() {
    const overlay = document.getElementById('mobile-menu-overlay');
    const sidebar = document.getElementById('mobile-sidebar');
    if(!overlay || !sidebar) return; 
    overlay.classList.add('opacity-0');
    sidebar.classList.add('-translate-x-full');
    setTimeout(() => { overlay.classList.add('hidden-view'); }, 300);
  },

  login(role, childId = null) {
    this.role = role;
    this.activeChildId = childId;
    const viewLogin = document.getElementById('view-login');
    if (viewLogin) viewLogin.classList.add('hidden-view');
    if (role === 'teacher') {
      const viewTeacher = document.getElementById('view-teacher');
      if (viewTeacher) viewTeacher.classList.remove('hidden-view');
      this.switchTeacherTab('students');
    } else {
      const viewParent = document.getElementById('view-parent');
      if (viewParent) viewParent.classList.remove('hidden-view');
      this.renderParentView();
    }
  },

  logout() {
    this.role = null;
    this.activeChildId = null;
    const viewTeacher = document.getElementById('view-teacher');
    const viewParent = document.getElementById('view-parent');
    const viewLogin = document.getElementById('view-login');
    if (viewTeacher) viewTeacher.classList.add('hidden-view');
    if (viewParent) viewParent.classList.add('hidden-view');
    if (viewLogin) viewLogin.classList.remove('hidden-view');
    if(document.getElementById('mobile-menu-overlay')) this.closeMobileMenu();
  },

  switchTeacherTab(tabId) {
    ['tab-students', 'tab-routine'].forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden-view'); });
    ['tab-btn-students', 'tab-btn-routine'].forEach(id => { const el = document.getElementById(id); if(el) el.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors text-slate-600 hover:bg-slate-50"; });
    const btnActive = document.getElementById(`tab-btn-${tabId}`);
    if(btnActive) btnActive.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors bg-blue-50 text-blue-700";
    
    ['mob-side-tab-students', 'mob-side-tab-routine'].forEach(id => { const el = document.getElementById(id); if(el) el.className = "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-colors text-slate-600 hover:bg-slate-50"; });
    const targetSideTab = document.getElementById(`mob-side-tab-${tabId}`);
    if(targetSideTab) targetSideTab.className = "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-colors bg-blue-50 text-blue-700";
    
    const titleEl = document.getElementById('mobile-header-title');
    const headerAddBtn = document.getElementById('mobile-header-add-btn');
    if(titleEl) titleEl.innerText = tabId === 'students' ? 'A Minha Turma' : 'Rotina Semanal';
    if(headerAddBtn) {
      if (tabId === 'students') headerAddBtn.classList.remove('hidden');
      else headerAddBtn.classList.add('hidden');
    }
    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) activeTab.classList.remove('hidden-view');
    if (tabId === 'students') this.renderStudentsList();
    if (tabId === 'routine') this.renderRoutine();
  },

  renderStudentsList() {
    const grid = document.getElementById('students-grid');
    if(!grid) return;
    const dateInput = document.getElementById('attendance-date');
    const dateToday = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
    let presentes = 0, faltas = 0, conquistasTotal = 0;
    this.data.students.forEach(s => {
      if (s.attendance[dateToday] === 'presente') presentes++;
      if (s.attendance[dateToday] === 'ausente') faltas++;
      conquistasTotal += s.achievements.length;
    });
    if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = this.data.students.length;
    if(document.getElementById('stat-presentes')) document.getElementById('stat-presentes').innerText = presentes;
    if(document.getElementById('stat-faltas')) document.getElementById('stat-faltas').innerText = faltas;
    if(document.getElementById('stat-conquistas')) document.getElementById('stat-conquistas').innerText = conquistasTotal;

    if (this.data.students.length === 0) {
      grid.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">Nenhum aluno cadastrado ainda.</div>`;
      return;
    }

    grid.innerHTML = this.data.students.map(s => `
      <div onclick="app.openProfileModal('${s.id}')" class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 active:bg-slate-50 touch-manipulation cursor-pointer">
        <div class="flex items-center gap-4">
          <img src="${s.photo}" alt="${s.name}" class="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 object-cover">
          <div><h3 class="font-bold text-lg text-slate-800 leading-tight">${s.name}</h3><p class="text-sm text-slate-500">${s.age} anos</p></div>
        </div>
      </div>
    `).join('');
  },

  renderRoutine() {
    const container = document.getElementById('routine-list');
    const btnEdit = document.getElementById('btn-edit-routine');
    if(btnEdit) {
      btnEdit.innerHTML = this.isEditingRoutine ? `<i data-lucide="save" class="w-5 h-5"></i> Guardar` : 'Editar Rotina';
      btnEdit.className = this.isEditingRoutine ? "flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl touch-manipulation font-medium" : "flex items-center gap-2 bg-slate-200 text-slate-700 px-4 py-2 rounded-xl touch-manipulation font-medium";
    }
    let html = '';
    for (const [day, text] of Object.entries(this.data.routine)) {
      html += `
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center gap-3">
          <div class="w-28 font-bold text-blue-600 flex items-center gap-2 text-sm md:text-base"><i data-lucide="clock" class="w-4 h-4"></i> ${day}</div>
          ${this.isEditingRoutine ? `<textarea id="input-routine-${day}" class="flex-1 border border-slate-300 rounded-xl p-3 text-sm focus:border-blue-500 outline-none w-full bg-slate-50" rows="2">${text}</textarea>` : `<div class="flex-1 text-slate-700 text-sm leading-relaxed">${text}</div>`}
        </div>
      `;
    }
    if(container) container.innerHTML = html;
    if(typeof lucide !== 'undefined') lucide.createIcons();
  },

  openAttendanceModal() {
    const modal = document.getElementById('modal-attendance');
    if(modal) modal.classList.remove('hidden-view');
    this.renderAttendanceList();
  },
  
  closeAttendanceModal() {
    const modal = document.getElementById('modal-attendance');
    if(modal) modal.classList.add('hidden-view');
  },

  renderAttendanceList() {
    const dateInput = document.getElementById('attendance-date');
    const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
    const list = document.getElementById('attendance-list');
    if(!list) return;
    if (this.data.students.length === 0) { list.innerHTML = `<div class="text-center text-slate-400 mt-10">Adicione alunos primeiro.</div>`; return; }

    list.innerHTML = this.data.students.map(s => {
      const status = s.attendance[date] || null;
      return `
        <div class="bg-white rounded-2xl p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm border border-slate-200 gap-3">
          <div class="flex items-center gap-3">
            <img src="${s.photo}" class="w-10 h-10 md:w-12 md:h-12 rounded-full border border-slate-200 object-cover">
            <span class="font-bold text-base md:text-lg text-slate-800">${s.name}</span>
          </div>
          <div class="flex gap-2 w-full sm:w-auto">
            <button onclick="app.setAttendance('${s.id}', '${date}', 'presente')" class="flex-1 sm:flex-none px-3 py-3 md:py-2 rounded-xl font-medium flex items-center justify-center gap-2 transition-all touch-manipulation text-sm ${status === 'presente' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}">
              <i data-lucide="check-circle" class="w-4 h-4"></i> Presença
            </button>
            <button onclick="app.setAttendance('${s.id}', '${date}', 'ausente')" class="flex-1 sm:flex-none px-3 py-3 md:py-2 rounded-xl font-medium flex items-center justify-center gap-2 transition-all touch-manipulation text-sm ${status === 'ausente' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'}">
              <i data-lucide="x-circle" class="w-4 h-4"></i> Falta
            </button>
          </div>
        </div>
      `;
    }).join('');
    if(typeof lucide !== 'undefined') lucide.createIcons();
  },

  openProfileModal(studentId) {
    this.currentStudentProfileId = studentId;
    const s = this.data.students.find(s => String(s.id) === String(studentId));
    
    const profileHeader = document.getElementById('profile-header');
    if(profileHeader) {
      profileHeader.innerHTML = `
        <button onclick="app.closeProfileModal()" class="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors touch-manipulation"><i data-lucide="arrow-left" class="w-6 h-6"></i></button>
        <h2 class="text-xl font-bold text-slate-800">Perfil do Aluno</h2>
      `;
    }

    const headerInfo = document.getElementById('profile-header-info');
    if(headerInfo) {
      headerInfo.innerHTML = `
        <div class="relative mb-3 group cursor-pointer" onclick="document.getElementById('input-update-foto').click()">
          <input type="file" id="input-update-foto" accept="image/*" class="hidden" onchange="app.updateProfilePhoto(event)">
          <div class="w-24 h-24 bg-blue-100 rounded-full border-4 border-white shadow-md flex items-center justify-center text-blue-500 overflow-hidden relative">
            <img id="profile-current-photo" src="${s.photo}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="camera" class="text-white w-8 h-8"></i></div>
            <div id="profile-photo-loading" class="absolute inset-0 bg-white/80 flex flex-col items-center justify-center hidden"><i data-lucide="loader-2" class="text-blue-500 w-6 h-6 animate-spin"></i></div>
          </div>
          <div class="absolute bottom-0 right-0 bg-blue-600 rounded-full p-1.5 border-2 border-white text-white shadow-sm"><i data-lucide="pencil" class="w-3 h-3"></i></div>
        </div>
        <h2 class="text-2xl font-bold leading-tight text-slate-800">${s.name}</h2>
        <p class="text-slate-500 text-sm mt-1">${s.age} anos</p>
      `;
    }
    
    if(document.getElementById('profile-mae')) document.getElementById('profile-mae').innerText = s.nome_mae || '-';
    if(document.getElementById('profile-pai')) document.getElementById('profile-pai').innerText = s.nome_pai || '-';
    if(document.getElementById('profile-responsaveis')) document.getElementById('profile-responsaveis').innerText = [s.responsavel_1, s.responsavel_2, s.responsavel_3].filter(Boolean).join(', ') || 'Nenhum responsável extra cadastrado';
    
    const indicacoesEl = document.getElementById('profile-indicacoes');
    const indicacoesContainer = document.getElementById('profile-indicacoes-container');
    if (indicacoesEl && indicacoesContainer) {
      if (s.indicacoes) { indicacoesEl.innerText = s.indicacoes; indicacoesContainer.classList.remove('hidden'); }
      else indicacoesContainer.classList.add('hidden');
    }

    const btnWhats = document.getElementById('profile-whatsapp');
    if(btnWhats) {
      if (s.contato_1) {
        btnWhats.href = `https://wa.me/${s.contato_1.replace(/\D/g, '')}`;
        btnWhats.classList.remove('hidden'); btnWhats.classList.add('flex');
      } else {
        btnWhats.classList.add('hidden'); btnWhats.classList.remove('flex');
      }
    }

    this.renderProfileLists();
    const modal = document.getElementById('modal-profile');
    if(modal) modal.classList.remove('hidden-view');
    if(typeof lucide !== 'undefined') lucide.createIcons();
  },

  closeProfileModal() {
    const modal = document.getElementById('modal-profile');
    if(modal) modal.classList.add('hidden-view');
    const list = document.getElementById('profile-achievements');
    const icon = document.getElementById('icon-medal-history');
    if(list && icon) { list.classList.add('hidden'); icon.style.transform = 'rotate(0deg)'; }
    this.currentStudentProfileId = null;
  },

  async updateProfilePhoto(event) {
    const file = event.target.files[0];
    if (!file || !this.currentStudentProfileId || !supabaseClient) return;

    const loadingOverlay = document.getElementById('profile-photo-loading');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    try {
      const reader = new FileReader();
      reader.onload = function(e) {
        const imgPreview = document.getElementById('profile-current-photo');
        if (imgPreview) imgPreview.src = e.target.result;
      };
      reader.readAsDataURL(file);

      let fileExt = 'jpeg';
      if (file.name && file.name.includes('.')) fileExt = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, file, { upsert: false });
      if (uploadError) throw new Error("Falha ao gravar arquivo de imagem");

      const { data: publicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
      const novaFotoUrl = publicUrlData.publicUrl + "?t=" + Date.now();

      await apiFetch('alunos?id=eq.' + this.currentStudentProfileId, '', 'PATCH', { foto_url: novaFotoUrl });

      const student = this.data.students.find(s => String(s.id) === String(this.currentStudentProfileId));
      if (student) student.photo = novaFotoUrl;
      this.renderStudentsList();
    } catch (error) {
    } finally {
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      event.target.value = ''; 
    }
  },

  renderProfileLists() {
    const s = this.data.students.find(s => String(s.id) === String(this.currentStudentProfileId));
    if(document.getElementById('profile-medal-count')) document.getElementById('profile-medal-count').innerText = s.achievements.length;

    const achievementsList = document.getElementById('profile-achievements');
    if(achievementsList) {
      achievementsList.innerHTML = s.achievements.length > 0 
        ? s.achievements.map(a => {
            let icon = 'award', colors = 'bg-slate-50 border-slate-100', iconColors = 'text-slate-500';
            if(a.tipo === 'Cordial') { icon = 'smile'; colors = 'bg-blue-50 border-blue-100'; iconColors = 'text-blue-500'; }
            if(a.tipo === 'Cooperativo') { icon = 'users'; colors = 'bg-emerald-50 border-emerald-100'; iconColors = 'text-emerald-500'; }
            if(a.tipo === 'Desordem') { icon = 'alert-triangle'; colors = 'bg-red-50 border-red-100'; iconColors = 'text-red-500'; }
            if(a.tipo === 'Super') { icon = 'star'; colors = 'bg-yellow-50 border-yellow-200'; iconColors = 'text-yellow-500'; }
            return `<li class="flex gap-3 ${colors} p-3 rounded-xl border relative group">
              <div class="mt-0.5 ${iconColors}"><i data-lucide="${icon}" class="w-5 h-5"></i></div>
              <div class="flex-1 pr-8">
                <div class="flex justify-between items-center mb-1"><p class="font-bold text-[11px] uppercase tracking-wider ${iconColors}">${a.tipo || 'Medalha'}</p><p class="text-[10px] text-slate-400 font-medium">${a.date}</p></div>
                <p class="text-sm text-slate-700 leading-snug">${a.descricao}</p>
              </div>
              <button onclick="app.removeAchievement('${a.id}')" class="absolute right-3 top-3 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </li>`;
        }).join('')
        : '<p class="text-sm text-slate-400">Nenhuma medalha registrada.</p>';
    }

    const activitiesList = document.getElementById('profile-activities');
    if(activitiesList) {
      activitiesList.innerHTML = s.activities.length > 0
        ? s.activities.map(a => `<li class="border-l-2 border-emerald-500 pl-3 py-1"><p class="text-[10px] text-slate-400 font-bold mb-0.5">${a.date}</p><p class="text-sm text-slate-700">${a.description}</p></li>`).join('')
        : '<p class="text-sm text-slate-400">Nenhuma atividade registada.</p>';
    }
    if(typeof lucide !== 'undefined') lucide.createIcons();
  },

  renderParentView() {
    const s = this.data.students.find(s => String(s.id) === String(this.activeChildId));
    const container = document.getElementById('parent-content');
    if(!s) { if(container) container.innerHTML = `<p>Aluno não encontrado.</p>`; return; }

    if(container) {
      container.innerHTML = `
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
          <img src="${s.photo}" class="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-blue-50 bg-blue-100 object-cover">
          <div><h2 class="text-2xl md:text-3xl font-bold text-slate-800">${s.name}</h2><p class="text-slate-500 mt-1">${s.age} anos</p></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="award" class="text-yellow-500 w-5 h-5"></i> Comportamento<span class="bg-blue-100 text-blue-700 text-xs py-0.5 px-2.5 rounded-full ml-auto font-bold shadow-sm">${s.achievements.length}</span></h3>
            <ul class="space-y-3">
              ${s.achievements.map(a => {
                let icon = 'award', colors = 'bg-slate-50 border-slate-100', iconColors = 'text-slate-500';
                if(a.tipo === 'Cordial') { icon = 'smile'; colors = 'bg-blue-50 border-blue-100'; iconColors = 'text-blue-500'; }
                if(a.tipo === 'Cooperativo') { icon = 'users'; colors = 'bg-emerald-50 border-emerald-100'; iconColors = 'text-emerald-500'; }
                if(a.tipo === 'Desordem') { icon = 'alert-triangle'; colors = 'bg-red-50 border-red-100'; iconColors = 'text-red-500'; }
                if(a.tipo === 'Super') { icon = 'star'; colors = 'bg-yellow-50 border-yellow-200'; iconColors = 'text-yellow-500'; }
                return `<li class="flex gap-3 ${colors} p-3 rounded-xl border">
                  <div class="mt-0.5 ${iconColors}"><i data-lucide="${icon}" class="w-5 h-5"></i></div>
                  <div class="flex-1"><div class="flex justify-between items-center mb-0.5"><span class="font-bold text-[11px] uppercase ${iconColors}">${a.tipo || 'Medalha'}</span><span class="text-[10px] text-slate-400">${a.date}</span></div><p class="text-sm">${a.descricao}</p></div>
                </li>`
              }).join('') || '<p class="text-slate-400 text-sm">Nenhuma medalha.</p>'}
            </ul>
          </div>
          <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 class="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="book-open" class="text-emerald-500 w-5 h-5"></i> Atividades Recentes</h3>
            <ul class="space-y-3">
              ${s.activities.map(a => `<li class="border-l-2 border-emerald-500 pl-4 py-1"><p class="text-xs text-slate-400 mb-1">${a.date}</p><p class="text-slate-700 text-sm">${a.description}</p></li>`).join('') || '<p class="text-slate-400 text-sm">Nenhuma atividade.</p>'}
            </ul>
          </div>
        </div>
      `;
    }
    if(typeof lucide !== 'undefined') lucide.createIcons();
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
