import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { env } from './env.js';
import { logger } from './logger.js';

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  try {
    const spanProcessors = [];

    // Specific HTTP transport for OTLP exporter if endpoint is configured
    if (env.OTEL_EXPORTER_OTLP_ENDPOINT && env.OTEL_EXPORTER_OTLP_ENDPOINT.trim() !== '') {
      const otlpExporter = new OTLPTraceExporter({
        url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
      });
      spanProcessors.push(new BatchSpanProcessor(otlpExporter));
      logger.info({ endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT }, 'OpenTelemetry OTLP HTTP trace exporter registered');
    } else if (env.OTEL_DEBUG && env.NODE_ENV === 'development') {
      // Avoid routine console span dumps outside explicit debug mode
      spanProcessors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
      logger.info('OpenTelemetry Console trace exporter enabled for debugging');
    }

    if (spanProcessors.length > 0) {
      sdk = new NodeSDK({
        serviceName: env.OTEL_SERVICE_NAME,
        spanProcessors,
      });
      sdk.start();
      logger.info('OpenTelemetry tracing initialized successfully');
    } else {
      logger.debug('OpenTelemetry initialized with default no-op tracing (no exporter configured)');
    }
  } catch (error) {
    // Non-fatal fallback: server continues startup even if tracing initialization fails
    logger.warn({ err: error }, 'OpenTelemetry initialization encountered an error; falling back to no-op');
  }
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      logger.info('OpenTelemetry tracing shutdown completed');
    } catch (error) {
      logger.error({ err: error }, 'Error shutting down OpenTelemetry tracing');
    }
  }
}
