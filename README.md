# AI 기반 학생 진로탐색 상담 시스템 (Chatbot RAG)

![alt text](image.png)

이 저장소는 `DATA_ROOT`의 학생 기초정보/상담기록/전문가 라벨링 데이터를 기반으로, **백엔드(FastAPI) + 프론트엔드(Web) 모두 챗봇 중심**으로 동작하는 진로상담 시스템입니다.

---

## 1. 시스템 개요

- **목표**: 학생의 흥미·강점·상담 맥락을 반영한 근거 기반 진로탐색 상담 제공
- **방식**: RAG(Retrieval-Augmented Generation)
  1. `DATA_ROOT` 원천/라벨링 데이터를 정규화
  2. 임베딩 후 Qdrant 벡터 검색 인덱스 구축
  3. `/chat` API로 문맥+근거 기반 답변 생성
  4. 프론트 챗 UI에서 멀티턴 상담 수행

---

## 2. 기술 스택 (상세)

### Backend
- **FastAPI**: REST API 서버 (`/chat`, `/ask`, `/healthz`)
- **Pydantic**: 요청/응답 스키마 검증
- **Sentence-Transformers (intfloat/multilingual-e5-small)**: 한글 질의/문서 임베딩
- **Qdrant**: 벡터 검색 DB (전체 + 도메인별 컬렉션)
- **LLM Provider (선택형)**
  - `none`: LLM 없이 근거 요약 기반 폴백 응답
  - `ollama`: 로컬 모델 연동
  - `openai`: OpenAI Chat Completions 연동
- **Python Requests**: Ollama HTTP 호출

### Data Pipeline
- `scripts/normalize.py`
  - `학생기초정보`, `상담기록`, `전문가_라벨링` JSON을 통합 파싱
  - `documents.jsonl`(검색 문서), `qas.jsonl`(평가용 QA) 생성
- `scripts/index_qdrant.py`
  - 문서 청킹(char 기반)
  - 임베딩 생성
  - `career_all` + `career_{domain}` 컬렉션 업서트

### Frontend
- **Vanilla JavaScript + TailwindCSS(CDN)**
- 챗 UI 기능
  - 멀티턴 대화 이력 전송
  - 도메인(학교급/카테고리) 필터
  - 빠른 질문 템플릿
  - 답변별 근거(citations) 표시

### Infra / Runtime
- **Docker Compose**: Qdrant 실행
- **Uvicorn**: FastAPI ASGI 서버 구동
- **python-dotenv**: `.env` 환경변수 로딩

---

## 3. 데이터 구조 가정

`DATA_ROOT` 예시:

```text
DATA_ROOT/
  01.원천데이터/
    01. 학교급/
      01. 초등/
      02. 중등/
      03. 고등/
  02.라벨링데이터/
    01. 학교급/
      01. 초등/
      02. 중등/
      03. 고등/
    02. 추천직업 카테고리/
      01. 기술계열/
      02. 서비스계열/
      03. 생산계열/
      04. 사무계열/
```

---

## 4. 실행 방법

### 4-1. 의존성 설치

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### 4-2. Qdrant 실행

```bash
docker compose up -d qdrant
```

### 4-3. 데이터 정규화

```bash
python3 scripts/normalize.py --data-root DATA_ROOT --out-dir data
```

### 4-4. 임베딩/인덱싱

```bash
python3 scripts/index_qdrant.py --docs data/documents.jsonl
```

### 4-5. API + 웹 실행

```bash
uvicorn api.main:app --reload --port 8000
```

브라우저: `http://localhost:8000`

---

## 5. API 요약

### POST `/chat`
멀티턴 상담 챗 API

요청 예시:
```json
{
  "message": "이 학생에게 맞는 진로를 제안해줘",
  "domain": "01. 학교급 / 03. 고등",
  "top_k": 5,
  "history": [
    {"role": "user", "content": "학생은 만들기 활동을 좋아해"}
  ]
}
```

응답: `answer`, `citations[]`, `used_collection`

### POST `/ask`
단일 질의 호환 API (`query` 기반)

### GET `/healthz`
헬스체크 + 설정 확인

---

## 6. LLM 환경변수

`.env` 예시:

```env
QDRANT_URL=http://localhost:6333
EMBED_MODEL=intfloat/multilingual-e5-small

# none | ollama | openai
LLM_PROVIDER=none

# ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

---

## 7. 운영 시 권장사항

- 상담 데이터는 민감정보 가능성이 있어 비식별화/접근통제가 필요합니다.
- LLM 생성 답변은 보조 의견이며, 실제 진학/진로 결정은 교사·상담사와 함께 검토해야 합니다.
- 학교급/직업카테고리별 분리 인덱스로 검색 품질을 점검하세요.

---

## 8. Azure 인프라 구성

### 8-1. 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                Azure Resource Group                  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │         Azure Container Apps Environment     │   │
│  │                                              │   │
│  │  ┌─────────────────┐  ┌──────────────────┐  │   │
│  │  │  API Container  │  │ Qdrant Container │  │   │
│  │  │  (FastAPI+Web)  │──│  (내부 전용)     │  │   │
│  │  │  port 8000      │  │  port 6333       │  │   │
│  │  └────────┬────────┘  └────────┬─────────┘  │   │
│  └───────────┼────────────────────┼────────────┘   │
│              │ (공개)             │                 │
│   ┌──────────┴──────┐  ┌──────────┴──────┐         │
│   │  Azure Container│  │  Azure Storage  │         │
│   │  Registry (ACR) │  │  (Blob: data/   │         │
│   └─────────────────┘  │   Files: qdrant)│         │
│                         └─────────────────┘         │
│   ┌─────────────────┐  ┌─────────────────┐          │
│   │   Key Vault     │  │ Log Analytics   │          │
│   │ (API Keys 보관) │  │  (모니터링)     │          │
│   └─────────────────┘  └─────────────────┘          │
└─────────────────────────────────────────────────────┘
```

