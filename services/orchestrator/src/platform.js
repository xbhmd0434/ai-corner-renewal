import { createRoomAnalyzer } from "./adapters/room-analyzer.js";
import { createPromptLabGenerator } from "./adapters/render-generator.js";
import { createLayoutPlanner } from "./adapters/layout-planner.js";
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
import { PromptLabService } from "./services/prompt-lab-service.js";
import { ProductDiscoveryService } from "./services/product-discovery-service.js";
import {
  UnconfiguredProductDiscoveryProvider,
  PlanGroundedDiscoveryProvider
} from "./adapters/product-discovery-agent.js";
import { DemoCommerceCatalogAdapter } from "./adapters/commerce-catalog.js";
import { RelatedDesignService } from "./services/related-design-service.js";
import { PublicationService } from "./services/publication-service.js";
import { CommerceHandoffService } from "./services/commerce-handoff-service.js";

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
  const promptLabService = new PromptLabService({
    config,
    planner: createLayoutPlanner({
      config,
      fetchImpl,
      now: () => now().getTime()
    }),
    generator: createPromptLabGenerator({
      config,
      fetchImpl,
      now: () => now().getTime()
    })
  });

  const discoveryProvider = new UnconfiguredProductDiscoveryProvider();
  const commerceCatalog = new DemoCommerceCatalogAdapter({ now });
  const productDiscoveryService = new ProductDiscoveryService({
    repository: repo,
    mediaService,
    config,
    provider: discoveryProvider,
    catalogAdapter: commerceCatalog,
    fetchImpl,
    now
  });
  const relatedDesignService = new RelatedDesignService({
    repository: repo,
    designRequestService,
    now
  });
  const publicationService = new PublicationService({ repository: repo, now });
  const commerceHandoffService = new CommerceHandoffService({
    repository: repo,
    now,
    config
  });

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
  productDiscoveryService.recover(DEMO_ACTOR_ID);
  relatedDesignService.recover(DEMO_ACTOR_ID);
  publicationService.recover(DEMO_ACTOR_ID);

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
    promptLabService,
    productDiscoveryService,
    relatedDesignService,
    publicationService,
    commerceHandoffService,
    health() {
      return {
        status: "ok",
        service: "ai-corner-renewal-orchestrator",
        service_version: "0.5.2",
        contract_version: "1.0",
        api_versions: ["legacy", "v1"],
        openapi_url: "/api/openapi.json",
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
          list_limit_max: config.listLimitMax,
          product_discovery_max_subjects: 8,
          product_discovery_matches_per_subject: 5
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
        prompt_lab: {
          available: promptLabService.template().available,
          prompt_version: promptLabService.template().prompt_version,
          persistence: "none"
        },
        features: {
          product_discovery: true,
          product_discovery_live_agent: false,
          douyin_commerce_catalog: false,
          renewal_intent_v2: true,
          related_designs: true,
          plan_publication: true,
          implementation_list_v2: true,
          cart_batch_handoff: false
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
    promptLabTemplate() {
      return promptLabService.template();
    },
    async renderPromptLab(request) {
      return promptLabService.render(request);
    },
    createProductDiscoveryRun(actorId, planAssetId, planVersionId, body) {
      return productDiscoveryService.create(actorId, planAssetId, planVersionId, body);
    },
    listProductDiscoveryRuns(actorId, planAssetId, planVersionId, query) {
      return productDiscoveryService.list(actorId, planAssetId, planVersionId, query);
    },
    getProductDiscoveryRun(actorId, runId) {
      return productDiscoveryService.get(actorId, runId);
    },
    cancelProductDiscoveryRun(actorId, runId) {
      return productDiscoveryService.cancel(actorId, runId);
    },
    async close() {
      clearInterval(maintenanceTimer);
      await Promise.all([
        parseService.stop(),
        planService.stop(),
        productDiscoveryService.stop(),
        relatedDesignService.stop(),
        publicationService.stop()
      ]);
      repo.close();
    }
  };
}
