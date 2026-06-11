from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

load_dotenv()

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small")

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "none").lower()  # none | ollama | openai | azure_openai
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

# Azure OpenAI
AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.environ.get("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-02-01")

# Anthropic Claude
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

app = FastAPI(title="Career Counseling Chatbot API", version="1.0.0")

client = QdrantClient(url=QDRANT_URL)
embedder = SentenceTransformer(EMBED_MODEL)


def normalize_collection_name(domain_name: str) -> str:
    s = (domain_name or "").strip().replace(" ", "_")
    s = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in s)
    return f"career_{(s or 'unknown').lower()}"


class Citation(BaseModel):
    doc_id: str
    domain_name: str
    source_spec: Optional[str] = None
    excerpt: str


class ChatRequest(BaseModel):
    message: str = Field(..., description="학생 질문/상담 요청")
    domain: Optional[str] = Field(None, description="데이터 도메인 필터")
    top_k: int = Field(5, ge=1, le=10)
    history: List[Dict[str, str]] = Field(default_factory=list, description="[{role,user|assistant, content}]")


class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation]
    used_collection: str


class AskRequest(BaseModel):
    query: str
    domain: Optional[str] = None
    top_k: int = Field(4, ge=1, le=10)


class AskResponse(BaseModel):
    answer: str
    citations: List[Citation]
    used_collection: str


def embed_query(q: str) -> List[float]:
    return embedder.encode(["query: " + q], normalize_embeddings=True)[0].tolist()


def collection_exists(name: str) -> bool:
    return any(c.name == name for c in client.get_collections().collections)


def search_chunks(collection: str, qvec: List[float], top_k: int) -> List[Dict[str, Any]]:
    result = client.search(collection_name=collection, query_vector=qvec, limit=top_k, with_payload=True)
    return [{"score": float(r.score), "payload": (r.payload or {})} for r in result]


def build_prompt(question: str, history: List[Dict[str, str]], hits: List[Dict[str, Any]]) -> str:
    history_block = "\n".join([f"- {h.get('role', 'user')}: {h.get('content', '')}" for h in history[-6:]])
    evidence = []
    for i, h in enumerate(hits, start=1):
        p = h["payload"]
        evidence.append(f"[{i}] doc={p.get('doc_id')} domain={p.get('domain_name')} type={p.get('source_spec')}\n{p.get('text', '')}")

    evidence_block = "\n\n".join(evidence)
    return f"""당신은 중·고등학생 진로탐색을 돕는 AI 상담 챗봇입니다.
규칙:
1) 반드시 제공된 근거 안에서만 답하고, 과장하지 마세요.
2) 학생의 흥미/강점/상담맥락을 반영해 '다음 행동'을 제안하세요.
3) 답변 형식: 핵심요약 3줄 + 추천 진로/직업군 + 실천계획(이번주/이번달).
4) 마지막 줄에 [근거] [1],[2] 형태로 인용하세요.

[대화이력]
{history_block if history_block else '(없음)'}

[질문]
{question}

[근거]
{evidence_block}
"""


def call_ollama(prompt: str) -> str:
    url = OLLAMA_BASE_URL.rstrip("/") + "/api/generate"
    response = requests.post(url, json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}, timeout=120)
    response.raise_for_status()
    return response.json().get("response", "").strip()


def call_openai(prompt: str, system: str = "You are a student career counseling assistant. Use only provided evidence.") -> str:
    import openai  # type: ignore

    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")
    openai.api_key = OPENAI_API_KEY

    resp = openai.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    return (resp.choices[0].message.content or "").strip()


