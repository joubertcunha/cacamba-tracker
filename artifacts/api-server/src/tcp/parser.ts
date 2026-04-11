export interface ParsedGpsData {
  imei: string;
  latitude: number;
  longitude: number;
  velocidade?: number;
  data_gps?: Date;
  raw_data: string;
}

export function parseGpsMessage(raw: string): ParsedGpsData | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(",");

    if (parts.length < 8) return null;

    const firstPart = parts[0];
    if (!firstPart || !firstPart.startsWith("imei:")) return null;

    const imei = firstPart.replace("imei:", "").trim();
    if (!imei || !/^\d{10,20}$/.test(imei)) return null;

    const statusField = parts[1]?.trim();
    if (!statusField) return null;

    const dateTimeStr = parts[2]?.trim();
    const validity = parts[4]?.trim();

    if (!validity || (validity !== "A" && validity !== "F")) return null;

    const latRaw = parts[5]?.trim();
    const lonRaw = parts[7]?.trim();

    if (!latRaw || !lonRaw) return null;

    const latitude = parseFloat(latRaw);
    const longitude = parseFloat(lonRaw);

    if (
      isNaN(latitude) ||
      isNaN(longitude) ||
      !isValidCoordinate(latitude, longitude)
    ) {
      return null;
    }

    let velocidade: number | undefined;
    if (parts.length > 8) {
      const speedRaw = parts[8]?.trim();
      if (speedRaw) {
        const speed = parseFloat(speedRaw);
        if (!isNaN(speed) && speed >= 0) {
          velocidade = speed;
        }
      }
    }

    let data_gps: Date | undefined;
    if (dateTimeStr && dateTimeStr.length === 12) {
      const day = parseInt(dateTimeStr.substring(0, 2));
      const month = parseInt(dateTimeStr.substring(2, 4));
      const year = 2000 + parseInt(dateTimeStr.substring(4, 6));
      const hour = parseInt(dateTimeStr.substring(6, 8));
      const min = parseInt(dateTimeStr.substring(8, 10));
      const sec = parseInt(dateTimeStr.substring(10, 12));

      const d = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
      if (!isNaN(d.getTime())) {
        data_gps = d;
      }
    }

    return {
      imei,
      latitude,
      longitude,
      velocidade,
      data_gps,
      raw_data: trimmed,
    };
  } catch {
    return null;
  }
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0)
  );
}
