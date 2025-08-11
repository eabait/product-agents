import { NextRequest, NextResponse } from 'next/server';

const PRD_AGENT_URL = process.env.PRD_AGENT_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body;
    
    // Convert AI SDK messages to the format expected by the PRD agent
    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage.content;
    
    // Check if we're dealing with a PRD conversation by looking at previous messages
    const hasPRDContent = messages.some((msg: any) => {
      try {
        const parsed = JSON.parse(msg.content);
        return parsed && typeof parsed.problemStatement === 'string';
      } catch {
        return false;
      }
    });
    
    const existingPRD = hasPRDContent ? getPRDFromMessages(messages) : null;
    const isEdit = existingPRD !== null;
    
    // Call the actual PRD agent backend
    const endpoint = isEdit ? '/prd/edit' : '/prd';
    const payload = isEdit 
      ? { message: userMessage, existingPRD }
      : { message: userMessage };
    
    const response = await fetch(`${PRD_AGENT_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error: ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Return the response in a simple JSON format
    const content = data.prd ? JSON.stringify(data.prd, null, 2) : data.message || JSON.stringify(data);
    
    return NextResponse.json({ content });
    
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process request'
      }, 
      { status: 500 }
    );
  }
}

function getPRDFromMessages(messages: any[]): any {
  // Look for the most recent PRD content in the conversation
  for (let i = messages.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(messages[i].content);
      if (parsed && typeof parsed.problemStatement === 'string') {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}