| Azure 서비스 | 용도 |
|---|---|
| **Container Apps** | FastAPI API + Qdrant 컨테이너 실행 (서버리스) |
| **Container Registry (ACR)** | Docker 이미지 저장 |
| **Storage Account** | Qdrant 영구 스토리지(Azure Files), DATA_ROOT(Blob) |
| **Key Vault** | OpenAI / Azure OpenAI API 키 안전 보관 |
| **Log Analytics** | 컨테이너 로그 수집 및 모니터링 |

### 8-2. 사전 요구사항

- [Azure CLI](https://learn.microsoft.com/ko-kr/cli/azure/install-azure-cli) 설치
- [Azure Developer CLI (azd)](https://learn.microsoft.com/ko-kr/azure/developer/azure-developer-cli/install-azd) 설치 (선택)
- Azure 구독 및 리소스 그룹

### 8-3. Azure Developer CLI로 배포 (권장)

```bash
# 로그인
azd auth login

# 초기화 (처음 한 번)
azd init

# 인프라 프로비저닝 + 이미지 빌드/배포 (한 번에)
azd up
```

### 8-4. 수동 배포 (Bicep + Azure CLI)

```bash
# 1. Azure 로그인
az login
az account set --subscription <SUBSCRIPTION_ID>

# 2. 리소스 그룹 생성
az group create --name rg-aicounsel-prod --location koreacentral

# 3. 인프라 배포
az deployment group create \
  --resource-group rg-aicounsel-prod \
  --template-file infra/main.bicep \
  --parameters environmentName=prod llmProvider=none

# 4. ACR 로그인 서버 확인
ACR_SERVER=$(az deployment group show \
  --resource-group rg-aicounsel-prod \
  --name main \
  --query properties.outputs.acrLoginServer.value -o tsv)

# 5. Docker 이미지 빌드 & 푸시
az acr login --name $ACR_SERVER
docker build -t $ACR_SERVER/ai-korean-education-counsel:latest .
docker push $ACR_SERVER/ai-korean-education-counsel:latest

# 6. API URL 확인
az deployment group show \
  --resource-group rg-aicounsel-prod \
  --name main \
  --query properties.outputs.apiUrl.value -o tsv
```

### 8-5. GitHub Actions CI/CD 설정

`.github/workflows/azure-deploy.yml`이 `main` 브랜치 push 시 자동 배포합니다.

**필요한 GitHub Secrets:**

| Secret 이름 | 설명 |
|---|---|
| `AZURE_CLIENT_ID` | OIDC 앱 클라이언트 ID |
| `AZURE_TENANT_ID` | Azure 테넌트 ID |
| `AZURE_SUBSCRIPTION_ID` | Azure 구독 ID |
| `AZURE_RESOURCE_GROUP` | 배포 대상 리소스 그룹 이름 |
| `ACR_LOGIN_SERVER` | ACR 로그인 서버 주소 (`<name>.azurecr.io`) |
| `LLM_PROVIDER` | LLM 프로바이더 (none/openai/azure_openai) |
| `OPENAI_API_KEY` | OpenAI API 키 (openai 사용 시) |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI 엔드포인트 URL |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API 키 |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI 배포 이름 |

**OIDC 페더레이션 자격 증명 설정:**

```bash
# 서비스 주체 생성
az ad app create --display-name "aicounsel-github-actions"
APP_ID=$(az ad app list --display-name "aicounsel-github-actions" --query [0].appId -o tsv)
az ad sp create --id $APP_ID

# 리소스 그룹에 Contributor 역할 부여
az role assignment create \
  --assignee $APP_ID \
  --role Contributor \
  --scope /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RESOURCE_GROUP>

# GitHub OIDC 페더레이션 자격 증명 추가 (Azure Portal 또는 CLI)
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<ORG>/<REPO>:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

### 8-6. Azure OpenAI LLM 사용

`LLM_PROVIDER=azure_openai` 설정 시 Azure OpenAI Service를 사용합니다.

```env
LLM_PROVIDER=azure_openai
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-02-01
```

### 8-7. DATA_ROOT 데이터 업로드 (Azure Blob Storage)

```bash
# Storage Account 이름 확인
STORAGE_NAME=$(az deployment group show \
  --resource-group rg-aicounsel-prod \
  --name main \
  --query properties.outputs.storageAccountName.value -o tsv)

# DATA_ROOT 업로드
az storage blob upload-batch \
  --source DATA_ROOT \
  --destination data \
  --account-name $STORAGE_NAME \
  --pattern "**/*.json"
```

### 8-8. 로컬 개발 vs Azure 환경 비교

| 항목 | 로컬 | Azure |
|---|---|---|
| Qdrant | Docker Compose | Container Apps (내부) |
| API 서버 | uvicorn (localhost:8000) | Container Apps (공개 HTTPS) |
| 데이터 저장 | 로컬 파일시스템 | Azure Blob Storage |
| Qdrant 데이터 | Docker Volume | Azure Files |
| 시크릿 관리 | `.env` 파일 | Azure Key Vault |
