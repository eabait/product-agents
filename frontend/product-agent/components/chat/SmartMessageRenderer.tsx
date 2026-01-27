'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import { PRDEditor } from './PRDEditor';
import { ResearchPlanCard } from '../research/ResearchPlanCard';
import { ResearchArtifactView } from '../research/ResearchArtifactView';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, FileText, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewPRD, FlattenedPRD, isNewPRD, isFlattenedPRD } from '@/lib/prd-schema';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Edit3, Trash2, Save, X } from 'lucide-react'

interface SmartMessageRendererProps {
  content: string;
  messageId: string;
  onPRDUpdate?: (_messageId: string, _updatedPRD: NewPRD) => void;
  onRegenerateSection?: (_messageId: string, _sectionName: string) => void;
  onResearchPlanAction?: (_action: 'approve' | 'reject', _plan: any) => void;
  isExpanded?: boolean;
  onToggleExpanded?: (_messageId: string) => void;
}

export function SmartMessageRenderer({
  content,
  messageId,
  onPRDUpdate,
  onRegenerateSection,
  onResearchPlanAction,
  isExpanded = false,
  onToggleExpanded
}: SmartMessageRendererProps) {
  const parsedContent = useMemo(() => {
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  }, [content])

  const initialPRD = useMemo<NewPRD | FlattenedPRD | null>(() => {
    if (parsedContent && isPRDObject(parsedContent)) {
      return parsedContent
    }
    return null
  }, [parsedContent])

  const [localPRD, setLocalPRD] = useState<NewPRD | FlattenedPRD | null>(initialPRD)

  useEffect(() => {
    if (parsedContent && isPRDObject(parsedContent)) {
      setLocalPRD(parsedContent)
    } else {
      setLocalPRD(null)
    }
  }, [parsedContent])

  const personaArtifact = useMemo(() => {
    if (parsedContent && isPersonaArtifact(parsedContent)) {
      return parsedContent
    }
    return null
  }, [parsedContent])

  const researchArtifact = useMemo(() => {
    if (parsedContent && isResearchArtifact(parsedContent)) {
      return parsedContent
    }
    return null
  }, [parsedContent])

  const handlePRDChange = useCallback((updatedPRD: NewPRD) => {
    setLocalPRD(updatedPRD);
    onPRDUpdate?.(messageId, updatedPRD);
  }, [messageId, onPRDUpdate]);

  const handleRegenerateSection = useCallback((sectionName: string) => {
    onRegenerateSection?.(messageId, sectionName);
  }, [messageId, onRegenerateSection]);

  if (personaArtifact) {
    return <CollapsiblePersonaViewer artifact={personaArtifact} />
  }

  if (researchArtifact) {
    return <ResearchArtifactRenderer artifact={researchArtifact} onResearchPlanAction={onResearchPlanAction} />
  }

  // If we have a valid PRD, render the collapsible editor
  if (localPRD) {
    const handleToggle = () => {
      onToggleExpanded?.(messageId);
    };

    // Get preview text from the PRD
    const previewText = getPreviewText(localPRD);

    return (
      <Collapsible open={isExpanded} onOpenChange={handleToggle}>
        <div className="border rounded-lg bg-card">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex w-full justify-between items-center p-4 hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="font-medium">Product Requirements Document</span>
                {getMetadataText(localPRD) && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    {getMetadataText(localPRD)}
                  </span>
                )}
              </div>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          
          {!isExpanded && (
            <div className="px-4 pb-4">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {previewText}
              </p>
            </div>
          )}
          
          <CollapsibleContent className="border-t">
            <div className="p-4">
              <PRDEditor 
                prd={localPRD} 
                onChange={handlePRDChange}
                onRegenerateSection={onRegenerateSection ? handleRegenerateSection : undefined}
              />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  }

  // Otherwise, render as markdown
  return <MarkdownMessage content={content} />;
}

// Enhanced type guard to check if an object is a PRD (new or flattened format)
function isPRDObject(obj: any): obj is NewPRD | FlattenedPRD {
  if (!obj || typeof obj !== 'object') return false;

  // Check for new PRD structure (sections-based)
  if (isNewPRD(obj)) return true;

  // Check for flattened PRD structure
  if (isFlattenedPRD(obj)) return true;

  // Check for legacy structure patterns
  const hasLegacyFields = (
    (typeof obj.problemStatement === 'string' ||
     typeof obj.solutionOverview === 'string') &&
    (Array.isArray(obj.targetUsers) ||
     Array.isArray(obj.goals) ||
     Array.isArray(obj.successMetrics) ||
     Array.isArray(obj.constraints) ||
     Array.isArray(obj.assumptions))
  );

  // Check if it's a structured response from the backend
  const hasStructuredSections = obj.sections && typeof obj.sections === 'object';

  return hasLegacyFields || hasStructuredSections;
}

