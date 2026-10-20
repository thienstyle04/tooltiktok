export type AutomationFrequency = 'once' | 'daily';
export type AutomationHookMode = 'normal' | 'festival';

export interface AutomationTemplateRequest {
  photoPreset?: import('../../common/photo-preset-catalog').PhotoPresetId | null;
  deckId: string;
  count: number;
  /** Tên đối tác phải có mặt trong mọi list của mẫu này (không áp dụng mẫu riêng). */
  requiredPartners?: string[];
}

export interface AutomationScheduleInput {
  name?: string;
  destinationId?: string;
  frequency?: AutomationFrequency;
  onceAt?: string;
  dailyTime?: string;
  outputDir?: string;
  outputFileName?: string;
  format?: 'png' | 'jpg';
  enabled?: boolean;
  /** Tool tắt/máy ngủ đúng giờ: khi mở lại trong CATCH_UP_WINDOW thì chạy bù thay vì bỏ lượt. */
  catchUp?: boolean;
  templates?: AutomationTemplateRequest[];
  hook?: { mode?: AutomationHookMode; sourceId?: string };
}

export interface AutomationSchedule {
  disabledReason?: string;
  id: string;
  name: string;
  destinationId: string;
  frequency: AutomationFrequency;
  onceAt?: string;
  dailyTime?: string;
  outputDir: string;
  outputFileName?: string;
  format?: 'png' | 'jpg';
  enabled: boolean;
  catchUp?: boolean;
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

/** Một phần ZIP của lượt xuất: lượt lớn được chia nhỏ để không dồn cả lượt vào một file trong bộ nhớ. */
export interface AutomationExportPart {
  index: number;
  listIds: string[];
  outcomeRecorded?: boolean;
  exportedCount?: number;
  outputPath?: string;
  bytes?: number;
  error?: string;
}

export interface AutomationRun {
  warnings?: Array<{ deckId: string; listId: string; message: string }>;
  ai?: { provider: 'deepseek' | 'gemini'; model: string };
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
  format?: 'png' | 'jpg';
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
  /** Các file ZIP đã lưu (lượt chia nhiều phần); outputPath khi đó là thư mục của lượt. */
  outputPaths?: string[];
  exportParts?: AutomationExportPart[];
  /** Lượt chạy bù cho giờ hẹn đã lỡ. */
  catchUp?: boolean;
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
