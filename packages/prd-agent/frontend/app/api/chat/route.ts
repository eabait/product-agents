import { NextRequest, NextResponse } from 'next/server';

const PRD_AGENT_URL = process.env.PRD_AGENT_URL;

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] === NEW REQUEST ===`);
  console.log(`[${requestId}] Timestamp:`, new Date().toISOString());
  
  try {
    const body = await request.json();
    const { messages, settings, contextPayload, targetSections } = body;
    
    console.log(`[${requestId}] Request body structure:`, {
      messagesCount: messages?.length || 0,
      hasSettings: !!settings,
      hasContextPayload: !!contextPayload,
      targetSections: targetSections,
      settingsKeys: settings ? Object.keys(settings) : [],
      contextPayloadKeys: contextPayload ? Object.keys(contextPayload) : []
    });
    
    console.log(`[${requestId}] Messages:`, messages?.map((msg, idx) => ({
      index: idx,
      id: msg.id,
      role: msg.role,
      contentLength: msg.content?.length || 0,
      contentPreview: msg.content?.substring(0, 100) + (msg.content?.length > 100 ? '...' : ''),
      timestamp: msg.timestamp
    })));
    
    // Check if there's an existing PRD to edit
    const existingPRD = getPRDFromMessages(messages);
    const isEdit = existingPRD !== null;
    
    console.log(`[${requestId}] PRD Analysis:`, {
      hasExistingPRD: !!existingPRD,
      isEditMode: isEdit,
      existingPRDPreview: existingPRD ? JSON.stringify(existingPRD).substring(0, 200) + '...' : null
    });
    
    // Extract the user's latest message content for the backend
    const latestUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    console.log(`[${requestId}] Latest user message:`, {
      content: latestUserMessage,
      length: latestUserMessage.length
    });
    
    // Log context payload details
    if (contextPayload) {
      console.log(`[${requestId}] Context payload details:`, {
        categorizedContextItems: contextPayload.categorizedContext?.length || 0,
        selectedMessages: contextPayload.selectedMessages?.length || 0,
        currentPRD: !!contextPayload.currentPRD,
        tokenLimitPercentage: contextPayload.contextSettings?.tokenLimitPercentage || 30,
        categorizedContextPreview: contextPayload.categorizedContext?.map(item => ({
          title: item.title,
          category: item.category,
          priority: item.priority,
          contentLength: item.content?.length || 0
        })),
        selectedMessagesPreview: contextPayload.selectedMessages?.map(msg => ({
          id: msg.id,
          role: msg.role,
          contentLength: msg.content?.length || 0
        }))
      });
    } else {
      console.log(`[${requestId}] No context payload provided`);
    }
    
    // Use section-aware endpoints for all operations
    let endpoint: string;
    let payload: any;

    if (targetSections && targetSections.length === 1) {
      // Single section update
      endpoint = `/prd/section/${targetSections[0]}`;
      payload = {
        message: buildConversationContext(messages),
        settings,
        contextPayload,
        ...(existingPRD && { existingPRD }),
        conversationHistory: messages
      };
    } else if (targetSections && targetSections.length > 1) {
      // Multiple sections update
      endpoint = '/prd/sections';
      payload = {
        message: buildConversationContext(messages),
        settings,
        contextPayload,
        ...(existingPRD && { existingPRD }),
        targetSections,
        conversationHistory: messages
      };
    } else {
      // Full PRD generation or edit (use main endpoint)
      endpoint = isEdit ? '/prd/edit' : '/prd';
      payload = {
        message: buildConversationContext(messages),
        settings,
        contextPayload,
        ...(existingPRD && { existingPRD }),
        conversationHistory: messages
      };
    }
    
    const fullUrl = `${PRD_AGENT_URL}${endpoint}`;
    console.log(`[${requestId}] Backend request:`, {
      url: fullUrl,
      endpoint: endpoint,
      isEdit: isEdit,
      targetSections: targetSections,
      messageLength: payload.message.length,
      hasExistingPRD: !!payload.existingPRD,
      settings: payload.settings
    });
    
    console.log(`[${requestId}] Full payload being sent to backend:`, JSON.stringify(payload, null, 2));
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log(`[${requestId}] Backend response status:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[${requestId}] Backend error response:`, errorText);
      throw new Error(`Backend error: ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`[${requestId}] Backend response data:`, {
      hasContent: !!data.content,
      contentLength: data.content?.length || 0,
      contentPreview: data.content?.substring(0, 200) + (data.content?.length > 200 ? '...' : ''),
      needsClarification: !!data.needsClarification,
      questionsCount: data.questions?.length || 0,
      confidence: data.confidence,
      otherKeys: Object.keys(data).filter(k => !['content', 'needsClarification', 'questions', 'confidence'].includes(k))
    });
    
    // Handle clarification questions
    if (data.needsClarification) {
      console.log(`[${requestId}] Clarification needed:`, {
        questions: data.questions,
        confidence: data.confidence
      });
      
      const questionsText = data.questions.map((q: string, index: number) => 
        `**${index + 1}. ${q}**`
      ).join('\n\n');
      
      const confidenceNote = data.confidence !== undefined ? 
        `\n\n*Confidence: ${data.confidence}% - focusing on critical gaps only*` : '';
      
      const content = `I need more information to create a comprehensive PRD. Please help me understand:\n\n${questionsText}${confidenceNote}\n\nPlease provide as much detail as possible for each area.`;
      
      console.log(`[${requestId}] Returning clarification response:`, {
        contentLength: content.length,
        questionsCount: data.questions.length
      });
      
      return NextResponse.json({ content, clarificationQuestions: data.questions });
    }

    // Handle section-specific responses
    if (data.sections) {
      console.log(`[${requestId}] Section response received:`, {
        sectionsUpdated: data.metadata?.sections_updated || Object.keys(data.sections),
        totalConfidence: data.metadata?.total_confidence,
        isValid: data.validation?.is_valid
      });

      // Return structured data directly instead of stringifying
      return NextResponse.json({ 
        content: data.sections, // Return structured sections directly
        sections: data.sections,
        metadata: data.metadata,
        validation: data.validation,
        isStructured: true // Flag to indicate this is structured data
      });
    }
    
    // Return the response with structured data when available
    let content: any;
    let isStructured = false;
    
    if (data.prd) {
      content = data.prd; // Return structured PRD directly
      isStructured = true;
    } else if (data.message) {
      content = data.message; // Keep message as string
    } else {
      content = data; // Return raw structured data
      isStructured = true;
    }
    
    console.log(`[${requestId}] Final response:`, {
      contentType: data.prd ? 'PRD' : (data.message ? 'message' : 'raw'),
      contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
      hasPRD: !!data.prd,
      isStructured
    });
    
    console.log(`[${requestId}] === REQUEST COMPLETE ===`);
    
    return NextResponse.json({ 
      content,
      isStructured // Include flag so frontend can handle properly
    });
    
  } catch (error) {
    console.error(`[${requestId}] API route error:`, error);
    console.error(`[${requestId}] Error stack:`, error instanceof Error ? error.stack : 'No stack');
    console.log(`[${requestId}] === REQUEST FAILED ===`);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process request'
      }, 
      { status: 500 }
    );
  }
}


// Build conversation context in the original format expected by backend
function buildConversationContext(messages: any[]): string {
  return messages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n\n');
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