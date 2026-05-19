const els = {
  domain: document.getElementById('domain'),
  apiBase: document.getElementById('apiBase'),
  saveConfig: document.getElementById('saveConfig'),
  chatLog: document.getElementById('chatLog'),
  message: document.getElementById('message'),
  send: document.getElementById('send'),
  status: document.getElementById('status'),
  quickQuestions: document.getElementById('quickQuestions'),
  implementationChecks: document.getElementById('implementationChecks'),
  pipelineSummary: document.getElementById('pipelineSummary'),
  pipelineFlow: document.getElementById('pipelineFlow'),
  implementationExamples: document.getElementById('implementationExamples'),
  desktopSidebarMenu: document.getElementById('desktopSidebarMenu'),
  mobileSidebarMenu: document.getElementById('mobileSidebarMenu'),
  screenTitle: document.getElementById('screenTitle'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  mobileSidebar: document.getElementById('mobileSidebar'),
  panelBackdrop: document.getElementById('panelBackdrop'),
  configPanel: document.getElementById('configPanel'),
  promptPanel: document.getElementById('promptPanel'),
};

const state = {
  history: [],
  apiBase: localStorage.getItem('career.apiBase') || '',
  domain: localStorage.getItem('career.domain') || '',
  currentScreen: 'chat',
  activePanel: null,
};

const screens = Array.from(document.querySelectorAll('.screen-view'));

const sidebarItems = [
  { id: 'chat', title: '학생 진로탐색 상담', desc: '대화와 citation 확인', icon: 'fa-comments', tone: 'sky' },
  { id: 'implementation', title: '실제 구현 확인', desc: 'ingest 코드 위치와 상태', icon: 'fa-magnifying-glass-chart', tone: 'emerald' },
  { id: 'pipeline', title: '파이프라인 설명', desc: 'ingest와 pipeline 차이', icon: 'fa-diagram-project', tone: 'violet' },
  { id: 'flow', title: '구현 과정 예시', desc: '단계별 코드 스케치', icon: 'fa-code-branch', tone: 'amber' },
  { id: 'examples', title: '실행 예시와 산출물', desc: '명령과 출력 포맷', icon: 'fa-flask-vial', tone: 'slate' },
];

const sampleQuestions = [
  '학생의 흥미와 강점을 기준으로 적합한 진로 방향을 제안해줘.',
  '상담 대화 내용을 바탕으로 이번 달 실천 계획 3가지를 추천해줘.',
  '추천 직업군별로 필요한 역량과 학교에서 준비할 방법을 알려줘.',
  '학생이 지금 당장 학교 안에서 실천할 수 있는 진로 탐색 활동을 알려줘.',
];

const implementationChecks = [
  {
    title: '정규화 ingest',
    status: '실제 구현 있음',
    statusTone: 'emerald',
    path: 'scripts/normalize.py',
    icon: 'fa-file-import',
    summary: 'DATA_ROOT 하위 JSON 파일을 읽고 검색용 문서와 평가용 QA JSONL로 정규화합니다.',
    details: ['학생기초정보 -> student_profile', '상담기록 -> counseling_record', '전문가 라벨 -> expert_label + qas'],
  },
  {
    title: '벡터 적재 ingest',
    status: '실제 구현 있음',
    statusTone: 'sky',
    path: 'scripts/index_qdrant.py',
    icon: 'fa-database',
    summary: '정규화된 문서를 청크로 나누고 임베딩한 뒤 Qdrant 컬렉션에 저장합니다.',
    details: ['chunk_text()로 분할', 'SentenceTransformer 임베딩', 'career_all + 도메인별 컬렉션 upsert'],
  },
  {
    title: '런타임 검색 파이프라인',
    status: '실제 구현 있음',
    statusTone: 'violet',
    path: 'app/api/main.py',
    icon: 'fa-robot',
    summary: '질문 임베딩, 벡터 검색, 프롬프트 구성, 답변 생성을 `/chat`와 `/ask` API로 제공합니다.',
    details: ['embed_query()', 'search_chunks()', 'build_prompt()', 'LLM 또는 fallback_answer()'],
  },
];

const pipelineSummary = [
  {
    title: 'Ingest',
    body: '외부 데이터에서 상담용 지식을 읽어와 시스템이 쓸 수 있는 구조로 바꾸는 시작 단계입니다.',
    icon: 'fa-download',
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  },
  {
    title: 'Pipeline',
    body: '정규화, 청킹, 임베딩, 벡터 저장, 검색, 프롬프트 생성, 답변 반환까지 이어지는 전체 자동화 흐름입니다.',
    icon: 'fa-route',
    accent: 'border-sky-200 bg-sky-50 text-sky-950',
  },
];

const pipelineSteps = [
  {
    step: '01',
    title: '원천 데이터 수집과 판별',
    badge: 'Ingest 시작',
    path: 'scripts/normalize.py',
    icon: 'fa-folder-tree',
    summary: '파일 이름을 보고 학생기초정보, 상담기록, 전문가 라벨 데이터를 서로 다른 처리 함수로 분기합니다.',
    input: 'DATA_ROOT/**/*.json',
    output: '도메인별 문서 후보 row',
    code: `for path in sorted(data_root.rglob("*.json")):
    if "학생기초정보" in name:
        docs.extend(extract_student_info(data, domain))
    elif "상담기록" in name:
        docs.extend(extract_conversation_docs(data, domain))
    elif "전문가_라벨링" in name:
        d, q = extract_label_docs_and_qas(data, domain)`,
  },
  {
    step: '02',
    title: '검색용 문서로 정규화',
    badge: '정규화',
    path: 'scripts/normalize.py',
    icon: 'fa-file-lines',
    summary: '서로 다른 원본 스키마를 `doc_id`, `domain_name`, `source_spec`, `text`를 가진 공통 문서 포맷으로 통일합니다.',
    input: '학생 프로필 / 상담 대화 / 전문가 추천',
    output: 'data/documents.jsonl, data/qas.jsonl',
    code: `def build_doc(doc_id, domain, doc_type, text, raw):
    return {
        "doc_id": doc_id,
        "domain_name": domain,
        "source_spec": doc_type,
        "text": " ".join((text or "").split()),
        "raw": raw,
    }`,
  },
  {
    step: '03',
    title: '청크 분할과 벡터 적재',
    badge: 'Embedding',
    path: 'scripts/index_qdrant.py',
    icon: 'fa-cubes-stacked',
    summary: '긴 문서를 잘게 나누고 임베딩 벡터를 생성한 뒤 `career_all` 및 도메인별 컬렉션에 upsert합니다.',
    input: 'data/documents.jsonl',
    output: 'Qdrant collection',
    code: `for idx, ch in enumerate(chunk_text(r.get("text", ""), args.max_chars, args.overlap)):
    all_texts.append("passage: " + ch)

vectors = np.asarray(model.encode(all_texts, normalize_embeddings=True), dtype=np.float32)
upsert_points(client, "career_all", vectors, all_payloads, all_ids)`,
  },
  {
    step: '04',
    title: '질문 검색과 상담 답변 생성',
    badge: 'Runtime Pipeline',
    path: 'app/api/main.py',
    icon: 'fa-comments-dollar',
    summary: '사용자 질문을 벡터 검색으로 관련 근거와 연결하고, 프롬프트를 구성해 LLM 또는 fallback 응답을 반환합니다.',
    input: 'POST /chat',
    output: 'answer + citations + used_collection',
    code: `qvec = embed_query(message)
hits = search_chunks(used, qvec, top_k)
prompt = build_prompt(message, history, hits)
answer = fallback_answer(message, hits)`,
  },
];

const implementationExamples = [
  {
    title: '배치 실행 커맨드 예시',
    caption: '처음 데이터를 적재할 때 사용하는 흐름',
    icon: 'fa-terminal',
    code: `python scripts/normalize.py --data-root ./DATA_ROOT --out-dir ./data
python scripts/index_qdrant.py --docs ./data/documents.jsonl`,
  },
  {
    title: '정규화 문서 예시',
    caption: '원본 데이터를 검색 가능한 단일 포맷으로 통합',
    icon: 'fa-file-code',
    code: `{
  "doc_id": "student_profile::S-0001",
  "domain_name": "01. 학교급 / 03. 고등",
  "source_spec": "student_profile",
  "text": "학생ID: S-0001 ... 관심사: 과학, 디자인 ..."
}`,
  },
  {
    title: '벡터 DB payload 예시',
    caption: '청크 단위로 적재되는 검색 payload',
    icon: 'fa-box-archive',
    code: `{
  "doc_id": "counsel::S-0001::1",
  "chunk_idx": 0,
  "domain_name": "01. 학교급 / 03. 고등",
  "source_spec": "counseling_record",
  "text": "[카테고리] 자아이해 ..."
}`,
  },
  {
    title: '웹앱 상담 요청 예시',
    caption: '현재 화면의 전송 버튼이 호출하는 API',
    icon: 'fa-paper-plane',
    code: `POST /chat
{
  "message": "학생의 흥미와 강점을 기준으로 진로를 추천해줘.",
  "domain": "01. 학교급 / 03. 고등",
  "top_k": 5,
  "history": [...]
}`,
  },
];

function baseUrl() {
  return (state.apiBase || '').trim() || window.location.origin;
}

function setStatus(msg = '') {
  if (!msg) {
    els.status.classList.add('hidden');
    return;
  }
  els.status.classList.remove('hidden');
  els.status.textContent = msg;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function tonePill(tone) {
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tone === 'sky') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (tone === 'violet') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function sidebarTone(tone, active) {
  if (active) return 'border-sky-400 bg-sky-500 text-white shadow-lg shadow-sky-950/10';
  if (tone === 'emerald') return 'border-transparent bg-transparent text-slate-200 hover:bg-white/10';
  if (tone === 'sky') return 'border-transparent bg-transparent text-slate-200 hover:bg-white/10';
  if (tone === 'violet') return 'border-transparent bg-transparent text-slate-200 hover:bg-white/10';
  if (tone === 'amber') return 'border-transparent bg-transparent text-slate-200 hover:bg-white/10';
  return 'border-transparent bg-transparent text-slate-200 hover:bg-white/10';
}

function setScreen(screenId) {
  state.currentScreen = screenId;
  screens.forEach((screen) => {
    screen.classList.toggle('hidden', screen.dataset.screen !== screenId);
  });

  const current = sidebarItems.find((item) => item.id === screenId);
  els.screenTitle.textContent = current ? current.title : '학생 진로탐색 상담';
  renderSidebarMenus();
  closeMobileSidebar();
}

function openPanel(panel) {
  closePanel();
  state.activePanel = panel;
  panel.classList.remove('translate-x-full', 'pointer-events-none');
  panel.classList.add('translate-x-0');
  els.panelBackdrop.classList.remove('pointer-events-none', 'opacity-0');
  els.panelBackdrop.classList.add('opacity-100');
  document.body.classList.add('overflow-hidden');
}

function closePanel() {
  [els.configPanel, els.promptPanel].forEach((panel) => {
    panel.classList.add('pointer-events-none');
    panel.classList.remove('translate-x-0');
    panel.classList.add('translate-x-full');
  });
  state.activePanel = null;
  els.panelBackdrop.classList.add('pointer-events-none', 'opacity-0');
  els.panelBackdrop.classList.remove('opacity-100');
  document.body.classList.remove('overflow-hidden');
}

function openMobileSidebar() {
  els.mobileSidebar.classList.remove('-translate-x-full', 'pointer-events-none');
  els.mobileSidebar.classList.add('translate-x-0');
  els.sidebarBackdrop.classList.remove('pointer-events-none', 'opacity-0');
  els.sidebarBackdrop.classList.add('opacity-100');
  document.body.classList.add('overflow-hidden');
}

function closeMobileSidebar() {
  els.mobileSidebar.classList.add('pointer-events-none', '-translate-x-full');
  els.mobileSidebar.classList.remove('translate-x-0');
  els.sidebarBackdrop.classList.add('pointer-events-none', 'opacity-0');
  els.sidebarBackdrop.classList.remove('opacity-100');
  if (!state.activePanel) {
    document.body.classList.remove('overflow-hidden');
  }
}

function addBubble(role, text, citations = []) {
  const isUser = role === 'user';
  const wrap = document.createElement('div');
  wrap.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;

  const citeHtml = !isUser && citations.length
    ? `<div class="mt-4 space-y-2">${citations.map((c, i) => `
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <div class="font-semibold text-slate-900">[${i + 1}] ${escapeHtml(c.domain_name)} · ${escapeHtml(c.source_spec || 'unknown')}</div>
        <div class="mt-1 leading-6 text-slate-600">${escapeHtml(c.excerpt || '')}</div>
      </div>`).join('')}</div>`
    : '';

  wrap.innerHTML = `
    <div class="max-w-[92%] rounded-[28px] px-5 py-4 text-base leading-8 shadow-sm md:max-w-[85%] ${isUser ? 'bg-sky-600 text-white' : 'border border-slate-200 bg-white text-slate-900'}">
      <div class="whitespace-pre-wrap font-medium tracking-[-0.02em]">${escapeHtml(text)}</div>
      ${citeHtml}
    </div>
  `;
  els.chatLog.appendChild(wrap);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

async function sendMessage() {
  const message = (els.message.value || '').trim();
  if (!message) return;

  const domain = (els.domain.value || '').trim();
  setScreen('chat');
  addBubble('user', message);
  state.history.push({ role: 'user', content: message });
  els.message.value = '';
  setStatus('상담 답변 생성 중...');
  els.send.disabled = true;

  try {
    const res = await fetch(`${baseUrl()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        domain: domain || null,
        top_k: 5,
        history: state.history.slice(-8),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    addBubble('assistant', data.answer || '답변이 비어 있습니다.', data.citations || []);
    state.history.push({ role: 'assistant', content: data.answer || '' });
    setStatus('');
  } catch (e) {
    setStatus(`오류: ${e.message}`);
    addBubble('assistant', '요청 처리 중 오류가 발생했습니다. API 설정과 서버 상태를 확인해주세요.');
  } finally {
    els.send.disabled = false;
  }
}

function renderSidebarMenus() {
  const menuHtml = sidebarItems.map((item) => {
    const active = item.id === state.currentScreen;
    return `
      <button class="sidebar-item flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition ${sidebarTone(item.tone, active)}" data-screen-target="${item.id}">
        <span class="flex h-12 w-12 items-center justify-center rounded-2xl ${active ? 'bg-white/15 text-white' : 'bg-white/10 text-sky-300'}">
          <i class="fa-solid ${item.icon}"></i>
        </span>
        <span class="min-w-0">
          <span class="block truncate text-base font-bold tracking-[-0.02em]">${escapeHtml(item.title)}</span>
          <span class="mt-1 block truncate text-sm ${active ? 'text-sky-100' : 'text-slate-400'}">${escapeHtml(item.desc)}</span>
        </span>
      </button>
    `;
  }).join('');

  els.desktopSidebarMenu.innerHTML = menuHtml;
  els.mobileSidebarMenu.innerHTML = menuHtml;

  Array.from(document.querySelectorAll('[data-screen-target]')).forEach((btn) => {
    btn.addEventListener('click', () => setScreen(btn.getAttribute('data-screen-target')));
  });
}

function renderQuickQuestions() {
  els.quickQuestions.innerHTML = sampleQuestions.map((q, i) => `
    <button class="quick-question rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-5 text-left text-sky-950 transition hover:-translate-y-0.5 hover:bg-sky-100" data-question="${escapeHtml(q)}">
      <div class="flex items-center gap-3 text-base font-bold">
        <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sky-600">${i + 1}</span>
        <span>빠른 질문</span>
      </div>
      <div class="mt-3 text-lg leading-8 tracking-[-0.02em]">${escapeHtml(q)}</div>
    </button>
  `).join('');

  Array.from(document.querySelectorAll('.quick-question')).forEach((btn) => {
    btn.addEventListener('click', () => {
      els.message.value = btn.getAttribute('data-question') || '';
      setScreen('chat');
      closePanel();
      els.message.focus();
    });
  });
}

function renderImplementationChecks() {
  els.implementationChecks.innerHTML = implementationChecks.map((item) => `
    <article class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-panel">
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl text-white">
            <i class="fa-solid ${item.icon}"></i>
          </div>
          <div>
            <h4 class="text-2xl font-black tracking-[-0.03em] text-slate-900">${escapeHtml(item.title)}</h4>
            <div class="mt-1 text-sm text-slate-500">${escapeHtml(item.path)}</div>
          </div>
        </div>
        <span class="rounded-full border px-3 py-2 text-sm font-bold ${tonePill(item.statusTone)}">${escapeHtml(item.status)}</span>
      </div>
      <p class="mt-4 text-lg leading-8 text-slate-700">${escapeHtml(item.summary)}</p>
      <div class="mt-4 flex flex-wrap gap-2">
        ${item.details.map((detail) => `<span class="rounded-full bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">${escapeHtml(detail)}</span>`).join('')}
      </div>
    </article>
  `).join('');
}

function renderPipelineSummary() {
  els.pipelineSummary.innerHTML = pipelineSummary.map((item) => `
    <article class="rounded-[28px] border p-5 shadow-panel ${item.accent}">
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-lg">
          <i class="fa-solid ${item.icon}"></i>
        </div>
        <h4 class="text-2xl font-black tracking-[-0.03em]">${escapeHtml(item.title)}</h4>
      </div>
      <p class="mt-4 text-lg leading-8">${escapeHtml(item.body)}</p>
    </article>
  `).join('');
}

function renderPipelineFlow() {
  els.pipelineFlow.innerHTML = pipelineSteps.map((item) => `
    <article class="rounded-[30px] border border-slate-200 bg-white p-5 shadow-panel md:p-6">
      <div class="grid gap-5 xl:grid-cols-[120px_minmax(0,1fr)_360px]">
        <div class="flex flex-col items-start gap-3">
          <div class="rounded-[24px] bg-slate-950 px-5 py-4 text-white">
            <div class="text-xs tracking-[0.2em] text-slate-400">STEP</div>
            <div class="mt-1 text-3xl font-black">${escapeHtml(item.step)}</div>
          </div>
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-xl text-slate-900 ring-1 ring-slate-200">
            <i class="fa-solid ${item.icon}"></i>
          </div>
        </div>
        <div>
          <div class="inline-flex rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600">${escapeHtml(item.badge)}</div>
          <h4 class="mt-4 text-3xl font-black tracking-[-0.04em] text-slate-900">${escapeHtml(item.title)}</h4>
          <div class="mt-2 text-base font-medium text-slate-500">${escapeHtml(item.path)}</div>
          <p class="mt-4 text-lg leading-8 text-slate-700">${escapeHtml(item.summary)}</p>
          <div class="mt-5 grid gap-3 md:grid-cols-2">
            <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div class="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">Input</div>
              <div class="mt-3 text-lg leading-8 text-slate-900">${escapeHtml(item.input)}</div>
            </div>
            <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div class="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">Output</div>
              <div class="mt-3 text-lg leading-8 text-slate-900">${escapeHtml(item.output)}</div>
            </div>
          </div>
        </div>
        <div class="overflow-hidden rounded-[26px] border border-slate-900 bg-slate-950">
          <div class="border-b border-white/10 px-5 py-4 text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Code Sketch</div>
          <pre class="overflow-x-auto p-5 text-sm leading-7 text-slate-100"><code>${escapeHtml(item.code)}</code></pre>
        </div>
      </div>
    </article>
  `).join('');
}

function renderImplementationExamples() {
  els.implementationExamples.innerHTML = implementationExamples.map((item) => `
    <article class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-panel">
      <div class="border-b border-slate-200 bg-slate-50 px-5 py-5">
        <div class="flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <i class="fa-solid ${item.icon}"></i>
          </div>
          <div>
            <h4 class="text-2xl font-black tracking-[-0.03em] text-slate-900">${escapeHtml(item.title)}</h4>
            <p class="mt-1 text-base leading-7 text-slate-600">${escapeHtml(item.caption)}</p>
          </div>
        </div>
      </div>
      <pre class="overflow-x-auto p-5 text-sm leading-7 text-slate-800"><code>${escapeHtml(item.code)}</code></pre>
    </article>
  `).join('');
}

function bindEvents() {
  document.getElementById('newChatScreen').addEventListener('click', () => setScreen('chat'));
  document.getElementById('newChatScreenMobile').addEventListener('click', () => setScreen('chat'));
  document.getElementById('openConfigDesktop').addEventListener('click', () => openPanel(els.configPanel));
  document.getElementById('openConfigHeader').addEventListener('click', () => openPanel(els.configPanel));
  document.getElementById('openQuickPrompt').addEventListener('click', () => openPanel(els.promptPanel));
  document.getElementById('openQuickPromptCard').addEventListener('click', () => openPanel(els.promptPanel));
  document.getElementById('openMobileSidebar').addEventListener('click', openMobileSidebar);
  document.getElementById('closeMobileSidebar').addEventListener('click', closeMobileSidebar);

  els.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  els.panelBackdrop.addEventListener('click', closePanel);

  Array.from(document.querySelectorAll('[data-close-panel]')).forEach((btn) => {
    btn.addEventListener('click', closePanel);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePanel();
      closeMobileSidebar();
    }
  });

  els.saveConfig.addEventListener('click', () => {
    state.apiBase = (els.apiBase.value || '').trim();
    state.domain = (els.domain.value || '').trim();
    localStorage.setItem('career.apiBase', state.apiBase);
    localStorage.setItem('career.domain', state.domain);
    setStatus('설정을 저장했습니다.');
    setTimeout(() => setStatus(''), 1600);
    closePanel();
  });

  els.send.addEventListener('click', sendMessage);
  els.message.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function init() {
  els.apiBase.value = state.apiBase;
  els.domain.value = state.domain;

  renderSidebarMenus();
  renderQuickQuestions();
  renderImplementationChecks();
  renderPipelineSummary();
  renderPipelineFlow();
  renderImplementationExamples();
  bindEvents();
  setScreen('chat');

  addBubble('assistant', '안녕하세요! 학생의 흥미, 강점, 상담기록을 바탕으로 진로탐색을 도와드릴게요. 좌측 메뉴에서 다른 화면으로 이동할 수 있습니다.');
}

init();
