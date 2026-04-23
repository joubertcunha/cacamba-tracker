export interface ParsedGpsData {
  imei: string;
  latitude: number;
  longitude: number;
  velocidade?: number;
  data_gps?: Date;
  raw_data: string;
}

/**
 * Protocolo TK103/TK303 — formato texto CSV
 *
 * Pacote GPS:
 *   imei:IMEI, tracker, DDMMYYHHMMSS, , F/A, HHMMSS.ss, A/V, LAT, S/N, LON, E/W, SPEED, ...
 *   [0]  imei:IMEI
 *   [1]  tracker
 *   [2]  datetime: DDMMYYHHMMSS
 *   [3]  (vazio)
 *   [4]  F = sem fix GPS / A = com fix GPS
 *   [5]  hora UTC: HHMMSS.ss
 *   [6]  A = válido (NMEA) / V = inválido
 *   [7]  latitude: DDMM.MMMMM
 *   [8]  direção lat: N ou S
 *   [9]  longitude: DDDMM.MMMMM
 *   [10] direção lon: E ou W
 *   [11] velocidade (knots) — pode ser vazio
 *
 * Pacote LBS (torre GSM — sem GPS):
 *   imei:IMEI, tracker, , L, , MCC, , CellID, ...
 *   → campo [3] = "L", sem coordenadas: ignorado
 */
export function parseGpsMessage(raw: string): ParsedGpsData | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(",");
    if (parts.length < 7) return null;

    // Deve começar com "imei:"
    const firstPart = parts[0] ?? "";
    if (!firstPart.startsWith("imei:")) return null;

    const imei = firstPart.slice(5).trim();
    if (!imei || !/^\d{10,20}$/.test(imei)) return null;

    // Pacote LBS (tower) → campo [3] = "L", sem coordenadas → ignora
    if ((parts[3] ?? "").trim().toUpperCase() === "L") return null;

    // Validade NMEA: campo [6] deve ser "A"
    const nmeaValid = (parts[6] ?? "").trim().toUpperCase();
    if (nmeaValid !== "A") return null;

    // Coordenadas: lat em DDMM.MMMMM [7]+[8], lon em DDDMM.MMMMM [9]+[10]
    const latRaw  = (parts[7]  ?? "").trim();
    const latDir  = (parts[8]  ?? "").trim().toUpperCase();
    const lonRaw  = (parts[9]  ?? "").trim();
    const lonDir  = (parts[10] ?? "").trim().toUpperCase();

    if (!latRaw || !lonRaw || !latDir || !lonDir) return null;

    const latitude  = nmeaToDecimal(latRaw, latDir, false);
    const longitude = nmeaToDecimal(lonRaw, lonDir, true);

    if (isNaN(latitude) || isNaN(longitude) || !isValidCoordinate(latitude, longitude)) return null;

    // Velocidade: campo [11], em knots → converte para km/h
    let velocidade: number | undefined;
    const speedRaw = (parts[11] ?? "").trim();
    if (speedRaw) {
      const knots = parseFloat(speedRaw);
      if (!isNaN(knots) && knots >= 0) {
        velocidade = Math.round(knots * 1.852 * 10) / 10; // knots → km/h, 1 casa decimal
      }
    }

    // Data/hora: campo [2] = DDMMYYHHMMSS
    const dateTimeStr = (parts[2] ?? "").trim();
    let data_gps: Date | undefined;
    if (dateTimeStr && dateTimeStr.length === 12) {
      const day   = parseInt(dateTimeStr.substring(0, 2));
      const month = parseInt(dateTimeStr.substring(2, 4));
      const year  = 2000 + parseInt(dateTimeStr.substring(4, 6));
      const hour  = parseInt(dateTimeStr.substring(6, 8));
      const min   = parseInt(dateTimeStr.substring(8, 10));
      const sec   = parseInt(dateTimeStr.substring(10, 12));

      const d = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
      if (!isNaN(d.getTime())) data_gps = d;
    }

    return { imei, latitude, longitude, velocidade, data_gps, raw_data: trimmed };
  } catch {
    return null;
  }
}

/**
 * Converte coordenada NMEA (DDMM.MMMMM ou DDDMM.MMMMM) para graus decimais.
 * @param coord  string NMEA (ex: "1957.50793" ou "04412.18896")
 * @param dir    "N" | "S" | "E" | "W"
 * @param isLon  true = longitude (3 dígitos de grau), false = latitude (2 dígitos)
 */
function nmeaToDecimal(coord: string, dir: string, isLon: boolean): number {
  const degLen = isLon ? 3 : 2;
  const deg = parseInt(coord.slice(0, degLen));
  const min = parseFloat(coord.slice(degLen));
  const decimal = deg + min / 60;
  return dir === "S" || dir === "W" ? -decimal : decimal;
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}
