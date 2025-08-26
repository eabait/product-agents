import { PRD } from './prd-schema';

/**
 * Converts a PRD object to a formatted text string for copying
 */
export function convertPRDToText(prd: PRD): string {
  const sections = [];

  // Problem Statement
  if (prd.problemStatement) {
    sections.push(`PROBLEM STATEMENT\n${prd.problemStatement}`);
  }

  // Solution Overview
  if (prd.solutionOverview) {
    sections.push(`SOLUTION OVERVIEW\n${prd.solutionOverview}`);
  }

  // Target Users
  if (prd.targetUsers.length > 0) {
    sections.push(`TARGET USERS\n${prd.targetUsers.map(user => `• ${user}`).join('\n')}`);
  }

  // Goals
  if (prd.goals.length > 0) {
    sections.push(`GOALS\n${prd.goals.map(goal => `• ${goal}`).join('\n')}`);
  }

  // Success Metrics
  if (prd.successMetrics.length > 0) {
    const metricsText = prd.successMetrics
      .map(metric => `• ${metric.metric} - Target: ${metric.target} (${metric.timeline})`)
      .join('\n');
    sections.push(`SUCCESS METRICS\n${metricsText}`);
  }

  // Constraints
  if (prd.constraints.length > 0) {
    sections.push(`CONSTRAINTS\n${prd.constraints.map(constraint => `• ${constraint}`).join('\n')}`);
  }

  // Assumptions
  if (prd.assumptions.length > 0) {
    sections.push(`ASSUMPTIONS\n${prd.assumptions.map(assumption => `• ${assumption}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Converts a PRD object to formatted markdown
 */
export function convertPRDToMarkdown(prd: PRD): string {
  const sections = [];

  // Title
  sections.push('# Product Requirements Document');
  sections.push(''); // Empty line after title

  // Problem Statement
  if (prd.problemStatement) {
    sections.push('## Problem Statement');
    sections.push('');
    sections.push(prd.problemStatement);
    sections.push('');
  }

  // Solution Overview
  if (prd.solutionOverview) {
    sections.push('## Solution Overview');
    sections.push('');
    sections.push(prd.solutionOverview);
    sections.push('');
  }

  // Target Users
  if (prd.targetUsers.length > 0) {
    sections.push('## Target Users');
    sections.push('');
    prd.targetUsers.forEach(user => {
      sections.push(`- ${user}`);
    });
    sections.push('');
  }

  // Goals
  if (prd.goals.length > 0) {
    sections.push('## Goals');
    sections.push('');
    prd.goals.forEach(goal => {
      sections.push(`- ${goal}`);
    });
    sections.push('');
  }

  // Success Metrics
  if (prd.successMetrics.length > 0) {
    sections.push('## Success Metrics');
    sections.push('');
    prd.successMetrics.forEach(metric => {
      sections.push(`- **${metric.metric}**: ${metric.target} (${metric.timeline})`);
    });
    sections.push('');
  }

  // Constraints
  if (prd.constraints.length > 0) {
    sections.push('## Constraints');
    sections.push('');
    prd.constraints.forEach(constraint => {
      sections.push(`- ${constraint}`);
    });
    sections.push('');
  }

  // Assumptions
  if (prd.assumptions.length > 0) {
    sections.push('## Assumptions');
    sections.push('');
    prd.assumptions.forEach(assumption => {
      sections.push(`- ${assumption}`);
    });
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Downloads markdown content as a file
 */
export function downloadMarkdown(content: string, filename?: string): void {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const finalFilename = filename || `prd-export-${timestamp}.md`;
  
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = finalFilename;
  
  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up URL
  URL.revokeObjectURL(url);
}

/**
 * Copies text to clipboard using the modern Clipboard API
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'absolute';
      textArea.style.left = '-999999px';
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      } catch {
        document.body.removeChild(textArea);
        return false;
      }
    }
  } catch {
    return false;
  }
}