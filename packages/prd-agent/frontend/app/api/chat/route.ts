import { NextRequest, NextResponse } from 'next/server';

const PRD_AGENT_URL = process.env.PRD_AGENT_URL;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, settings } = body;
    
    // Build comprehensive context from conversation history
    const conversationContext = buildConversationContext(messages);
    
    // Check if there's an existing PRD to edit
    const existingPRD = getPRDFromMessages(messages);
    const isEdit = existingPRD !== null;
    
    // Call the appropriate PRD agent endpoint
    const endpoint = isEdit ? '/prd/edit' : '/prd';
    const payload = isEdit 
      ? { message: conversationContext, existingPRD, settings }
      : { message: conversationContext, settings };
    
    const fullUrl = `${PRD_AGENT_URL}${endpoint}`;
    console.log('Making request to:', fullUrl);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error: ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Handle clarification questions
    if (data.needsClarification) {
      const questionsText = data.questions.map((q: string, index: number) => 
        `**${index + 1}. ${q}**`
      ).join('\n\n');
      
      const confidenceNote = data.confidence !== undefined ? 
        `\n\n*Confidence: ${data.confidence}% - focusing on critical gaps only*` : '';
      
      const content = `I need more information to create a comprehensive PRD. Please help me understand:\n\n${questionsText}${confidenceNote}\n\nPlease provide as much detail as possible for each area.`;
      
      return NextResponse.json({ content, clarificationQuestions: data.questions });
    }
    
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

function buildConversationContext(messages: any[]): string {
  // Filter to user messages only and build accumulated context
  const userMessages = messages.filter((msg: any) => msg.role === 'user');
  
  if (userMessages.length === 1) {
    // Single message, return as-is
    return userMessages[0].content;
  }
  
  // Multiple messages - accumulate context intelligently
  const originalRequest = userMessages[0].content;
  const clarificationResponses = userMessages.slice(1);
  
  // Check if we have clarification responses
  if (clarificationResponses.length === 0) {
    return originalRequest;
  }
  
  // Build comprehensive context
  let context = `Original Request: ${originalRequest}\n\n`;
  context += `Additional Context from Clarifications:\n`;
  
  clarificationResponses.forEach((msg: any, index: number) => {
    context += `${index + 1}. ${msg.content}\n`;
  });
  
  context += `\nPlease create a PRD that incorporates both the original request and all the additional context provided above.`;
  
  return context;
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