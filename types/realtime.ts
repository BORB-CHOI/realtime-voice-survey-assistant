export const realtimeModels = [
  "gpt-realtime",
  "gpt-realtime-mini",
  "gpt-4o-realtime-preview",
  "gpt-4o-mini-realtime-preview",
] as const;

export type RealtimeModel = (typeof realtimeModels)[number];

export const realtimeModelEnvMap: Record<RealtimeModel, string> = {
  "gpt-realtime": "OPENAI_REALTIME_MODEL_GPT_REALTIME",
  "gpt-realtime-mini": "OPENAI_REALTIME_MODEL_GPT_REALTIME_MINI",
  "gpt-4o-realtime-preview": "OPENAI_REALTIME_MODEL_GPT_4O_REALTIME_PREVIEW",
  "gpt-4o-mini-realtime-preview":
    "OPENAI_REALTIME_MODEL_GPT_4O_MINI_REALTIME_PREVIEW",
};

export const defaultRealtimeModel: RealtimeModel =
  "gpt-4o-realtime-preview";

export const isRealtimeModel = (value: string): value is RealtimeModel =>
  (realtimeModels as readonly string[]).includes(value);
