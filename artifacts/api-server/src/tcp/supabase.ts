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

async function upsertLocalizacaoAtual(
  supabase: SupabaseClient,
  data: ParsedGpsData
): Promise<void> {
  const agora = new Date().toISOString();

  const fields = {
    latitude: data.latitude,
    longitude: data.longitude,
    velocidade: data.velocidade ?? null,
    data_gps: data.data_gps ? data.data_gps.toISOString() : null,
    data_recebimento: agora,
    atualizado_em: agora,
    raw_data: data.raw_data,
  };

  // Tenta atualizar primeiro
  const { count, error: updateError } = await supabase
    .from("caminhao_localizacao_atual")
    .update(fields)
    .eq("imei", data.imei)
    .select("imei", { count: "exact", head: true });

  if (updateError) {
    logger.error({ error: updateError, imei: data.imei }, "Erro ao atualizar localização atual");
    throw updateError;
  }

  // Se não existia registro, insere
  if (!count || count === 0) {
    const { error: insertError } = await supabase
      .from("caminhao_localizacao_atual")
      .insert({ imei: data.imei, ...fields });

    if (insertError) {
      logger.error({ error: insertError, imei: data.imei }, "Erro ao inserir localização atual");
      throw insertError;
    }

    logger.info({ imei: data.imei }, "Localização atual inserida (novo registro)");
  } else {
    logger.info({ imei: data.imei }, "Localização atual atualizada");
  }
}

async function insertLocalizacaoHistorico(
  supabase: SupabaseClient,
  data: ParsedGpsData
): Promise<void> {
  const agora = new Date().toISOString();

  const { error } = await supabase
    .from("caminhao_localizacao_historico")
    .insert({
      imei: data.imei,
      latitude: data.latitude,
      longitude: data.longitude,
      velocidade: data.velocidade ?? null,
      data_gps: data.data_gps ? data.data_gps.toISOString() : null,
      data_recebimento: agora,
      atualizado_em: agora,
      raw_data: data.raw_data,
    });

  if (error) {
    logger.error({ error, imei: data.imei }, "Erro ao inserir no histórico");
    throw error;
  }

  logger.info({ imei: data.imei }, "Histórico inserido");
}

export async function saveLocalizacao(data: ParsedGpsData): Promise<void> {
  const supabase = getClient();

  const [atualResult, historicoResult] = await Promise.allSettled([
    upsertLocalizacaoAtual(supabase, data),
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
      "Localização salva em atual e histórico com sucesso"
    );
  }
}
