import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { ParsedGpsData } from "./parser";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }

    client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return client;
}

async function findCaminhaoId(
  supabase: SupabaseClient,
  imei: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("caminhao_localizacao_atual")
    .select("caminhao_id")
    .eq("imei", imei)
    .not("caminhao_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { caminhao_id: number }).caminhao_id;
}

export async function saveLocalizacao(data: ParsedGpsData): Promise<void> {
  const supabase = getClient();

  const caminhao_id = await findCaminhaoId(supabase, data.imei);

  const record: Record<string, unknown> = {
    imei: data.imei,
    latitude: data.latitude,
    longitude: data.longitude,
    velocidade: data.velocidade ?? null,
    data_gps: data.data_gps ? data.data_gps.toISOString() : null,
    raw_data: data.raw_data,
    atualizado_em: new Date().toISOString(),
  };

  if (caminhao_id !== null) {
    record["caminhao_id"] = caminhao_id;
  }

  const { error } = await supabase
    .from("caminhao_localizacao_atual")
    .insert(record);

  if (error) {
    if (error.code === "23502") {
      logger.warn(
        { imei: data.imei },
        "caminhao_id obrigatório e não encontrado para este IMEI. Execute o SQL de migração para tornar a coluna nullable."
      );
    } else {
      logger.error({ error, imei: data.imei }, "Erro ao inserir localização");
    }
    throw error;
  }

  logger.info(
    { imei: data.imei, lat: data.latitude, lon: data.longitude, vel: data.velocidade },
    "Localização salva com sucesso"
  );
}
