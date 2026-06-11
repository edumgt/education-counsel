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
  assetChatLog: document.getElementById('assetChatLog'),
  assetMessage: document.getElementById('assetMessage'),
  assetSend: document.getElementById('assetSend'),
  assetStatus: document.getElementById('assetStatus'),
};

const state = {
  history: [],
  assetHistory: [],
  apiBase: localStorage.getItem('career.apiBase') || '',
  domain: localStorage.getItem('career.domain') || '',
  currentScreen: 'chat',
  activePanel: null,
  assetInitialized: false,
};

const screens = Array.from(document.querySelectorAll('.screen-view'));

const sidebarItems = [
  { id: 'chat', title: '학생 진로탐색 상담', desc: '대화와 citation 확인', icon: 'fa-comments', tone: 'sky' },
  { id: 'asset-counsel', title: '자산운용 자격증 상담', desc: '자격증 취득 경로와 준비 전략', icon: 'fa-chart-line', tone: 'amber' },
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
  const textEl = document.getElementById('statusText');
  if (textEl) textEl.textContent = msg;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function tonePill(tone) {
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tone === 'sky') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (tone === 'violet') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function sidebarTone(tone, active) {
  if (active) return 'sidebar-active font-semibold';
  return 'text-gray-600 hover:bg-gray-100';
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

  if (screenId === 'asset-counsel' && !state.assetInitialized) {
    state.assetInitialized = true;
    addAssetBubble('assistant', '안녕하세요! 자산운용 자격증 취득 전문 AI 상담사입니다.\n\n투자자산운용사, CFA, AFPK/CFP, FRM 등 자격증 취득 경로, 준비 방법, 커리어 전략을 안내드립니다.\n\n아래 빠른 질문을 선택하거나 직접 질문을 입력해 주세요.');
    renderAssetQuickCards();
  }
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
  wrap.className = `flex gap-3 fade-in ${isUser ? 'justify-end' : 'justify-start'}`;

  const citeHtml = !isUser && citations.length
    ? `<div class="mt-3 space-y-1.5 border-t border-gray-100 pt-3">${citations.map((c, i) => `
      <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <span class="font-semibold text-gray-800">[${i + 1}] ${escapeHtml(c.domain_name)} · ${escapeHtml(c.source_spec || 'unknown')}</span>
        <div class="mt-0.5 leading-5">${escapeHtml(c.excerpt || '')}</div>
      </div>`).join('')}</div>`
    : '';

  if (isUser) {
    wrap.innerHTML = `
      <div class="max-w-[78%] bubble-user copilot-gradient px-4 py-3 text-sm leading-relaxed text-white shadow-sm">
        <div class="whitespace-pre-wrap">${escapeHtml(text)}</div>
      </div>`;
  } else {
    wrap.innerHTML = `
      <div class="w-7 h-7 shrink-0 copilot-gradient rounded-full flex items-center justify-center mt-0.5">
        <i class="fa-solid fa-seedling text-white text-xs"></i>
      </div>
      <div class="max-w-[78%] bubble-assistant border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-900 shadow-sm">
        <div class="whitespace-pre-wrap">${escapeHtml(text)}</div>
        ${citeHtml}
      </div>`;
  }
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
      <button class="sidebar-item flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${sidebarTone(item.tone, active)}" data-screen-target="${item.id}">
        <i class="fa-solid ${item.icon} nav-icon w-4 text-center text-sm ${active ? 'text-copilot-600' : 'text-gray-400'}"></i>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">${escapeHtml(item.title)}</span>
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
  const isAsset = state.currentScreen === 'asset-counsel';
  const questions = isAsset ? assetSampleQuestions : sampleQuestions;
  const pillClass = isAsset
    ? 'border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100'
    : 'border-gray-200 bg-white hover:border-copilot-200 hover:bg-copilot-50';
  const numClass = isAsset
    ? 'bg-amber-100 text-amber-600'
    : 'bg-copilot-100 text-copilot-600';

  els.quickQuestions.innerHTML = questions.map((q, i) => `
    <button class="quick-question w-full rounded-xl border ${pillClass} px-4 py-3 text-left text-sm transition" data-question="${escapeHtml(q)}">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center rounded-full ${numClass} text-xs font-bold">${i + 1}</span>
        <span class="leading-relaxed text-gray-700">${escapeHtml(q)}</span>
      </div>
    </button>
  `).join('');

  Array.from(document.querySelectorAll('.quick-question')).forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-question') || '';
      if (isAsset) {
        els.assetMessage.value = q;
        closePanel();
        els.assetMessage.focus();
      } else {
        els.message.value = q;
        setScreen('chat');
        closePanel();
        els.message.focus();
      }
    });
  });
}

