export interface WebSearchResult {
  url: string
  title: string
  content: string
  score?: number
  publishedDate?: string
  retrievedAt: string
}

export interface WebSearchOptions {
  maxResults?: number
  searchDepth?: 'basic' | 'advanced'
  includeDomains?: string[]
  excludeDomains?: string[]
  includeAnswer?: boolean
  includeRawContent?: boolean
}

export interface WebSearchAdapter {
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>
  getProviderName(): string
}

export interface TavilySearchResponse {
  query: string
  answer?: string
  results: Array<{
    url: string
    title: string
    content: string
    score: number
    published_date?: string
    raw_content?: string
  }>
  response_time?: number
}
