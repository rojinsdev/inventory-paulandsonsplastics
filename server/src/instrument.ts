import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { config } from "./config/env";

// 1. Initialize Sentry (MUST be before any other module is loaded)
if (config.sentry.dsn) {
    Sentry.init({
        dsn: config.sentry.dsn,
        integrations: [
            nodeProfilingIntegration(),
        ],
        // Performance Monitoring
        tracesSampleRate: 1.0, 
        profilesSampleRate: 1.0,
        environment: config.nodeEnv,
        // Send default PII like IP address
        sendDefaultPii: true,
    });
    console.log('✅ Sentry (Express v8) initialized');
}