function renderImplementationChecks() {
  els.implementationChecks.innerHTML = implementationChecks.map((item) => `
    <article class="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-gray-900 text-white">
            <i class="fa-solid ${item.icon} text-sm"></i>
          </div>
          <div>
            <h4 class="text-base font-semibold text-gray-900">${escapeHtml(item.title)}</h4>
            <div class="text-xs text-gray-400 mt-0.5 font-mono">${escapeHtml(item.path)}</div>
          </div>
        </div>
        <span class="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${tonePill(item.statusTone)}">${escapeHtml(item.status)}</span>
      </div>
      <p class="mt-3 text-sm leading-relaxed text-gray-600">${escapeHtml(item.summary)}</p>
      <div class="mt-3 flex flex-wrap gap-1.5">
        ${item.details.map((detail) => `<span class="rounded-full bg-gray-50 border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500">${escapeHtml(detail)}</span>`).join('')}
      </div>
    </article>
  `).join('');
}

function renderPipelineSummary() {
  els.pipelineSummary.innerHTML = pipelineSummary.map((item) => `
    <article class="rounded-xl border p-4 ${item.accent}">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 flex items-center justify-center rounded-lg bg-white/70 shadow-sm">
          <i class="fa-solid ${item.icon} text-sm"></i>
        </div>
        <h4 class="text-base font-semibold">${escapeHtml(item.title)}</h4>
      </div>
      <p class="mt-3 text-sm leading-relaxed">${escapeHtml(item.body)}</p>
    </article>
  `).join('');
}

function renderPipelineFlow() {
  els.pipelineFlow.innerHTML = pipelineSteps.map((item) => `
    <article class="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
      <div class="grid gap-5 xl:grid-cols-[80px_minmax(0,1fr)_320px]">
        <div class="flex flex-col items-start gap-2">
          <div class="rounded-lg bg-gray-900 px-3 py-2 text-white text-center min-w-[56px]">
            <div class="text-xs text-gray-400 font-mono">STEP</div>
            <div class="text-xl font-bold">${escapeHtml(item.step)}</div>
          </div>
          <div class="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600">
            <i class="fa-solid ${item.icon} text-sm"></i>
          </div>
        </div>
        <div>
          <span class="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">${escapeHtml(item.badge)}</span>
          <h4 class="mt-2 text-lg font-semibold text-gray-900">${escapeHtml(item.title)}</h4>
          <div class="mt-0.5 text-xs font-mono text-gray-400">${escapeHtml(item.path)}</div>
          <p class="mt-2 text-sm leading-relaxed text-gray-600">${escapeHtml(item.summary)}</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Input</div>
              <div class="mt-1 text-sm text-gray-700">${escapeHtml(item.input)}</div>
            </div>
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Output</div>
              <div class="mt-1 text-sm text-gray-700">${escapeHtml(item.output)}</div>
            </div>
          </div>
        </div>
        <div class="overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
          <div class="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Code Sketch</div>
          <pre class="overflow-x-auto p-4 text-xs leading-relaxed text-gray-200"><code>${escapeHtml(item.code)}</code></pre>
        </div>
      </div>
    </article>
  `).join('');
}

function renderImplementationExamples() {
  els.implementationExamples.innerHTML = implementationExamples.map((item) => `
    <article class="overflow-hidden rounded-xl border border-gray-200 bg-white hover:shadow-md transition-shadow">
      <div class="border-b border-gray-200 bg-gray-50 px-4 py-3.5 flex items-center gap-3">
        <div class="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-900 text-white shrink-0">
          <i class="fa-solid ${item.icon} text-sm"></i>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-gray-900">${escapeHtml(item.title)}</h4>
          <p class="text-xs text-gray-500">${escapeHtml(item.caption)}</p>
        </div>
      </div>
      <pre class="overflow-x-auto p-4 text-xs leading-relaxed text-gray-800 bg-white"><code>${escapeHtml(item.code)}</code></pre>
    </article>
  `).join('');
}

const assetSampleQuestions = [
  '투자자산운용사 시험 과목과 합격 기준을 알려주세요.',
  'CFA Level 1을 처음 준비하는데 무엇부터 시작해야 할까요?',
  '자산운용업계 취업을 위해 어떤 자격증 순서로 취득해야 하나요?',
  'AFPK와 CFP의 차이점과 취득 순서를 알려주세요.',
  '재무위험관리사와 국제 FRM 중 어떤 자격증이 더 유리한가요?',
  '금융투자분석사 자격증 취득 난이도와 준비 전략을 알려주세요.',
];

function setAssetStatus(msg = '') {
  if (!msg) {
    els.assetStatus.classList.add('hidden');
    return;
  }
  els.assetStatus.classList.remove('hidden');
  const textEl = document.getElementById('assetStatusText');
  if (textEl) textEl.textContent = msg;
}

