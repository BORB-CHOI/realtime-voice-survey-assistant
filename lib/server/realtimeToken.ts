import {
  defaultRealtimeModel,
  isRealtimeModel,
  realtimeModelEnvMap,
  realtimeModels,
} from "../../types/realtime";

export const getAllowedRealtimeModels = () => realtimeModels;

export const resolveDefaultModel = () =>
  process.env.OPENAI_REALTIME_MODEL ||
  process.env.NEXT_PUBLIC_REALTIME_MODEL ||
  defaultRealtimeModel;

export const resolveRequestedModel = (requested: string) => {
  if (!isRealtimeModel(requested)) return null;
  const envKey = realtimeModelEnvMap[requested];
  return process.env[envKey] || requested;
};

export type RealtimeTokenResult = {
  ok: boolean;
  status: number;
  data: any;
};

export const fetchRealtimeToken = async (opts: {
  apiKey: string;
  model: string;
  instructions: string;
}) => {
  const sessionConfig = {
    session: {
      type: "realtime",
      model: opts.model,
      instructions: opts.instructions,
      output_modalities: ["audio"],
      audio: { output: { voice: "marin" } },
    },
  };

  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    }
  );

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = { error: "INVALID_JSON" };
  }

  if (response.ok && !data?.value && data?.client_secret?.value) {
    data.value = data.client_secret.value;
  }

  return { ok: response.ok, status: response.status, data } as RealtimeTokenResult;
};