interface PersonaProfile {
  id: string
  name: string
  summary: string
  goals?: string[]
  frustrations?: string[]
  opportunities?: string[]
  successIndicators?: string[]
  quote?: string
  tags?: string[]
}

interface PersonaArtifactShape {
  id: string
  kind: string
  label?: string
  data?: {
    personas?: PersonaProfile[]
    generatedAt?: string
    notes?: string
    source?: {
      artifactKind?: string
      artifactId?: string
    }
  }
  metadata?: {
    confidence?: number
  }
}

const isPersonaArtifact = (value: unknown): value is PersonaArtifactShape => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const artifact = value as PersonaArtifactShape
  return artifact.kind === 'persona' && Array.isArray(artifact.data?.personas)
}

const CollapsiblePersonaViewer = ({ artifact }: { artifact: PersonaArtifactShape }) => {
  const [isOpen, setIsOpen] = useState(false)
  const personaCount = artifact.data?.personas?.length ?? 0
  const label = artifact.label ?? 'Personas'

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-card">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex w-full justify-between items-center p-4 hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="font-medium">{label}</span>
              <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                {personaCount} persona{personaCount !== 1 ? 's' : ''}
              </span>
            </div>
            {isOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        {!isOpen && (
          <div className="px-4 pb-4">
            <p className="text-sm text-muted-foreground line-clamp-2">
              {artifact.data?.personas?.slice(0, 3).map(p => p.name).join(', ')}
              {personaCount > 3 ? ` and ${personaCount - 3} more...` : ''}
            </p>
          </div>
        )}

        <CollapsibleContent className="border-t">
          <div className="p-4">
            <PersonaArtifactViewer artifact={artifact} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

const PersonaArtifactViewer = ({ artifact }: { artifact: PersonaArtifactShape }) => {
  const [personas, setPersonas] = useState<PersonaProfile[]>(artifact.data?.personas ?? [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PersonaProfile | null>(null)

  const generatedAt = artifact.data?.generatedAt
  const notes = artifact.data?.notes
  const confidence = artifact.metadata?.confidence

  const beginEdit = (persona: PersonaProfile) => {
    setEditingId(persona.id)
    setDraft({ ...persona })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveEdit = () => {
    if (!draft || !editingId) {
      return
    }
    setPersonas(prev => prev.map(persona => (persona.id === editingId ? normalizePersona(draft) : persona)))
    setEditingId(null)
    setDraft(null)
  }

  const deletePersona = (personaId: string) => {
    setPersonas(prev => prev.filter(persona => persona.id !== personaId))
    if (editingId === personaId) {
      cancelEdit()
    }
  }

  const handleDraftChange = (field: keyof PersonaProfile, value: string) => {
    setDraft(prev => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleDraftArrayChange = (
    field: keyof Pick<PersonaProfile, 'goals' | 'frustrations' | 'opportunities' | 'successIndicators' | 'tags'>,
    value: string
  ) => {
    const entries = value
      .split(/\n+/)
      .map(entry => entry.trim())
      .filter(Boolean)
    setDraft(prev => (prev ? { ...prev, [field]: entries } : prev))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Persona Bundle</p>
            <h3 className="text-lg font-semibold">{artifact.label ?? 'Personas'}</h3>
          </div>
          {typeof confidence === 'number' && (
            <Badge variant="secondary">{Math.round(confidence * 100)}% confidence</Badge>
          )}
        </div>
        {generatedAt && (
          <p className="text-xs text-muted-foreground">Generated {new Date(generatedAt).toLocaleString()}</p>
        )}
        {notes && <p className="text-sm text-muted-foreground">{notes}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {personas.map(persona => (
          <div key={persona.id} className="border rounded-lg bg-card/70 p-4 shadow-sm space-y-3">
            {editingId === persona.id && draft ? (
              <EditablePersonaForm
                persona={draft}
                onFieldChange={handleDraftChange}
                onArrayChange={handleDraftArrayChange}
                onSave={saveEdit}
                onCancel={cancelEdit}
                onDelete={() => deletePersona(persona.id)}
              />
            ) : (
              <ReadonlyPersonaCard persona={persona} onEdit={() => beginEdit(persona)} onDelete={() => deletePersona(persona.id)} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const PersonaSection = ({ title, items }: { title: string; items?: string[] }) => {
  if (!items || items.length === 0) {
    return null
  }
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
      <ul className="list-disc list-inside space-y-1">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="text-foreground/90">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

const normalizePersona = (persona: PersonaProfile): PersonaProfile => ({
  ...persona,
  goals: persona.goals ?? [],
  frustrations: persona.frustrations ?? [],
  opportunities: persona.opportunities ?? [],
  successIndicators: persona.successIndicators ?? [],
  tags: persona.tags ?? []
})

interface EditablePersonaFormProps {
  persona: PersonaProfile
  // eslint-disable-next-line no-unused-vars
  onFieldChange: (field: keyof PersonaProfile, value: string) => void
  onArrayChange: (
    // eslint-disable-next-line no-unused-vars
    field: keyof Pick<PersonaProfile, 'goals' | 'frustrations' | 'opportunities' | 'successIndicators' | 'tags'>,
    // eslint-disable-next-line no-unused-vars
    value: string
  ) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}

const EditablePersonaForm = ({ persona, onFieldChange, onArrayChange, onSave, onCancel, onDelete }: EditablePersonaFormProps) => {
  const arrayToMultiline = (entries?: string[]) => (entries && entries.length > 0 ? entries.join('\n') : '')

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Input value={persona.name} onChange={event => onFieldChange('name', event.target.value)} placeholder="Persona name" />
          <span className="text-xs text-muted-foreground">{persona.id}</span>
        </div>
        <Textarea value={persona.summary} onChange={event => onFieldChange('summary', event.target.value)} placeholder="Persona summary" />
        <Textarea value={persona.quote ?? ''} onChange={event => onFieldChange('quote', event.target.value)} placeholder="Representative quote" />
      </div>

      <div className="grid gap-3 text-sm">
        <PersonaArrayField label="Goals" value={arrayToMultiline(persona.goals)} onChange={value => onArrayChange('goals', value)} />
        <PersonaArrayField label="Frustrations" value={arrayToMultiline(persona.frustrations)} onChange={value => onArrayChange('frustrations', value)} />
        <PersonaArrayField label="Opportunities" value={arrayToMultiline(persona.opportunities)} onChange={value => onArrayChange('opportunities', value)} />
        <PersonaArrayField label="Success Indicators" value={arrayToMultiline(persona.successIndicators)} onChange={value => onArrayChange('successIndicators', value)} />
        <PersonaArrayField label="Tags" value={arrayToMultiline(persona.tags)} onChange={value => onArrayChange('tags', value)} helperText="One tag per line" />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="w-4 h-4 mr-1" /> Delete
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="w-4 h-4 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          <Save className="w-4 h-4 mr-1" /> Save
        </Button>
      </div>
    </div>
  )
}

const PersonaArrayField = ({ label, value, onChange, helperText }: { label: string; value: string; onChange: (_value: string) => void; helperText?: string }) => (
  <div className="space-y-1">
    <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
    <Textarea value={value} onChange={event => onChange(event.target.value)} rows={3} />
    {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
  </div>
)

const ReadonlyPersonaCard = ({ persona, onEdit, onDelete }: { persona: PersonaProfile; onEdit: () => void; onDelete: () => void }) => (
  <div className="space-y-4">
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold line-clamp-1">{persona.name}</h4>
          <span className="text-xs text-muted-foreground">{persona.id}</span>
        </div>
        {persona.tags && persona.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {persona.tags.slice(0, 8).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Edit3 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{persona.summary}</p>
    {persona.quote && (
      <blockquote className="text-sm italic border-l-2 border-muted pl-3 text-foreground/80">
        “{persona.quote.replace(/^"|"$/g, '')}”
      </blockquote>
    )}
    <div className="grid gap-3 text-sm">
      <PersonaSection title="Goals" items={persona.goals} />
      <PersonaSection title="Frustrations" items={persona.frustrations} />
      <PersonaSection title="Opportunities" items={persona.opportunities} />
      <PersonaSection title="Success Indicators" items={persona.successIndicators} />
    </div>
  </div>
)

// Get preview text from PRD
function getPreviewText(prd: NewPRD | FlattenedPRD | any): string {
  // Try new format first
  if (isNewPRD(prd) && prd.sections.solution?.solutionOverview) {
    return prd.sections.solution.solutionOverview;
  }

  // Try flattened format
  if (isFlattenedPRD(prd) && prd.solutionOverview) {
    return prd.solutionOverview;
  }

  // Try legacy fields
  if (prd.problemStatement) {
    return prd.problemStatement;
  }

  if (prd.solutionOverview) {
    return prd.solutionOverview;
  }

  // Try to extract from sections if available
  if (prd.sections?.solution?.solutionOverview) {
    return prd.sections.solution.solutionOverview;
  }

  if (prd.sections?.problemStatement?.problemStatement) {
    return prd.sections.problemStatement.problemStatement;
  }

  return 'Product Requirements Document generated';
}

// Get metadata text for display
function getMetadataText(prd: NewPRD | FlattenedPRD | any): string {
  // Try new format first
  if (isNewPRD(prd) && prd.metadata) {
    const { sections_generated, total_confidence, processing_time_ms } = prd.metadata;
    
    if (total_confidence) {
      return `${Math.round(total_confidence * 100)}% confidence`;
    }
    
    if (sections_generated && sections_generated.length > 0) {
      return `${sections_generated.length} sections`;
    }
    
    if (processing_time_ms) {
      return `${processing_time_ms}ms`;
    }
  }

  // Try flattened format
  if (isFlattenedPRD(prd) && prd.metadata) {
    const { sections_generated, total_confidence } = prd.metadata;
    
    if (total_confidence) {
      return `${Math.round(total_confidence * 100)}% confidence`;
    }
    
    if (sections_generated && sections_generated.length > 0) {
      return `${sections_generated.length} sections`;
    }
  }

  return '';
}

// Research Artifact Types
interface ResearchArtifactShape {
  id: string
  kind: string
  label?: string
  data?: any
  metadata?: {
    status?: string
    plan?: any
    confidence?: number
    createdAt?: string
    tags?: string[]
    extras?: any
  }
}

const isResearchArtifact = (value: unknown): value is ResearchArtifactShape => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const artifact = value as ResearchArtifactShape
  return artifact.kind === 'research'
}

const CollapsibleResearchView = ({
  artifact,
  data,
  confidence
}: {
  artifact: ResearchArtifactShape
  data: any
  confidence?: number
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const label = artifact.label || data?.topic || 'Research Report'
  const findingsCount = data?.findings?.length ?? 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-card">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex w-full justify-between items-center p-4 hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              <span className="font-medium">Research Report</span>
              {confidence !== undefined && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                  {Math.round(confidence * 100)}% confidence
                </span>
              )}
              {findingsCount > 0 && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  {findingsCount} finding{findingsCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        {!isOpen && (
          <div className="px-4 pb-4">
            <p className="font-medium text-sm mb-1">{label}</p>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {data?.executiveSummary || data?.scope || 'Research findings and analysis'}
            </p>
          </div>
        )}

        <CollapsibleContent className="border-t">
          <ResearchArtifactView data={data} confidence={confidence} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

const ResearchArtifactRenderer = ({
  artifact,
  onResearchPlanAction
}: {
  artifact: ResearchArtifactShape
  onResearchPlanAction?: (_action: 'approve' | 'reject', _plan: any) => void
}) => {
  // Status can be in metadata.status OR metadata.extras.status
  const status = artifact.metadata?.extras?.status || artifact.metadata?.status
  const plan = artifact.metadata?.extras?.plan || artifact.metadata?.plan
  const data = artifact.data
  const confidence = artifact.metadata?.confidence

  // If awaiting plan confirmation, show the plan card
  if (status === 'awaiting-plan-confirmation' && plan) {
    return (
      <ResearchPlanCard
        plan={plan}
        status="awaiting-plan-confirmation"
        onApprove={() => {
          onResearchPlanAction?.('approve', plan)
        }}
        onReject={() => {
          onResearchPlanAction?.('reject', plan)
        }}
      />
    )
  }

  // If awaiting clarification, show the plan card with clarification status
  if (status === 'awaiting-clarification' && plan) {
    return (
      <ResearchPlanCard
        plan={plan}
        status="awaiting-clarification"
      />
    )
  }

  // If completed, show the full research artifact in a collapsible
  if (status === 'completed' && data) {
    return <CollapsibleResearchView artifact={artifact} data={data} confidence={confidence} />
  }

  // Fallback: show basic artifact info
  return (
    <div className="p-4 border rounded-lg bg-card">
      <h4 className="font-semibold mb-2">{artifact.label || 'Research Artifact'}</h4>
      <p className="text-sm text-muted-foreground">Status: {status || 'unknown'}</p>
      {data?.topic && <p className="text-sm">Topic: {data.topic}</p>}
    </div>
  )
}
