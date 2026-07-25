import { createRoomAnalyzer } from "./adapters/room-analyzer.js";
import { defaultRoomProfile } from "./data/demo-catalog.js";
import { DeterministicAssetUnderstandingAdapter } from "./adapters/asset-understanding.js";
import {
  DATABASE_MIGRATION_VERSION,
  DEMO_ACTOR_ID,
  PersistentCardStore,
  SqliteRepository
} from "./repository.js";
import { SourceIngestionService } from "./services/media-service.js";
import {
  AssetParseService,
  AssetService,
  MatchingService
} from "./services/asset-service.js";
import {
  DesignRequestService,
  PreferenceService
} from "./services/design-service.js";
import { PlanService } from "./services/plan-service.js";
import { EventService } from "./services/event-service.js";

export function createPlatform({
  config,
  now = () => new Date(),
  fetchImpl = globalThis.fetch,
  repository
}) {
  const startedAt = Date.now();
  const repo =
    repository ||
    new SqliteRepository({
      databasePath: config.databasePath,
      now
    });
  const mediaService = new SourceIngestionService({
    repository: repo,
    config,
    now
  });
  const understandingAdapter = new DeterministicAssetUnderstandingAdapter({
    now
  });
  const parseService = new AssetParseService({
    repository: repo,
    adapter: understandingAdapter,
    now
  });
  const assetService = new AssetService({
    repository: repo,
    mediaService,
    parseService,
    matchingService: new MatchingService(),
    config,
    now
  });
  const preferenceService = new PreferenceService({ repository: repo, now });
  const designRequestService = new DesignRequestService({
    repository: repo,
    preferenceService,
    now
  });
  const cardStore = new PersistentCardStore(repo, DEMO_ACTOR_ID);
  const roomAnalyzer = createRoomAnalyzer({
    config,
    defaultRoomProfile,
    fetchImpl
  });
  const planService = new PlanService({
    repository: repo,
    designRequestService,
    mediaService,
    cardStore,
    config,
    roomAnalyzer,
    fetchImpl,
    now
  });
  const eventService = new EventService({ repository: repo, now });

  assetService.seed(DEMO_ACTOR_ID);
  preferenceService.get(DEMO_ACTOR_ID);
  let maintenanceError = null;
  const cleanupExpired = () => {
    try {
      assetService.cleanupExpired(DEMO_ACTOR_ID);
      mediaService.cleanupExpired(DEMO_ACTOR_ID);
      maintenanceError = null;
    } catch (error) {
      maintenanceError = error.code || "maintenance_failed";
    }
  };
  cleanupExpired();
  const maintenanceTimer = setInterval(cleanupExpired, 10 * 60 * 1000);
  maintenanceTimer.unref();
  parseService.recover(DEMO_ACTOR_ID);
  planService.recover(DEMO_ACTOR_ID);

  return {
    actorId: DEMO_ACTOR_ID,
    repository: repo,
    mediaService,
    assetService,
    parseService,
    preferenceService,
    designRequestService,
    planService,
    eventService,
    health() {
      return {
        status: "ok",
        service: "ai-corner-renewal-orchestrator",
        service_version: "0.5.1",
        contract_version: "1.0",
        api_versions: ["legacy", "v1"],
        backend_mode: config.backendMode,
        auth_mode: "demo_fixed_actor",
        actor_id: DEMO_ACTOR_ID,
        room_analyzer_configured:
          config.roomAnalyzerProvider === "gateway"
            ? Boolean(config.roomAnalyzerUrl)
            : config.roomAnalyzerProvider === "agent_plan"
              ? Boolean(config.agentPlanApiKey)
              : false,
        room_analyzer_provider: config.roomAnalyzerProvider,
        room_analyzer_model:
          config.roomAnalyzerProvider === "agent_plan"
            ? config.agentPlanTextModel
            : null,
        render_generator_configured: Boolean(config.agentPlanApiKey),
        render_generator_model: config.agentPlanImageModel,
        persistence: {
          driver: "node:sqlite",
          migration_version: DATABASE_MIGRATION_VERSION,
          database_path_configured: Boolean(config.databasePath)
        },
        limits: {
          request_body_bytes: config.requestBodyLimitBytes,
          upload_file_bytes: config.maxUploadBytes,
          temporary_retention_hours: config.temporaryRetentionHours,
          media_access_ttl_seconds: config.mediaAccessTtlSeconds,
          list_limit_max: config.listLimitMax
        },
        model_capabilities: {
          room_analysis:
            config.roomAnalyzerProvider === "agent_plan"
              ? "agent_plan_configured"
              : config.roomAnalyzerProvider === "gateway"
                ? "gateway_configured"
                : "deterministic_demo",
          asset_understanding: "deterministic_demo",
          segmentation: "deterministic_demo_bbox",
          render_edit: config.agentPlanApiKey
            ? "agent_plan_configured"
            : "demo_fallback",
          agent_planning: "deterministic_workflow"
        },
        repository_counts: repo.stats,
        maintenance: {
          cleanup_interval_seconds: 600,
          last_error_code: maintenanceError
        },
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000)
      };
    },
    async generate(request) {
      return planService.generateLegacy(DEMO_ACTOR_ID, request);
    },
    async revise(request) {
      return planService.reviseLegacy(DEMO_ACTOR_ID, request);
    },
    async close() {
      clearInterval(maintenanceTimer);
      await Promise.all([parseService.stop(), planService.stop()]);
      repo.close();
    }
  };
}
