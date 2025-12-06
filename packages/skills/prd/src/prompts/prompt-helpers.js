const DEFAULT_MAX_JSON_CHARS = 800;
const DEFAULT_MAX_ITEMS = 6;
const NONE = 'None';
const extractLatestUserInstruction = (message) => {
    if (!message) {
        return null;
    }
    const userInstructionRegex = /^user:\s*([\s\S]*?)(?=^(?:user|assistant|system):|\Z)/gim;
    const matches = [...message.matchAll(userInstructionRegex)];
    if (matches.length === 0) {
        return null;
    }
    const lastMatch = matches[matches.length - 1];
    const instruction = lastMatch[1]?.trim();
    return instruction && instruction.length > 0 ? instruction : null;
};
export function buildUserContextBlock(message) {
    const trimmed = message.trim();
    const latestInstruction = extractLatestUserInstruction(trimmed);
    const safeMessage = latestInstruction ??
        (trimmed.length > 0 ? trimmed : 'No specific instructions provided.');
    return ['## Latest User Instruction', safeMessage].join('\n');
}
export function buildAnalysisSummaryBlock(contextAnalysis, options = {}) {
    const themes = formatList(contextAnalysis?.themes, NONE);
    const requirements = normalizeRequirements(contextAnalysis?.requirements ?? contextAnalysis);
    const lines = [
        '## Analysis Summary',
        `- Themes: ${themes}`,
        `- Functional requirements: ${formatList(requirements.functional, NONE)}`,
        `- Technical requirements: ${formatList(requirements.technical, NONE)}`,
        `- UX requirements: ${formatList(requirements.user_experience, NONE)}`
    ];
    if (options.includeEpics) {
        const epics = (requirements.epics ?? []).slice(0, DEFAULT_MAX_ITEMS);
        lines.push(epics.length > 0
            ? `- Epic stories: ${epics.map(epic => `${epic.title}: ${epic.description}`).join('; ')}`
            : '- Epic stories: None');
    }
    if (options.includeMvpFeatures) {
        lines.push(`- MVP features: ${formatList(requirements.mvpFeatures, NONE)}`);
    }
    if (options.includeConstraints) {
        lines.push(`- Constraints: ${formatList(contextAnalysis?.constraints, NONE)}`);
    }
    return lines.join('\n');
}
export function buildExistingSectionBlock(input, section, options = {}) {
    const existing = input.context?.existingPRD;
    if (!existing) {
        return undefined;
    }
    switch (section) {
        case 'targetUsers': {
            const users = extractArray(existing.sections?.targetUsers?.targetUsers ??
                existing.targetUsers ??
                input.context?.existingSection);
            if (users.length === 0)
                return undefined;
            return [
                '## Existing Target Users',
                truncateList(users).join('\n')
            ].join('\n');
        }
        case 'solution': {
            const solution = existing.sections?.solution ?? existing.solution ?? {};
            const overview = typeof solution.solutionOverview === 'string'
                ? solution.solutionOverview.trim()
                : typeof existing.solutionOverview === 'string'
                    ? existing.solutionOverview.trim()
                    : undefined;
            const approach = typeof solution.approach === 'string'
                ? solution.approach.trim()
                : typeof existing.approach === 'string'
                    ? existing.approach.trim()
                    : undefined;
            if (!overview && !approach)
                return undefined;
            return [
                '## Existing Solution Snapshot',
                overview ? `- Overview: ${truncateString(overview)}` : undefined,
                approach ? `- Approach: ${truncateString(approach)}` : undefined
            ]
                .filter(Boolean)
                .join('\n');
        }
        case 'keyFeatures': {
            const features = extractArray(existing.sections?.keyFeatures?.keyFeatures ??
                existing.goals ??
                input.context?.existingSection);
            if (features.length === 0)
                return undefined;
            return [
                '## Existing Key Features',
                ...truncateList(features)
            ].join('\n');
        }
        case 'successMetrics': {
            const metricsRaw = existing.sections?.successMetrics?.successMetrics ??
                existing.successMetrics ??
                input.context?.existingSection?.successMetrics ??
                input.context?.existingSection;
            const metrics = normalizeMetrics(metricsRaw);
            if (metrics.length === 0)
                return undefined;
            return [
                '## Existing Success Metrics',
                ...metrics.map(metric => `- ${truncateString(metric.metric)} — Target: ${truncateString(metric.target)} (${truncateString(metric.timeline)})`)
            ].join('\n');
        }
        case 'constraints': {
            const constraints = existing.sections?.constraints?.constraints ??
                existing.constraints ??
                input.context?.existingSection?.constraints ??
                input.context?.existingSection;
            const assumptions = (options.assumptions &&
                (existing.sections?.constraints?.assumptions ??
                    existing.assumptions ??
                    input.context?.existingSection?.assumptions)) ||
                [];
            const lines = [];
            const constraintList = extractArray(constraints);
            if (constraintList.length > 0) {
                lines.push('## Existing Constraints');
                lines.push(...truncateList(constraintList));
            }
            const assumptionList = extractArray(assumptions);
            if (assumptionList.length > 0) {
                if (lines.length > 0)
                    lines.push('');
                lines.push('## Existing Assumptions');
                lines.push(...truncateList(assumptionList));
            }
            return lines.length > 0 ? lines.join('\n') : undefined;
        }
        default:
            return undefined;
    }
}
export function formatStructuredOutputRequirement(lines) {
    return ['## Output JSON', ...lines.map(line => `- ${line}`)].join('\n');
}
export function formatReturnJsonOnly() {
    return [
        '## Output Rules',
        '- Return strict JSON only. No prose or commentary.',
        '- Do not wrap the JSON in code fences or additional text.'
    ].join('\n');
}
export function formatExistingItemsList(title, items) {
    const list = extractArray(items);
    if (list.length === 0)
        return undefined;
    return [title, ...truncateList(list)].join('\n');
}
export function formatMetricsList(title, metrics) {
    const normalized = normalizeMetrics(metrics);
    if (normalized.length === 0)
        return undefined;
    return [
        title,
        ...normalized.map(metric => `- ${truncateString(metric.metric)} — Target: ${truncateString(metric.target)} (${truncateString(metric.timeline)})`)
    ].join('\n');
}
export function summarizeExistingPrd(existingPrd) {
    if (!existingPrd)
        return [];
    const sections = ['## Existing PRD Snapshot'];
    const users = extractArray(existingPrd.sections?.targetUsers?.targetUsers ?? existingPrd.targetUsers);
    if (users.length > 0) {
        sections.push('- Target users:', ...truncateList(users, 4));
    }
    const solution = existingPrd.sections?.solution ?? existingPrd.solution ?? {};
    const overview = typeof solution?.solutionOverview === 'string'
        ? solution.solutionOverview
        : typeof existingPrd.solutionOverview === 'string'
            ? existingPrd.solutionOverview
            : undefined;
    if (overview) {
        sections.push(`- Solution overview: ${truncateString(overview, 320)}`);
    }
    const features = extractArray(existingPrd.sections?.keyFeatures?.keyFeatures ?? existingPrd.goals);
    if (features.length > 0) {
        sections.push('- Key features:', ...truncateList(features, 4));
    }
    const metrics = normalizeMetrics(existingPrd.sections?.successMetrics?.successMetrics ?? existingPrd.successMetrics);
    if (metrics.length > 0) {
        sections.push('- Success metrics:', ...metrics.slice(0, 4).map(metric => `  • ${truncateString(metric.metric)} (${truncateString(metric.target)})`));
    }
    const constraints = extractArray(existingPrd.sections?.constraints?.constraints ?? existingPrd.constraints);
    if (constraints.length > 0) {
        sections.push('- Constraints:', ...truncateList(constraints, 4));
    }
    return sections;
}
function formatList(value, fallback) {
    if (!value)
        return fallback;
    const array = Array.isArray(value) ? value : [];
    return array.length > 0 ? truncateList(array).join('; ') : fallback;
}
function extractArray(value) {
    if (!value)
        return [];
    if (Array.isArray(value)) {
        return value
            .map(item => {
            if (!item)
                return '';
            if (typeof item === 'string')
                return item.trim();
            if (typeof item === 'object') {
                if ('description' in item && typeof item.description === 'string') {
                    return item.description.trim();
                }
                if ('title' in item && typeof item.title === 'string') {
                    return item.title.trim();
                }
                return truncateString(JSON.stringify(item));
            }
            return String(item).trim();
        })
            .filter(Boolean);
    }
    return [truncateString(String(value))];
}
function normalizeMetrics(value) {
    if (!value)
        return [];
    const array = Array.isArray(value) ? value : [];
    return array
        .map(item => {
        if (!item)
            return undefined;
        if (typeof item === 'string') {
            return { metric: item, target: 'Specify target', timeline: 'Specify timeline' };
        }
        if (typeof item === 'object') {
            return {
                metric: String(item.metric ?? item.name ?? 'Unnamed metric'),
                target: String(item.target ?? item.goal ?? 'Define target'),
                timeline: String(item.timeline ?? item.when ?? 'Define timeline')
            };
        }
        return undefined;
    })
        .filter(Boolean);
}
function normalizeRequirements(raw) {
    if (!raw) {
        return {
            functional: [],
            technical: [],
            user_experience: [],
            epics: [],
            mvpFeatures: []
        };
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return {
            functional: extractArray(raw.functional),
            technical: extractArray(raw.technical),
            user_experience: extractArray(raw.user_experience),
            epics: Array.isArray(raw.epics)
                ? raw.epics
                    .slice(0, DEFAULT_MAX_ITEMS)
                    .map(epic => ({
                    title: truncateString(String(epic?.title ?? 'Untitled')),
                    description: truncateString(String(epic?.description ?? 'No description'))
                }))
                : [],
            mvpFeatures: extractArray(raw.mvpFeatures)
        };
    }
    return {
        functional: extractArray(raw.functional),
        technical: extractArray(raw.technical),
        user_experience: extractArray(raw.user_experience),
        epics: [],
        mvpFeatures: []
    };
}
function truncateList(items, maxItems = DEFAULT_MAX_ITEMS) {
    if (items.length <= maxItems) {
        return items.map(item => `- ${truncateString(item)}`);
    }
    const sliced = items.slice(0, maxItems - 1).map(item => `- ${truncateString(item)}`);
    const remaining = items.length - (maxItems - 1);
    return [...sliced, `- …and ${remaining} more`];
}
function truncateString(value, maxChars = DEFAULT_MAX_JSON_CHARS) {
    if (value.length <= maxChars)
        return value;
    return `${value.slice(0, maxChars - 3)}...`;
}
