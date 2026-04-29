// ============================================================
// AI Korean Education Counsel – Azure Infrastructure
// 대상 서비스: Azure Container Apps (API + Qdrant),
//             Azure Container Registry, Azure Storage Account,
//             Azure Key Vault, Log Analytics Workspace
// ============================================================

@description('배포 지역. 기본값은 리소스 그룹 위치.')
param location string = resourceGroup().location

@description('환경 이름 (dev | staging | prod)')
@allowed(['dev', 'staging', 'prod'])
param environmentName string = 'prod'

@description('배포할 컨테이너 이미지 태그')
param imageTag string = 'latest'

@description('LLM 프로바이더 선택: none | openai | azure_openai')
@allowed(['none', 'openai', 'azure_openai'])
param llmProvider string = 'none'

@description('Azure OpenAI 엔드포인트 (llmProvider가 azure_openai일 때 필수)')
param azureOpenAIEndpoint string = ''

@description('Azure OpenAI 배포 이름')
param azureOpenAIDeployment string = 'gpt-4o-mini'

@description('OpenAI API 키 (openai 프로바이더 사용 시). Key Vault에 저장됨.')
@secure()
param openAIApiKey string = ''

@description('Azure OpenAI API 키 (azure_openai 프로바이더 사용 시). Key Vault에 저장됨.')
@secure()
param azureOpenAIApiKey string = ''

// ─── 명명 규칙 ───────────────────────────────────────────────
var prefix = 'aicounsel'
var suffix = uniqueString(resourceGroup().id)
var acrName = '${prefix}acr${suffix}'
var storageAccountName = take('${prefix}st${suffix}', 24)
var keyVaultName = take('${prefix}kv${suffix}', 24)
var logAnalyticsName = '${prefix}-logs-${environmentName}'
var containerAppsEnvName = '${prefix}-env-${environmentName}'
var qdrantAppName = '${prefix}-qdrant-${environmentName}'
var apiAppName = '${prefix}-api-${environmentName}'

// ─── Log Analytics Workspace ─────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ─── Azure Container Registry ────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: true
  }
}

// ─── Storage Account (DATA_ROOT + Qdrant 영구 스토리지) ───────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource dataContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'data'
  properties: { publicAccess: 'None' }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource qdrantShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: 'qdrant-data'
  properties: { shareQuota: 10 }
}

// ─── Key Vault ───────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

resource openAIApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(openAIApiKey)) {
  parent: keyVault
  name: 'openai-api-key'
  properties: { value: openAIApiKey }
}

resource azureOpenAIApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(azureOpenAIApiKey)) {
  parent: keyVault
  name: 'azure-openai-api-key'
  properties: { value: azureOpenAIApiKey }
}

// ─── Container Apps Environment ──────────────────────────────
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Qdrant 데이터를 Azure Files에 마운트
resource qdrantStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerAppsEnv
  name: 'qdrant-storage'
  properties: {
    azureFile: {
      accountName: storageAccount.name
      accountKey: storageAccount.listKeys().keys[0].value
      shareName: qdrantShare.name
      accessMode: 'ReadWrite'
    }
  }
}

// ─── Qdrant Container App (내부 전용) ────────────────────────
resource qdrantApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: qdrantAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: false
        targetPort: 6333
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'qdrant'
          image: 'qdrant/qdrant:v1.11.3'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: [
            {
              volumeName: 'qdrant-storage'
              mountPath: '/qdrant/storage'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
      volumes: [
        {
          name: 'qdrant-storage'
          storageType: 'AzureFile'
          storageName: 'qdrant-storage'
        }
      ]
    }
  }
  dependsOn: [qdrantStorage]
}

// Qdrant 내부 URL (같은 환경 내 Container App 간 통신)
var qdrantInternalUrl = 'http://${qdrantAppName}.${containerAppsEnv.properties.defaultDomain}'

// ─── API Container App ───────────────────────────────────────
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'openai-api-key'
          value: openAIApiKey
        }
        {
          name: 'azure-openai-api-key'
          value: azureOpenAIApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acr.properties.loginServer}/ai-korean-education-counsel:${imageTag}'
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'QDRANT_URL', value: qdrantInternalUrl }
            { name: 'EMBED_MODEL', value: 'intfloat/multilingual-e5-small' }
            { name: 'LLM_PROVIDER', value: llmProvider }
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAIEndpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAIDeployment }
            { name: 'OPENAI_MODEL', value: 'gpt-4o-mini' }
            {
              name: 'OPENAI_API_KEY'
              secretRef: 'openai-api-key'
            }
            {
              name: 'AZURE_OPENAI_API_KEY'
              secretRef: 'azure-openai-api-key'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scale-rule'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [qdrantApp]
}

// ─── Outputs ─────────────────────────────────────────────────
@description('API 공개 URL')
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'

@description('ACR 로그인 서버')
output acrLoginServer string = acr.properties.loginServer

@description('스토리지 계정 이름')
output storageAccountName string = storageAccount.name

@description('Key Vault 이름')
output keyVaultName string = keyVault.name

@description('Qdrant 내부 URL')
output qdrantInternalUrl string = qdrantInternalUrl
