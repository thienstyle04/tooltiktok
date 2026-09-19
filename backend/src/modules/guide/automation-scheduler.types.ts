export type AutomationFrequency = 'once' | 'daily';
export type AutomationHookMode = 'normal' | 'festival';

export interface AutomationTemplateRequest {
  deckId: string;
  count: number;
}

export interface AutomationScheduleInput {
  name?: string;
  destinationId?: string;
  frequency?: AutomationFrequency;
  onceAt?: string;
  dailyTime?: string;
  outputDir?: string;
  outputFileName?: string;
  enabled?: boolean;
  templates?: AutomationTemplateRequest[];
  hook?: { mode?: AutomationHookMode; sourceId?: string };
}

export interface AutomationSchedule {
  id: string;
  name: string;
  destinationId: string;
  frequency: AutomationFrequency;
  onceAt?: string;
  dailyTime?: string;
  outputDir: string;
  outputFileName?: string;
  enabled: boolean;
  templates: AutomationTemplateRequest[];
  hook: { mode: AutomationHookMode; sourceId?: string };
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastScheduledKey?: string;
}

export type AutomationRunStatus =
  | 'queued'
  | 'refreshing'
  | 'warming'
  | 'generating'
  | 'awaiting-export'
  | 'exporting'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'missed'
  | 'interrupted';

export interface AutomationRunError {
  deckId?: string;
  message: string;
  requested?: number;
  completed?: number;
}

export interface AutomationRun {
  id: string;
  scheduleId: string;
  scheduleName: string;
  scheduledFor: string;
  destinationId: string;
  status: AutomationRunStatus;
  phase: string;
  progress: number;
  templates: AutomationTemplateRequest[];
  hook: { mode: AutomationHookMode; sourceId?: string };
  outputDir: string;
  outputFileName?: string;
  listIds: string[];
  generated: Array<{ deckId: string; listId: string }>;
  exportedLists?: Array<{ deckId: string; listId: string }>;
  skippedLists?: Array<{ deckId: string; listId: string; label?: string; errors: Array<{ page?: number; id?: string; reason: string }> }>;
  errors: AutomationRunError[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  outputPath?: string;
  retryOf?: string;
  cancelRequested?: boolean;
  exportToken?: string;
}

export interface AutomationStateResponse {
  locked: boolean;
  outputPicker: 'save-file-v1';
  activeRunId?: string;
  schedules: AutomationSchedule[];
  runs: AutomationRun[];
  browserAvailable: boolean;
  browserName?: string;
  timezone: 'Asia/Saigon';
  minListsPerTemplate: number;
  maxListsPerTemplate: number;
}
