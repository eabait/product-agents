import type {
  WebSearchAdapter,
  WebSearchResult,
  WebSearchOptions,
  TavilySearchResponse
} from './web-search-types'

export interface TavilySearchAdapterOptions {
  apiKey: string
  baseUrl?: string
  defaultSearchDepth?: 'basic' | 'advanced'
  defaultMaxResults?: number
  timeout?: number
}

export class TavilySearchAdapter implements WebSearchAdapter {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly defaultSearchDepth: 'basic' | 'advanced'
  private readonly defaultMaxResults: number
  private readonly timeout: number

  constructor(options: TavilySearchAdapterOptions) {
    if (!options.apiKey) {
      throw new Error('Tavily API key is required')
    }
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? 'https://api.tavily.com/search'
    this.defaultSearchDepth = options.defaultSearchDepth ?? 'advanced'
    this.defaultMaxResults = options.defaultMaxResults ?? 10
    this.timeout = options.timeout ?? 30000
  }

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    if (!query || query.trim().length === 0) {
      return []
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const requestBody = {
        api_key: this.apiKey,
        query: query.trim(),
        search_depth: options?.searchDepth ?? this.defaultSearchDepth,
        max_results: options?.maxResults ?? this.defaultMaxResults,
        include_answer: options?.includeAnswer ?? false,
        include_raw_content: options?.includeRawContent ?? false,
        ...(options?.includeDomains?.length && { include_domains: options.includeDomains }),
        ...(options?.excludeDomains?.length && { exclude_domains: options.excludeDomains })
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(`Tavily API error (${response.status}): ${errorText}`)
      }

      const data = (await response.json()) as TavilySearchResponse
      const retrievedAt = new Date().toISOString()

      return (data.results ?? []).map(result => ({
        url: result.url,
        title: result.title,
        content: result.content,
        score: result.score,
        publishedDate: result.published_date,
        retrievedAt
      }))
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Tavily search timed out after ${this.timeout}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  getProviderName(): string {
    return 'tavily'
  }
}

export function createTavilySearchAdapter(
  apiKeyOrOptions: string | TavilySearchAdapterOptions
): TavilySearchAdapter {
  const options =
    typeof apiKeyOrOptions === 'string' ? { apiKey: apiKeyOrOptions } : apiKeyOrOptions

  return new TavilySearchAdapter(options)
}
