import { NextRequest, NextResponse } from 'next/server';

const PRD_AGENT_URL = process.env.PRD_AGENT_URL;

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] === SECTIONS API REQUEST ===`);
  
  try {
    const body = await request.json();
    const { 
      message, 
      settings, 
      contextPayload, 
      existingPRD, 
      targetSections, 
      operation = 'generate' 
    } = body;
    
    console.log(`[${requestId}] Section request:`, {
      message: message?.substring(0, 100) + '...',
      targetSections,
      operation,
      hasExistingPRD: !!existingPRD,
      hasContextPayload: !!contextPayload
    });
    
    if (!message) {
      return NextResponse.json(
        { error: 'Missing message' }, 
        { status: 400 }
      );
    }
    
    // Determine endpoint based on operation
    let endpoint: string;
    let payload: any;
    
    if (targetSections && targetSections.length === 1) {
      // Single section operation
      endpoint = `/prd/section/${targetSections[0]}`;
      payload = {
        message,
        settings,
        contextPayload,
        existingPRD
      };
    } else {
      // Multiple sections operation
      endpoint = '/prd/sections';
      payload = {
        message,
        settings,
        contextPayload,
        existingPRD,
        targetSections
      };
    }
    
    const fullUrl = `${PRD_AGENT_URL}${endpoint}`;
    console.log(`[${requestId}] Calling backend:`, {
      url: fullUrl,
      targetSections,
      operation
    });
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] Backend error:`, errorText);
      throw new Error(`Backend error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`[${requestId}] Section response:`, {
      sectionsGenerated: data.metadata?.sections_updated || [],
      totalConfidence: data.metadata?.total_confidence,
      isValid: data.validation?.is_valid,
      validationIssues: data.validation?.issues?.length || 0
    });
    
    return NextResponse.json({
      success: true,
      sections: data.sections || { [targetSections[0]]: data.content },
      metadata: data.metadata,
      validation: data.validation
    });
    
  } catch (error) {
    console.error(`[${requestId}] Section API error:`, error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process section request'
      }, 
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve available sections
export async function GET(request: NextRequest) {
  const availableSections = [
    { name: 'context', title: 'Business & Product Context', description: 'Background, stakeholders, and constraints' },
    { name: 'problemStatement', title: 'Problem Statement', description: 'Core problem definition and user impact' },
    { name: 'requirements', title: 'Requirements', description: 'Functional and non-functional requirements' },
    { name: 'scope', title: 'Scope & Boundaries', description: 'In-scope, out-of-scope, and MVP features' },
    { name: 'assumptions', title: 'Assumptions & Dependencies', description: 'Key assumptions and external dependencies' },
    { name: 'metrics', title: 'Success Metrics', description: 'KPIs, acceptance criteria, and launch criteria' }
  ];
  
  return NextResponse.json({
    sections: availableSections,
    totalSections: availableSections.length
  });
}