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

/**
 * Resolve o caminhao_id para um IMEI.
 * Ordem de prioridade:
 * 1. Mapeamento por IMEI via env: IMEI_MAP=IMEI1:uuid1,IMEI2:uuid2
 * 2. ID padrão via env: CAMINHAO_ID_DEFAULT=uuid
 */
function resolveCaminhaoId(imei: string): string | null {
  const imeiMap = process.env["IMEI_MAP"] ?? "";
  if (imeiMap) {
    for (const entry of imeiMap.split(",")) {
      const [mappedImei, caminhaoId] = entry.split(":");
      if (mappedImei?.trim() === imei && caminhaoId?.trim()) {
        return caminhaoId.trim();
      }
    }
  }

  const defaultId = process.env["CAMINHAO_ID_DEFAULT"] ?? "";
  if (defaultId) return defaultId.trim();

  return null;
}

async function upsertLocalizacaoAtual(
  supabase: SupabaseClient,
  data: ParsedGpsData,
  caminhao_id: string
): Promise<void> {
  const agora = new Date().toISOString();

  const record = {
    caminhao_id,
    imei: data.imei,
    latitude: data.latitude,
    longitude: data.longitude,
    velocidade: data.velocidade ?? null,
    data_gps: data.data_gps ? data.data_gps.toISOString() : null,
    data_recebimento: agora,
    atualizado_em: agora,
    raw_data: data.raw_data,
  };

  const { error } = await supabase
    .from("caminhao_localizacao_atual")
    .upsert(record, { onConflict: "caminhao_id" });

  if (error) {
    logger.error({ error, imei: data.imei }, "Erro ao atualizar localização atual");
    throw error;
  }

  logger.info({ imei: data.imei, caminhao_id }, "Localização atual atualizada");
}

async function insertLocalizacaoHistorico(
  supabase: SupabaseClient,
  data: ParsedGpsData
): Promise<void> {
  const agora = new Date().toISOString();

  const record = {
    imei: data.imei,
    latitude: data.latitude,
    longitude: data.longitude,
    velocidade: data.velocidade ?? null,
    data_gps: data.data_gps ? data.data_gps.toISOString() : null,
    data_recebimento: agora,
    atualizado_em: agora,
    raw_data: data.raw_data,
  };

  const { error } = await supabase
    .from("caminhao_localizacao_historico")
    .insert(record);

  if (error) {
    logger.error({ error, imei: data.imei }, "Erro ao inserir no histórico");
    throw error;
  }

  logger.info({ imei: data.imei }, "Histórico inserido");
}

export async function saveLocalizacao(data: ParsedGpsData): Promise<void> {
  const supabase = getClient();

  const caminhao_id = resolveCaminhaoId(data.imei);

  if (!caminhao_id) {
    logger.warn(
      { imei: data.imei },
      "caminhao_id não configurado para este IMEI. Defina IMEI_MAP ou CAMINHAO_ID_DEFAULT no .env"
    );
    throw new Error("caminhao_id não resolvido para IMEI: " + data.imei);
  }

  const [atualResult, historicoResult] = await Promise.allSettled([
    upsertLocalizacaoAtual(supabase, data, caminhao_id),
    insertLocalizacaoHistorico(supabase, data),
  ]);

  if (atualResult.status === "rejected") {
    logger.error({ err: atualResult.reason, imei: data.imei }, "Falha ao salvar localização atual");
  }

  if (historicoResult.status === "rejected") {
    logger.error({ err: historicoResult.reason, imei: data.imei }, "Falha ao salvar histórico");
  }

  if (atualResult.status === "fulfilled" && historicoResult.status === "fulfilled") {
    logger.info(
      { imei: data.imei, lat: data.latitude, lon: data.longitude, vel: data.velocidade },
      "Localização salva em atual e histórico"
    );
  }
}
