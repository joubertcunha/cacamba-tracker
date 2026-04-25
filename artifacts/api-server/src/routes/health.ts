import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const startTime = Date.now();

router.get("/healthz", (_req, res) => {
  const healthSchema = HealthCheckResponse.passthrough();
  const data = healthSchema.parse({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
  res.json(data);
});

export default router;