def call_azure_openai(prompt: str, system: str = "You are a student career counseling assistant. Use only provided evidence.") -> str:
    import openai  # type: ignore

    if not AZURE_OPENAI_ENDPOINT:
        raise RuntimeError("AZURE_OPENAI_ENDPOINT is not set")
    if not AZURE_OPENAI_API_KEY:
        raise RuntimeError("AZURE_OPENAI_API_KEY is not set")

    client_az = openai.AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION,
    )
    resp = client_az.chat.completions.create(
        model=AZURE_OPENAI_DEPLOYMENT,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    return (resp.choices[0].message.content or "").strip()


def call_claude(prompt: str, system: str = "") -> str:
    import anthropic  # type: ignore

    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    client_an = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    kwargs: Dict[str, Any] = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    resp = client_an.messages.create(**kwargs)
    return resp.content[0].text.strip()


ASSET_COUNSEL_SYSTEM = """당신은 한국 자산운용 자격증 취득을 전문으로 상담하는 AI 카운셀러입니다.
응시자의 현황(경력, 학력, 목표)에 맞는 맞춤형 자격증 로드맵, 준비 전략, 커리어 경로를 제공합니다.
항상 한국어로 친절하고 구체적으로 답변하세요."""

ASSET_COUNSEL_KNOWLEDGE = """
## 국내 주요 자격증

### 투자자산운용사
- 주관: 한국금융투자협회 금융투자교육원
- 응시자격: 제한 없음
- 시험 과목: 금융상품 및 세제(30), 투자운용·전략Ⅰ-주식(40), 투자운용·전략Ⅱ-채권·파생(40), 투자운용·전략Ⅲ-대안·연금(20), 리스크관리 및 직무윤리(20)
- 합격 기준: 과목별 40점 이상 + 전 과목 평균 70점 이상 (총 150문항)
- 응시료: 55,000원 / 연 4회 시행
- 준비 기간: 3~6개월 / 금융투자교육원 인강 + 협회 교재 권장
- 취업 연계: 자산운용사·증권사·은행 WM·보험사 자산운용부서 필수 또는 우대

### 펀드투자권유대행인
- 주관: 한국금융투자협회
- 과목: 펀드 일반, 투자권유 및 법규
- 합격 기준: 70점 이상 / 응시료: 8,000원
- 난이도 낮음 — 금융투자 업무 입문용

### 증권투자권유대행인
- 주관: 한국금융투자협회
- 과목: 증권·파생상품, 법규 / 합격 기준: 70점 이상
- 응시료: 8,000원 — 증권사 취업 보조 자격증

### 파생상품투자권유자문인력
- 주관: 한국금융투자협회
- 과목: 파생상품 일반, 법규 / 합격 기준: 70점 이상

### 금융투자분석사 (애널리스트)
- 주관: 한국금융투자협회
- 과목: 증권·채권·파생 분석, 법규
- 합격 기준: 평균 70점 + 과목별 40점 이상
- 준비 기간: 6개월~1년 — 고난이도 전문 자격증

### 재무위험관리사 (국내 FRM)
- 주관: 한국금융투자협회
- 과목: 위험관리 기초, 시장·신용·운영 위험관리
- 합격 기준: 70점 이상 + 과목별 40점 이상 / 준비 기간: 4~6개월

## 재무설계 자격증

### AFPK (Associate Financial Planner Korea)
- 주관: 한국FPSB
- 모듈: 재무설계 개론, 직업윤리, 은퇴설계, 위험관리·보험, 투자설계, 세금, 부동산, 상속 (8모듈)
- 합격 기준: 모듈별 60점 이상 / 응시료: 모듈당 약 40,000원
- CFP 취득의 전제 조건

### CFP (Certified Financial Planner)
- 주관: 한국FPSB (국제 자격)
- 응시자격: AFPK 보유 + 관련 경력 3년 이상
- 케이스 스터디 중심 시험 — 재무설계 최고 국제 자격

## 국제 자격증

### CFA (Chartered Financial Analyst)
- 주관: CFA Institute (미국)
- Level 1·2·3 구성 / 영어 시험
- Level 1 시행: 2·3월 / 5·6월 / 8·9월 / 11·12월 (연 4회)
- 합격률: L1 약 40% / L2 약 45% / L3 약 52%
- 준비 기간: 레벨당 4~6개월 (권장 300시간)
- 응시료: L1 약 $700~$1,000 (조기 등록 기준)
- 학습 자료: Kaplan Schweser, CFA Institute 공식 교재
- 자산운용업계 최고 권위 국제 자격

### FRM (Financial Risk Manager)
- 주관: GARP (미국)
- Part 1·2 구성 / 영어 시험
- 준비 기간: 파트당 4~6개월
- 리스크 관리 분야 최고 권위 국제 자격

### 보험계리사
- 주관: 금융감독원
- 과목: 보험수학, 계리리스크관리, 경제학, 회계학, 보험법, 연금수학 등
- 합격률: 1차 10~20% / 2차 20~30% — 최고 난이도

## 추천 경력 경로

| 목표 | 추천 자격증 순서 |
|------|-----------------|
| 자산운용 전문가 | 투자자산운용사 → CFA L1 → L2 → L3 |
| 재무설계사 (PB·WM) | AFPK → CFP |
| 리스크 전문가 | 재무위험관리사 → FRM |
| 증권 애널리스트 | 투자자산운용사 → 금융투자분석사 → CFA |
| 금융투자 입문 | 펀드투자권유대행인 → 증권투자권유대행인 → 투자자산운용사 |

## 준비 전략
- 투자자산운용사: 금융투자교육원 인강 필수, 기출문제 반복 풀이
- CFA: Schweser Notes + 공식 Mock Exam, 스터디 그룹 병행
- AFPK: 한국FPSB 공식 교재, 모듈별 순차 합격 전략
- FRM: GARP 공식 교재 + Bionic Turtle 문제 은행
"""


def build_asset_counsel_prompt(message: str, history: List[Dict[str, str]]) -> str:
    history_block = "\n".join([f"- {h.get('role', 'user')}: {h.get('content', '')}" for h in history[-6:]])
    return f"""{ASSET_COUNSEL_SYSTEM}

아래 자격증 지식 데이터베이스를 최우선으로 활용하고, 알고 있는 추가 정보도 보완하세요.

{ASSET_COUNSEL_KNOWLEDGE}

답변 형식:
1. 추천 자격증 (우선순위 순)
2. 준비 기간 및 학습 방법
3. 취득 후 커리어 전망
4. 이번 달 실천 계획

[대화이력]
{history_block if history_block else '(없음)'}

[질문]
{message}
"""


def asset_counsel_fallback(message: str) -> str:
    msg_lower = message.lower()
    keyword_map = {
        ("cfa",): "CFA",
        ("frm", "재무위험",): "FRM",
        ("afpk", "cfp", "재무설계",): "AFPK/CFP",
        ("투자자산운용사",): "투자자산운용사",
        ("금융투자분석사", "애널리스트",): "금융투자분석사",
        ("펀드",): "펀드투자권유대행인",
        ("증권투자",): "증권투자권유대행인",
        ("보험계리",): "보험계리사",
    }
    matched = None
    for keys, label in keyword_map.items():
        if any(k in msg_lower for k in keys):
            matched = label
            break

    if matched:
        lines = [
            f"(LLM 미설정) '{matched}' 관련 기본 정보를 제공합니다.\n",
            "자세한 맞춤 상담을 위해 LLM 설정(.env의 LLM_PROVIDER)을 구성해 주세요.",
            "",
            "▶ 자격증 정보는 상단 지식 데이터베이스를 참고하세요.",
            "▶ 공식 정보: 한국금융투자협회 (https://license.kofia.or.kr)",
        ]
    else:
        lines = [
            "(LLM 미설정) 자산운용 자격증 안내를 드립니다.\n",
            "■ 국내 입문: 펀드투자권유대행인 → 증권투자권유대행인 → 투자자산운용사",
            "■ 재무설계: AFPK → CFP",
            "■ 국제 자격: CFA (운용), FRM (리스크)",
            "■ 고난이도: 금융투자분석사, 보험계리사",
            "",
            "LLM_PROVIDER를 설정하면 맞춤형 상담을 받을 수 있습니다.",
        ]
    return "\n".join(lines)


class AssetCounselRequest(BaseModel):
    message: str = Field(..., description="자산운용 자격증 관련 질문/상담 요청")
    history: List[Dict[str, str]] = Field(default_factory=list)


class AssetCounselResponse(BaseModel):
    answer: str
    mode: str = "asset_counsel"


@app.post("/asset-counsel/chat", response_model=AssetCounselResponse)
def asset_counsel_chat(req: AssetCounselRequest):
    prompt = build_asset_counsel_prompt(req.message, req.history)
    try:
        if LLM_PROVIDER == "ollama":
            answer = call_ollama(prompt)
        elif LLM_PROVIDER == "openai":
            answer = call_openai(prompt, system=ASSET_COUNSEL_SYSTEM)
        elif LLM_PROVIDER == "azure_openai":
            answer = call_azure_openai(prompt, system=ASSET_COUNSEL_SYSTEM)
        elif LLM_PROVIDER == "claude":
            answer = call_claude(
                "\n".join([
                    ASSET_COUNSEL_KNOWLEDGE,
                    "",
                    f"[대화이력]\n" + ("\n".join([f"- {h.get('role')}: {h.get('content')}" for h in req.history[-6:]]) or "(없음)"),
                    "",
                    f"[질문]\n{req.message}",
                ]),
                system=ASSET_COUNSEL_SYSTEM,
            )
        else:
            answer = asset_counsel_fallback(req.message)
    except Exception as exc:
        answer = f"오류가 발생했습니다: {exc}\n\nLLM 설정을 확인해 주세요."
    return AssetCounselResponse(answer=answer)


def fallback_answer(question: str, hits: List[Dict[str, Any]]) -> str:
    lines = ["(LLM 미설정) 데이터 기반 상담 참고 내용을 제공합니다.", f"질문: {question}", ""]
    lines.append("핵심 근거:")
    for i, h in enumerate(hits, start=1):
        text = re.sub(r"\s+", " ", h["payload"].get("text", "")).strip()
        lines.append(f"- [{i}] {text[:200]}{'...' if len(text) > 200 else ''}")
    lines.append("\n추천: 위 근거를 바탕으로 학생의 흥미/강점을 확인하고 직업체험 활동 1개를 이번 주에 실행하세요.")
    lines.append("[근거] " + ", ".join([f"[{i}]" for i in range(1, len(hits) + 1)]))
    return "\n".join(lines)


def run_chat(message: str, domain: Optional[str], top_k: int, history: List[Dict[str, str]]) -> ChatResponse:
    qvec = embed_query(message)
    used = "career_all"
    if domain:
        candidate = normalize_collection_name(domain)
        if collection_exists(candidate):
            used = candidate

    if not collection_exists(used):
        return ChatResponse(
            answer=(
                f"벡터 DB에 데이터가 없습니다 (컬렉션 '{used}' 미존재).\n\n"
                "다음 명령으로 데이터를 먼저 인제스트하세요:\n"
                "  python scripts/normalize.py --data-root ./DATA_ROOT --out-dir ./data\n"
                "  python scripts/index_qdrant.py --docs ./data/documents.jsonl"
            ),
            citations=[],
            used_collection=used,
        )

    hits = search_chunks(used, qvec, top_k)
    citations = []
    for h in hits:
        p = h["payload"]
        excerpt = re.sub(r"\s+", " ", (p.get("text") or "").strip())
        citations.append(
            Citation(
                doc_id=str(p.get("doc_id") or "unknown"),
                domain_name=str(p.get("domain_name") or "unknown"),
                source_spec=p.get("source_spec"),
                excerpt=excerpt[:420] + ("..." if len(excerpt) > 420 else ""),
            )
        )

    if not hits:
        return ChatResponse(answer="관련 근거를 찾지 못했습니다. 더 구체적인 학생 상황을 알려주세요.", citations=[], used_collection=used)

    prompt = build_prompt(message, history, hits)
    if LLM_PROVIDER == "ollama":
        answer = call_ollama(prompt)
    elif LLM_PROVIDER == "openai":
        answer = call_openai(prompt)
    elif LLM_PROVIDER == "azure_openai":
        answer = call_azure_openai(prompt)
    else:
        answer = fallback_answer(message, hits)

    return ChatResponse(answer=answer, citations=citations, used_collection=used)


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    return run_chat(req.message, req.domain, req.top_k, req.history)


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    res = run_chat(req.query, req.domain, req.top_k, [])
    return AskResponse(answer=res.answer, citations=res.citations, used_collection=res.used_collection)


@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "qdrant": QDRANT_URL,
        "embed_model": EMBED_MODEL,
        "llm_provider": LLM_PROVIDER,
        "azure_openai_endpoint": AZURE_OPENAI_ENDPOINT or "(not set)",
        "anthropic_model": ANTHROPIC_MODEL if LLM_PROVIDER == "claude" else "(not active)",
        "service": "student-career-counsel-chatbot",
    }


app.mount("/", StaticFiles(directory="web", html=True), name="web")
