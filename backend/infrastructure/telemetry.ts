const { NodeSDK } = require('@opentelemetry/sdk-node');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');

let sdk: any;

const startTelemetry = () => {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true' || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return sdk;
  sdk = new NodeSDK({
    serviceName: 'disciplan-api',
    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span: any, request: any) => {
          const url = 'url' in request ? request.url : undefined;
          if (url) span.setAttribute('http.request.path', String(url).split('?')[0]);
        },
        headersToSpanAttributes: { client: { requestHeaders: [] }, server: { requestHeaders: [] } },
      }),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
    ],
  });
  sdk.start();
  return sdk;
};

const stopTelemetry = async () => {
  if (sdk) await sdk.shutdown();
  sdk = undefined;
};

startTelemetry();

export = { startTelemetry, stopTelemetry };
