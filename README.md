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

---

# 벡터 데이터베이스(Vector DB)의 핵심 개념 이해

벡터 데이터베이스(Vector DB)는 대규모 고차원 벡터 데이터를 빠르게 검색하기 위해 설계된 특수 데이터베이스입니다. 

기존의 관계형 데이터베이스(RDB)가 숫자나 텍스트의 '정확한 일치'를 찾는다면, 벡터 DB는 데이터 간의 **'유사도(Similarity)'**를 계산합니다. 이 과정에서 핵심이 되는 **컬렉션, 인덱싱**의 개념과 **인덱싱에 시간이 오래 걸리는 이유**를 아래와 같이 정리합니다.

---

## 1. 컬렉션 (Collection) 이란?

개념적으로 관계형 데이터베이스(RDB)의 **'테이블(Table)'**과 유사한 단위입니다.

* **역할:** 서로 유사한 목적이나 도메인을 가진 벡터 데이터와 메타데이터를 하나로 묶어놓은 저장소입니다. 예를 들어, '사용자 프로필 벡터 컬렉션', '상품 이미지 벡터 컬렉션'처럼 용도에 따라 분리하여 관리합니다.
* **구성:** 하나의 컬렉션 안에는 실제 벡터 데이터(Embedding Vector)와 각 벡터의 고유 ID, 그리고 검색 결과를 필터링할 때 사용하는 메타데이터(예: 카테고리, 날짜, 작성자 등)가 함께 저장됩니다. 컬렉션을 생성할 때는 보통 **벡터의 차원 수(Dimension)**와 유사도 측정 방식(예: 코사인 유사도, 유클리드 거리, 내적 등)을 미리 정의해야 합니다.

---

## 2. 인덱싱 (Indexing) 이란?

벡터 DB에서 인덱싱은 **"고차원 공간에서 초고속 검색을 위한 지름길(지도)을 만드는 과정"**입니다.

텍스트나 숫자는 크고 작음이 명확해 정렬(Sorting)하기 쉽지만, 수백~수천 차원의 벡터는 공간상에서 어디가 가깝고 먼지 한눈에 알기 어렵습니다. 인덱싱이 없다면 특정 벡터와 가장 유사한 것을 찾기 위해 컬렉션 내의 **모든 벡터와 일일이 유사도를 계산(전수 조사, Flat Search)**해야 하므로 데이터가 많아질수록 속도가 급격히 느려집니다.

이를 방지하기 위해, 벡터들을 고차원 공간상에서 미리 그룹화하거나 트리 구조, 그래프 구조로 엮어놓는 작업을 인덱싱이라고 합니다. 대표적으로 HNSW(Hierarchical Navigable Small World), IVFFlat, Annoy 등의 알고리즘이 사용됩니다.

---

## 3. 벡터 인덱싱이 유독 시간이 오래 걸리는 이유

전통적인 RDB의 인덱싱(B-Tree 등)에 비해, 벡터 DB의 인덱싱(특히 HNSW 같은 그래프 기반 방식)은 **비교가 불가능할 정도로 많은 연산량과 메모리를 요구**합니다. 그 이유는 다음과 같습니다.

### ① '정확한 매칭'이 아닌 '근사치(ANN)'를 위한 고차원 연산
벡터 DB는 완벽한 정답을 찾으려면 시간이 너무 오래 걸리기 때문에, 대안으로 **ANN(Approximate Nearest Neighbor, 근사 최근접 이웃)** 알고리즘을 씁니다. 적당히 가장 가까운 데이터들을 빠르게 찾겠다는 전략입니다. 
하지만 이 '적당한 지름길 지도'를 만들기 위해서 인덱싱 단계에서 수행해야 하는 차원 연산(예: LLM 임베딩에 쓰이는 1536차원의 벡터 공간 계산)이 수학적으로 엄청나게 무겁습니다.

### ② 고차원의 저주 (Curse of Dimensionality)
차원이 높아질수록 공간의 부피가 기하급수적으로 커지고 데이터 사이의 거리가 거의 비슷해지는 현상이 발생합니다. 2차원이나 3차원 공간에서 점들의 거리를 계산하는 것과, 1024차원 이상의 초고차원 공간에서 점들 간의 촘촘한 경계선을 나누고 효율적인 검색 그룹을 구성하는 것은 차원이 다른 연산 비용이 듭니다.

### ③ 복잡한 그래프 구조 생성 및 재조정 (HNSW 예시)
현재 가장 많이 쓰이는 HNSW 인덱싱의 경우, 벡터들을 다층 레이어의 **그래프(노드와 간선)** 구조로 연결합니다.
* 새로운 벡터 데이터가 들어올 때마다, 기존에 있던 수천만 개의 벡터 중 어떤 벡터와 '선(Edge)'을 연결해야 검색할 때 가장 효율적일지 주변 공간을 끊임없이 탐색하고 비교해야 합니다.
* 데이터가 대량으로 추가될 때마다 기존 그래프 구조를 깨고 다시 최적의 경로 선을 연결하는 재조정 작업이 수없이 반복되므로 시간이 오래 걸립니다.

### ④ 대량의 메모리(RAM)와 CPU 연산 집중
인덱스를 구축할 때는 데이터들을 계속 비교해가며 공간을 재구성해야 하므로, 디스크가 아닌 **메모리 상에서 대부분의 연산이 처리**됩니다. 데이터 집합이 수백만, 수천만 건으로 커지면 memory-intensive한 작업 특성상 메모리 부족 현상과 함께 CPU/GPU의 엄청난 연산 오버헤드가 발생하여 인덱싱 시간이 몇 시간에서, 대규모일 경우 며칠씩 걸리기도 합니다.

