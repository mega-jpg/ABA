import { WorkflowState } from "../types/seeding";
export declare function initWorkflowState(workflowId: string, totalSteps: number): Promise<WorkflowState>;
export declare function getWorkflowState(workflowId: string): Promise<WorkflowState | null>;
export declare function updateWorkflowState(workflowId: string, patch: Partial<WorkflowState>): Promise<WorkflowState | null>;
export declare function recordStepSuccess(workflowId: string, stepIndex: number, messageId?: number): Promise<void>;
export declare function recordStepError(workflowId: string, error: string): Promise<void>;
