import { NextRequest, NextResponse } from 'next/server'

const PRD_AGENT_URL = process.env.PRD_AGENT_URL || 'http://localhost:3001'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, existingPRD, isEdit } = body
    
    // Determine endpoint and payload based on operation type
    const endpoint = isEdit ? '/prd/edit' : '/prd'
    const payload = isEdit 
      ? { message, existingPRD }
      : { message }
    
    const response = await fetch(`${PRD_AGENT_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend error: ${response.statusText} - ${errorText}`)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('API route error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process request'
      }, 
      { status: 500 }
    )
  }
}