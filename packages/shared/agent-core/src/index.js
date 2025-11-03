export class BaseAgent {
    settings;
    constructor(settings = {}) {
        const { subAgentSettings, ...rest } = settings || {};
        this.settings = {
            model: 'anthropic/claude-3-5-sonnet',
            temperature: 0.7,
            maxTokens: 2000,
            ...rest,
            ...(subAgentSettings ? { subAgentSettings: { ...subAgentSettings } } : {})
        };
    }
    updateSettings(newSettings) {
        const { subAgentSettings, ...rest } = newSettings || {};
        this.settings = {
            ...this.settings,
            ...rest,
            ...(subAgentSettings
                ? {
                    subAgentSettings: {
                        ...(this.settings.subAgentSettings || {}),
                        ...Object.entries(subAgentSettings).reduce((acc, [key, value]) => {
                            acc[key] = {
                                ...(this.settings.subAgentSettings?.[key] || {
                                    model: this.settings.model,
                                    temperature: this.settings.temperature,
                                    maxTokens: this.settings.maxTokens
                                }),
                                ...value
                            };
                            return acc;
                        }, {})
                    }
                }
                : {})
        };
    }
    getSettings() {
        return {
            ...this.settings,
            ...(this.settings.subAgentSettings
                ? {
                    subAgentSettings: Object.entries(this.settings.subAgentSettings).reduce((acc, [key, value]) => {
                        acc[key] = { ...value };
                        return acc;
                    }, {})
                }
                : {})
        };
    }
}
export class WorkerAgent extends BaseAgent {
}
export class OrchestratorAgent extends BaseAgent {
    workers = [];
    addWorker(worker) {
        this.workers.push(worker);
    }
    async chat(message, context) {
        return this.executeWorkflow({ message, context });
    }
    async executeWorkflow(input) {
        const results = new Map();
        for (const worker of this.workers) {
            const result = await worker.execute(input, results);
            results.set(result.name, result);
        }
        return results;
    }
}
export class ParallelAgent extends BaseAgent {
    workers = [];
    addWorker(worker) {
        this.workers.push(worker);
    }
    async chat(message, context) {
        return this.executeWithVoting({ message, context });
    }
    async executeParallel(input) {
        const promises = this.workers.map(worker => worker.execute(input, new Map()));
        return Promise.all(promises);
    }
    async executeWithVoting(input, votingFn) {
        const results = await this.executeParallel(input);
        if (votingFn) {
            return votingFn(results);
        }
        // Default voting: highest confidence
        return results.reduce((best, current) => (current.confidence || 0) > (best.confidence || 0) ? current : best);
    }
}
export * from './usage';
export * from 'zod';