---

## 요약

* **컬렉션(Collection):** 벡터 데이터를 저장하는 논리적 방(RDB의 테이블 개념).
* **인덱싱(Indexing):** 초고속 유사도 검색을 위해 벡터 간의 지름길 지도를 그리는 작업.
* **지연 원인:** 수천 차원의 거대한 공간 안에서 수많은 벡터를 서로 비교하고, 최적의 그래프 또는 그룹으로 묶어주는 **수학적 연산량이 상상을 초월할 정도로 방대하기 때문**입니다.

---

# LLM에서의 Ingest와 Pipeline 이해하기

## 1. Ingest (데이터 수집/주입)란?
LLM(대형 언어 모델)에서 **Ingest(인제스트)**는 모델이 활용할 수 있도록 **외부 데이터를 시스템 내부로 읽어 들이고 가공하는 전체 과정**을 의미합니다. 

쉽게 말해, LLM에게 특정 문서나 데이터를 주고 **"이 내용 참고해서 답변해 줘"라고 하기 전에, 그 데이터를 LLM이 이해할 수 있는 형태로 집어넣는 단계**입니다. 이 개념은 주로 기업 내부 데이터나 특정 문서와 연동하는 **RAG(Retrieval-Augmented Generation, 검색 증강 생성)** 시스템에서 핵심적으로 다뤄집니다.

### 🛠️ Data Ingestion의 주요 단계
```
[원본 데이터] ➔ [텍스트 추출] ➔ [텍스트 분할 (Chunking)] ➔ [벡터 변환 (Embedding)] ➔ [벡터 DB 저장]
```
1. **데이터 수집 및 추출 (Load & Extract):** PDF, Word, 웹페이지, SQL 등 다양한 형태의 원본 데이터에서 순수한 텍스트를 추출합니다.
2. **텍스트 분할 (Chunking):** LLM이 한 번에 읽기 적절한 의미 있는 단위(예: 300~500자 정도의 문단)로 쪼갭니다.
3. **임베딩 변환 (Embedding):** 쪼갠 텍스트를 AI가 계산할 수 있는 숫자의 배열(벡터)로 변환하여 컴퓨터가 문장의 '의미'를 이해하도록 합니다.
4. **저장 (Vector Database):** 변환된 벡터 데이터를 언제든 빠르게 검색할 수 있도록 벡터 데이터베이스에 저장합니다.

---

## 2. Ingest와 Pipeline의 핵심 차이

결론부터 말씀드리면, **Ingest는 파이프라인의 '첫 단추(시작 지점)'**이고, **파이프라인은 Ingest를 포함한 '전체 여정(과정)'**을 의미합니다.

### 🔍 직관적인 비유 (공장의 정수 시스템)
* **Ingest (입구):** 강물이나 지하수를 펌프로 **공장 안으로 끌어들이는 행위 자체**입니다. 어디서, 어떻게 데이터를 가져올 것인가에 초점을 맞춤니다.
* **Pipeline (전체 배관 시스템):** 물을 끌어와서(Ingest) ➔ 필터로 모래를 걸러내고(Chunking) ➔ 소독을 한 뒤(Embedding) ➔ 깨끗한 물탱크에 저장(Vector DB)하여 소비자가 마실 수 있게 하는 **모든 연결 통로와 자동화 과정**을 뜻합니다.

### 📊 비교 요약표

| 구분 | Ingest (데이터 주입) | Pipeline (파이프라인) |
| :--- | :--- | :--- |
| **정의** | 외부 데이터를 시스템 내부로 **들여오는 행위** | 데이터가 이동하고 변환되는 **전체 흐름과 시스템** |
| **범위** | 데이터 소스 연결 ➔ 데이터 읽기 (전체 공정의 1단계) | Ingest ➔ 가공(Chunking) ➔ 변환(Embedding) ➔ 저장(Vector DB) ➔ 모니터링 |
| **초점** | **"무엇을, 어디서 가져올 것인가?"** | **"데이터를 어떻게 가공하여 최종 목적지까지 자동화되게 보낼 것인가?"** |
| **LLM 예시** | Notion이나 Slack의 대화 데이터를 API로 긁어오는 단계 | 긁어온 데이터를 쪼개고, 임베딩하여, 벡터 DB에 저장하기까지의 **자동화된 전 과정** |

---

## 3. LLM(RAG) 문맥에서의 구체적인 차이 표현

* **"데이터를 Ingest 한다"**
  * "우리 회사 매뉴얼 PDF 파일들을 AI 시스템에 **집어넣는 작업**을 해야 해."
  * 데이터의 소스(출처)를 연결하고 이를 시스템이 읽을 수 있도록 수집하는 행위 그 자체에 집중하는 표현입니다.
* **"데이터 파이프라인을 구축한다"**
  * "사용자가 매뉴얼을 새로 업로드할 때마다, 자동으로 텍스트를 추출하고 300자씩 쪼개서 임베딩한 뒤 DB에 업데이트해 주는 **자동화 시스템을 만들어야 해.**"
  * 수집부터 최종 저장까지 데이터가 멈추지 않고 흘러가도록 만드는 전체 파이프라인을 의미합니다.

> 💡 **요약하자면**
> **Ingest**는 파이프라인이라는 거대한 고속도로의 **'톨게이트(진입로)'** 역할을 하는 핵심 단계입니다.