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

export function isBigQueryConfigured(): boolean {
  return !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
}

/**
 * Convert BigQuery NUMERIC/BIGNUMERIC string values to JavaScript numbers.
 * BigQuery returns NUMERIC columns as strings to preserve precision,
 * but our dashboard values are safe to convert to JS numbers.
 */
function convertNumericStrings<T>(row: Record<string, unknown>): T {
  const converted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
      converted[key] = Number(value)
    } else {
      converted[key] = value
    }
  }
  return converted as T
}

export async function runQuery<T = Record<string, unknown>>(
  query: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  if (!isBigQueryConfigured()) {
    return []
  }
  const bq = getBigQueryClient()
  const [rows] = await bq.query({
    query,
    params,
    location: 'asia-northeast1',
  })
  return (rows as Record<string, unknown>[]).map((row) => convertNumericStrings<T>(row))
}