function addAssetBubble(role, text) {
  const isUser = role === 'user';
  const wrap = document.createElement('div');
  wrap.className = `flex gap-3 fade-in ${isUser ? 'justify-end' : 'justify-start'}`;

  if (isUser) {
    wrap.innerHTML = `
      <div class="max-w-[78%] bubble-user bg-amber-500 px-4 py-3 text-sm leading-relaxed text-white shadow-sm">
        <div class="whitespace-pre-wrap">${escapeHtml(text)}</div>
      </div>`;
  } else {
    wrap.innerHTML = `
      <div class="w-7 h-7 shrink-0 bg-amber-500 rounded-full flex items-center justify-center mt-0.5">
        <i class="fa-solid fa-chart-line text-white text-xs"></i>
      </div>
      <div class="max-w-[78%] bubble-assistant border border-amber-100 bg-white px-4 py-3 text-sm leading-relaxed text-gray-900 shadow-sm">
        <div class="whitespace-pre-wrap">${escapeHtml(text)}</div>
      </div>`;
  }
  els.assetChatLog.appendChild(wrap);
  els.assetChatLog.scrollTop = els.assetChatLog.scrollHeight;
}

function renderAssetQuickCards() {
  const container = document.createElement('div');
  container.id = 'assetQuickCards';
  container.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2 my-2';
  container.innerHTML = assetSampleQuestions.map((q) => `
    <button class="asset-quick-card rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm transition hover:border-amber-400 hover:bg-amber-100" data-question="${escapeHtml(q)}">
      <div class="flex items-start gap-2">
        <i class="fa-solid fa-circle-question text-amber-400 mt-0.5 text-xs shrink-0"></i>
        <span class="leading-relaxed text-gray-700">${escapeHtml(q)}</span>
      </div>
    </button>
  `).join('');
  els.assetChatLog.appendChild(container);
  els.assetChatLog.scrollTop = els.assetChatLog.scrollHeight;

  Array.from(container.querySelectorAll('.asset-quick-card')).forEach((btn) => {
    btn.addEventListener('click', () => {
      els.assetMessage.value = btn.getAttribute('data-question') || '';
      container.remove();
      els.assetMessage.focus();
      sendAssetMessage();
    });
  });
}

async function sendAssetMessage() {
  const message = (els.assetMessage.value || '').trim();
  if (!message) return;

  const quickCards = document.getElementById('assetQuickCards');
  if (quickCards) quickCards.remove();

  addAssetBubble('user', message);
  state.assetHistory.push({ role: 'user', content: message });
  els.assetMessage.value = '';
  els.assetMessage.style.height = 'auto';
  setAssetStatus('상담 답변 생성 중...');
  els.assetSend.disabled = true;

  try {
    const res = await fetch(`${baseUrl()}/asset-counsel/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: state.assetHistory.slice(-8),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const answer = data.answer || '답변이 비어 있습니다.';
    addAssetBubble('assistant', answer);
    state.assetHistory.push({ role: 'assistant', content: answer });
    setAssetStatus('');
  } catch (e) {
    setAssetStatus(`오류: ${e.message}`);
    addAssetBubble('assistant', '요청 처리 중 오류가 발생했습니다. API 설정과 서버 상태를 확인해 주세요.');
  } finally {
    els.assetSend.disabled = false;
  }
}

function bindEvents() {
  document.getElementById('newChatScreen').addEventListener('click', () => setScreen('chat'));
  document.getElementById('newChatScreenMobile').addEventListener('click', () => setScreen('chat'));
  document.getElementById('openConfigDesktop').addEventListener('click', () => openPanel(els.configPanel));
  document.getElementById('openConfigHeader').addEventListener('click', () => openPanel(els.configPanel));
  document.getElementById('openQuickPrompt').addEventListener('click', () => { renderQuickQuestions(); openPanel(els.promptPanel); });
  document.getElementById('openQuickPromptCard')?.addEventListener('click', () => { renderQuickQuestions(); openPanel(els.promptPanel); });
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
  els.message.addEventListener('input', () => {
    els.message.style.height = 'auto';
    els.message.style.height = Math.min(els.message.scrollHeight, 140) + 'px';
  });

  els.assetSend.addEventListener('click', sendAssetMessage);
  els.assetMessage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAssetMessage();
    }
  });
  els.assetMessage.addEventListener('input', () => {
    els.assetMessage.style.height = 'auto';
    els.assetMessage.style.height = Math.min(els.assetMessage.scrollHeight, 140) + 'px';
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

  addBubble('assistant', '안녕하세요! 학생의 흥미, 강점, 상담기록을 바탕으로 진로탐색을 도와드릴게요.\n\n궁금한 내용을 입력하거나 우측 상단의 [빠른 질문] 버튼을 눌러 템플릿을 사용해 보세요.');
}

init();
