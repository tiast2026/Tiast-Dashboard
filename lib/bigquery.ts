import { BigQuery } from '@google-cloud/bigquery'

let client: BigQuery | null = null

export function getBigQueryClient(): BigQuery {
  if (client) return client

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (!credentialsJson) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable is not set')
  }

  const credentials = JSON.parse(credentialsJson)

  client = new BigQuery({
    projectId: 'tiast-data-platform',
    credentials,
    location: 'asia-northeast1',
  })

  return client
}

const DATASET = 'analytics_mart'
const PROJECT = 'tiast-data-platform'

export function tableName(name: string): string {
  return `\`${PROJECT}.${DATASET}.${name}\``
}

export async function runQuery<T = Record<string, unknown>>(
  query: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const bq = getBigQueryClient()
  const [rows] = await bq.query({
    query,
    params,
    location: 'asia-northeast1',
  })
  return rows as T[]
}
