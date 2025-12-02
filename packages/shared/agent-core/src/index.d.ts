export interface AgentRuntimeSettings {
    model: string;
    temperature: number;
    maxTokens: number;
    apiKey?: string;
    advanced?: Record<string, any>;
}
export interface AgentSettings extends AgentRuntimeSettings {
    subAgentSettings?: Record<string, AgentRuntimeSettings>;
}
export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
        model?: string;
        tokens?: number;
        duration?: number;
        confidence?: number;
    };
}
export declare abstract class BaseAgent {
    protected settings: AgentSettings;
    constructor(settings?: Partial<AgentSettings>);
    abstract chat(message: string, context?: any): Promise<any>;
    updateSettings(newSettings: Partial<AgentSettings>): void;
    getSettings(): AgentSettings;
}
export interface WorkerResult {
    name: string;
    data: any;
    confidence?: number;
    metadata?: Record<string, any>;
}
export declare abstract class WorkerAgent extends BaseAgent {
    abstract execute(input: any, context?: Map<string, any>): Promise<WorkerResult>;
}
export declare class OrchestratorAgent extends BaseAgent {
    private workers;
    addWorker(worker: WorkerAgent): void;
    chat(message: string, context?: any): Promise<any>;
    executeWorkflow(input: any): Promise<Map<string, WorkerResult>>;
}
export declare class ParallelAgent extends BaseAgent {
    private workers;
    addWorker(worker: WorkerAgent): void;
    chat(message: string, context?: any): Promise<any>;
    executeParallel(input: any): Promise<WorkerResult[]>;
    executeWithVoting(input: any, votingFn?: (results: WorkerResult[]) => WorkerResult): Promise<WorkerResult>;
}
export * from './usage';
export * from 'zod';
//# sourceMappingURL=index.d.ts.map