import { NextRequest, NextResponse } from 'next/server';
import { formatConfidence, type ConfidenceValue } from '@/lib/confidence-display';

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
    console.log(`[${requestId}] Backend response data DETAILED:`, {
      hasContent: !!data.content,
      contentLength: data.content?.length || 0,
      contentPreview: data.content?.substring(0, 200) + (data.content?.length > 200 ? '...' : ''),
      needsClarification: !!data.needsClarification,
      questionsCount: data.questions?.length || 0,
      confidence: data.confidence,
      hasPRD: !!data.prd,
      hasSections: !!data.sections,
      hasMessage: !!data.message,
      allKeys: Object.keys(data),
      otherKeys: Object.keys(data).filter(k => !['content', 'needsClarification', 'questions', 'confidence', 'prd', 'sections', 'message'].includes(k))
    });
    
    // Log the actual structure of key fields
    if (data.prd) {
      console.log(`[${requestId}] PRD structure:`, {
        prdKeys: Object.keys(data.prd),
        hasSections: !!data.prd.sections,
        hasMetadata: !!data.prd.metadata,
        problemStatement: !!data.prd.problemStatement
      });
    }
    
    if (data.sections) {
      console.log(`[${requestId}] Sections structure:`, {
        sectionKeys: Object.keys(data.sections),
        sectionCount: Object.keys(data.sections).length
      });
    }
    
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
        (() => {
          const formatted = formatConfidence(data.confidence as ConfidenceValue);
          const reasonText = formatted.reasons ? ` - ${formatted.reasons[0]}` : '';
          return `\n\n*${formatted.displayText}${reasonText}*`;
        })() : '';
      
      const content = `I need more information to create a comprehensive PRD. Please help me understand:\n\n${questionsText}${confidenceNote}\n\nPlease provide as much detail as possible for each area.`;
      
      console.log(`[${requestId}] Returning clarification response:`, {
        contentLength: content.length,
        questionsCount: data.questions.length
      });
      
      return NextResponse.json({ content, clarificationQuestions: data.questions });
    }

    // Handle PRD edit responses (which return the PRD object directly)
    if (data.sections && data.metadata) {
      console.log(`[${requestId}] PRD/Section response received:`, {
        sectionsUpdated: data.metadata?.sections_generated || Object.keys(data.sections),
        totalConfidence: data.metadata?.total_confidence,
        isValid: data.validation?.is_valid,
        isDirectPRD: !data.prd // This is a direct PRD response, not wrapped
      });

      // Return the full PRD object as structured content
      return NextResponse.json({ 
        content: data, // Return the entire PRD object
        isStructured: true, // Flag to indicate this is structured data
        isPRD: true // Additional flag for PRD identification
      });
    }

    // Handle legacy section-only responses (if any)
    if (data.sections && !data.metadata) {
      console.log(`[${requestId}] Legacy section response received:`, {
        sectionsUpdated: Object.keys(data.sections),
        totalConfidence: undefined,
        isValid: undefined
      });

      // Return structured data directly
      return NextResponse.json({ 
        content: data.sections, // Return structured sections directly
        sections: data.sections,
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
    
    console.log(`[${requestId}] Final response preparation:`, {
      contentType: data.prd ? 'PRD' : (data.message ? 'message' : 'raw'),
      contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
      hasPRD: !!data.prd,
      isStructured,
      contentIsObject: typeof content === 'object',
      contentKeys: typeof content === 'object' ? Object.keys(content) : null,
      contentPreview: typeof content === 'string' ? content.substring(0, 100) : JSON.stringify(content).substring(0, 100)
    });
    
    const finalResponse = { 
      content,
      isStructured // Include flag so frontend can handle properly
    };
    
    console.log(`[${requestId}] Final API response being sent to frontend:`, {
      responseKeys: Object.keys(finalResponse),
      hasContent: !!finalResponse.content,
      contentType: typeof finalResponse.content,
      isStructured: finalResponse.isStructured
    });
    
    console.log(`[${requestId}] === REQUEST COMPLETE ===`);
    
    return NextResponse.json(finalResponse);
    
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