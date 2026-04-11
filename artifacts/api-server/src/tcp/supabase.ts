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

export async function saveLocalizacao(data: ParsedGpsData): Promise<void> {
  const supabase = getClient();

  const record = {
    imei: data.imei,
    latitude: data.latitude,
    longitude: data.longitude,
    velocidade: data.velocidade ?? null,
    data_gps: data.data_gps ? data.data_gps.toISOString() : null,
    raw_data: data.raw_data,
  };

  const { error } = await supabase
    .from("caminhao_localizacao_atual")
    .insert(record);

  if (error) {
    logger.error({ error, imei: data.imei }, "Erro ao inserir localização");
    throw error;
  }

  logger.info(
    { imei: data.imei, lat: data.latitude, lon: data.longitude },
    "Localização salva com sucesso"
  );
}
